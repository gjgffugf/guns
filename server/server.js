/**
 * 破绷战场 —— 联机服务器（Node.js，零依赖）
 *
 * 手机 Termux：pkg install nodejs && node server.js
 * 电脑：       node server.js
 *
 * ★ 只做房间里玩家之间的状态转发，不含任何 AI / 陪练机器人。
 */

const dgram = require('node:dgram');
const http = require('node:http');
const crypto = require('node:crypto');
const os = require('node:os');

const SERVER_NAME = process.env.BB_NAME || '破绷战场';
const PORT = Number(process.env.BB_PORT || 19000);
const HTTP_PORT = Number(process.env.BB_HTTP_PORT || PORT + 1);
const MAX_PLAYERS = Number(process.env.BB_MAX || 16);
const TICK = 1000 / 20;              // 20Hz 广播
const TIMEOUT = 15000;               // 15 秒无心跳踢出

/** @type {Map<string, {id:string,name:string,addr:string,port:number,x:number,y:number,z:number,yaw:number,pitch:number,hp:number,stance:string,kills:number,deaths:number,last:number}>} */
const players = new Map();

const server = dgram.createSocket('udp4');
let seq = 0;

function send(msg, addr, port) {
  try {
    const buf = Buffer.from(JSON.stringify(msg), 'utf8');
    server.send(buf, 0, buf.length, port, addr);
  } catch (e) {
    console.warn('发送失败', e.message);
  }
}

function snapshot() {
  return Array.from(players.values()).map((p) => ({
    id: p.id, name: p.name,
    x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3),
    yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3),
    hp: p.hp, stance: p.stance, kills: p.kills, deaths: p.deaths,
  }));
}

/** 广播快照：WebSocket 走帧，UDP 走数据报 */
function broadcast(exceptId) {
  const msg = { t: 'state', seq: ++seq, players: snapshot() };
  const buf = Buffer.from(JSON.stringify(msg), 'utf8');
  const frame = encodeFrame(buf);
  for (const p of players.values()) {
    if (p.id === exceptId) continue;
    try {
      if (p.kind === 'ws' && p.conn) p.conn.write(frame);
      else server.send(buf, 0, buf.length, p.port, p.addr);
    } catch { /* 忽略单个失败 */ }
  }
}

/** 给某个玩家单独发一条（WS 或 UDP 都支持） */
function sendTo(p, obj) {
  if (!p) return;
  try {
    if (p.kind === 'ws' && p.conn) {
      p.conn.write(encodeFrame(Buffer.from(JSON.stringify(obj), 'utf8')));
    } else {
      const b = Buffer.from(JSON.stringify(obj), 'utf8');
      server.send(b, 0, b.length, p.port, p.addr);
    }
  } catch { /* 忽略 */ }
}

let idSeed = 0;
function newId() {
  idSeed += 1;
  return `${Date.now().toString(36)}${idSeed.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** ★ WebSocket 服务端（手写，零依赖）
 *
 *  为什么需要：浏览器 / WebView 里发不出 UDP 包，只能走 WebSocket。
 *  TCP 的 19000 与 UDP 的 19000 可以共存 —— 协议不同，端口不冲突。
 */

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeFrame(buf) {
  const n = buf.length;
  let head;
  if (n < 126) {
    head = Buffer.from([0x81, n]);
  } else if (n < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x81; head[1] = 126;
    head.writeUInt16BE(n, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x81; head[1] = 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, buf]);
}

function parseFrames(chunk, state) {
  const out = [];
  let buf = state.tail ? Buffer.concat([state.tail, chunk]) : chunk;
  for (;;) {
    if (buf.length < 2) break;
    const op = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let n = buf[1] & 0x7f;
    let off = 2;
    if (n === 126) {
      if (buf.length < off + 2) break;
      n = buf.readUInt16BE(off); off += 2;
    } else if (n === 127) {
      if (buf.length < off + 8) break;
      n = Number(buf.readBigUInt64BE(off)); off += 8;
    }
    const maskLen = masked ? 4 : 0;
    if (buf.length < off + maskLen + n) break;
    let payload = buf.subarray(off + maskLen, off + maskLen + n);
    if (masked) {
      const mask = buf.subarray(off, off + 4);
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }
    off += maskLen + n;
    out.push({ op, payload });
    buf = buf.subarray(off);
  }
  state.tail = buf;
  return out;
}

function wsSend(socket, obj) {
  try { socket.write(encodeFrame(Buffer.from(JSON.stringify(obj), 'utf8'))); } catch { /* 忽略 */ }
}

function addWsPlayer(socket, addr) {
  const id = newId();
  const p = {
    id, name: '玩家', kind: 'ws', conn: socket, addr,
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
    hp: 100, stance: 'stand', kills: 0, deaths: 0,
    last: Date.now(), dead: false,
  };
  players.set(id, p);
  return p;
}

/**
 * 处理一条 WS 消息。语义与 UDP 分支保持一致：
 * join / state / ping / hit / leave。
 */
/** 已入场（发过 join）且未离场的玩家数 */
function countOnline() {
  return [...players.values()].filter((x) => x.joined && !x.dead).length;
}

function handleWsMsg(p, msg) {
  switch (msg.t) {
    // ★ 只查状态不建号：客户端在游戏外测延迟/人数用，
    //   走 join 会真的占一个位置，房间里会闪现一个幽灵玩家。
    case 'query': {
      // 只统计已 join 的：WS 握手后自己已在 players 里，
      // 不加这个过滤探测者会把【自己】算进去。
      sendTo(p, { t: 'info', online: countOnline(), max: MAX_PLAYERS });
      return;
    }
    case 'join': {
      p.joined = true;            // ★ 真正入场，才计入在线人数
      p.name = String(msg.name || '玩家').slice(0, 16);
      // welcome 不包自己：否则客户端会把自己的模型也画一份
      const others = snapshot().filter((x) => x.id !== p.id);
      sendTo(p, { t: 'welcome', id: p.id, players: others, max: MAX_PLAYERS });
      console.log(`[+] ${p.name} 加入（ws），当前 ${players.size} 人`);
      return;
    }
    case 'state': {
      for (const k of ['x', 'y', 'z', 'yaw', 'pitch']) {
        const v = Number(msg[k]);
        if (Number.isFinite(v)) p[k] = v;
      }
      const hp = Number(msg.hp);
      if (Number.isFinite(hp)) p.hp = hp;
      if (['stand', 'crouch', 'prone'].includes(msg.stance)) p.stance = msg.stance;
      p.kills = Number(msg.kills) || 0;
      p.deaths = Number(msg.deaths) || 0;
      return;
    }
    case 'ping':
      sendTo(p, { t: 'pong', ts: msg.ts || 0 });
      return;
    case 'hit': {
      const t = players.get(msg.target);
      const dmg = Number(msg.damage);
      if (!t || !Number.isFinite(dmg) || dmg <= 0 || dmg > 200) return;
      if (t.hp <= 0) return;
      t.hp = Math.max(0, t.hp - Math.round(dmg));
      sendTo(t, { t: 'hit', from: p.id, damage: Math.round(dmg), head: !!msg.head });
      if (t.hp <= 0) {
        t.deaths += 1;
        p.kills += 1;
        const kill = { t: 'kill', killer: p.id, victim: t.id };
        for (const q of players.values()) sendTo(q, kill);
        console.log(`[kill] ${p.name} -> ${t.name}`);
      }
      return;
    }
    case 'leave':
      p.dead = true;
      return;
    default:
  }
}

const wsServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('破绷战场 WebSocket 端口，请用 ws:// 连接');
});

wsServer.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1')
    .update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n'
    + 'Upgrade: websocket\r\n'
    + 'Connection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  socket.setNoDelay(true);

  const p = addWsPlayer(socket, req.socket.remoteAddress);
  const state = { tail: null };

  socket.on('data', (chunk) => {
    for (const f of parseFrames(chunk, state)) {
      if (f.op === 0x8) { socket.destroy(); return; }
      if (f.op !== 0x1) continue;
      let msg;
      try { msg = JSON.parse(f.payload.toString('utf8')); } catch { continue; }
      p.last = Date.now();
      handleWsMsg(p, msg);
      if (p.dead) { socket.destroy(); return; }
    }
  });
  socket.on('error', () => { /* 忽略 */ });
  socket.on('close', () => {
    console.log(`[-] ${p.name} 离开（ws），当前 ${players.size} 人`);
    players.delete(p.id);
  });
});

server.on('message', (raw, rinfo) => {
  let msg;
  try {
    msg = JSON.parse(raw.toString('utf8'));
  } catch {
    return;
  }
  if (!msg || typeof msg.t !== 'string') return;

  const addr = rinfo.address;
  const port = rinfo.port;

  switch (msg.t) {
    case 'join': {
      if (players.size >= MAX_PLAYERS && !players.has(msg.id)) {
        send({ t: 'reject', reason: '房间已满' }, addr, port);
        return;
      }
      const rec = players.get(msg.id) || {
        id: String(msg.id), kills: 0, deaths: 0,
      };
      rec.name = String(msg.name || '玩家').slice(0, 16);
      rec.addr = addr;
      rec.port = port;
      rec.x = Number(msg.x) || 0;
      rec.y = Number(msg.y) || 0;
      rec.z = Number(msg.z) || 0;
      rec.yaw = Number(msg.yaw) || 0;
      rec.pitch = Number(msg.pitch) || 0;
      rec.hp = Number.isFinite(msg.hp) ? msg.hp : 100;
      rec.stance = ['stand', 'crouch', 'prone'].includes(msg.stance) ? msg.stance : 'stand';
      rec.last = Date.now();
      players.set(rec.id, rec);
      send({ t: 'welcome', id: rec.id, tick: TICK, max: MAX_PLAYERS }, addr, port);
      console.log(`[加入] ${rec.name} ${addr}:${port}（当前 ${players.size} 人）`);
      return;
    }

    case 'state': {
      const p = players.get(msg.id);
      if (!p) {
        // 未加入就发状态，要求重新加入
        send({ t: 'needjoin' }, addr, port);
        return;
      }
      p.addr = addr;          // 允许地址变化（切换网络）
      p.port = port;
      p.x = Number(msg.x) || 0;
      p.y = Number(msg.y) || 0;
      p.z = Number(msg.z) || 0;
      p.yaw = Number(msg.yaw) || 0;
      p.pitch = Number(msg.pitch) || 0;
      p.hp = Number.isFinite(msg.hp) ? p.hp : p.hp;
      p.stance = ['stand', 'crouch', 'prone'].includes(msg.stance) ? msg.stance : p.stance;
      p.last = Date.now();
      return;
    }

    case 'hit': {
      // 命中上报：由被击中者客户端校验并上报，服务端只转发与计分
      const target = players.get(msg.target);
      if (!target) return;
      target.hp = Math.max(0, Number(msg.hp) || 0);
      if (target.hp === 0) {
        target.deaths += 1;
        const shooter = players.get(msg.id);
        if (shooter && shooter.id !== target.id) shooter.kills += 1;
      }
      send({ t: 'hit', from: msg.id, dmg: msg.dmg, hp: target.hp }, target.addr, target.port);
      return;
    }

    case 'ping': {
      send({ t: 'pong', ts: msg.ts }, addr, port);
      return;
    }

    case 'query': {
      // 服务器列表查询：返回延迟与在线人数
      send({
        t: 'info',
        name: process.env.BB_NAME || '破绷战场',
        map: 'arena',
        players: players.size,
        max: MAX_PLAYERS,
        ts: msg.ts,
      }, addr, port);
      return;
    }

    case 'leave': {
      const p = players.get(msg.id);
      if (p) {
        console.log(`[离开] ${p.name}`);
        players.delete(msg.id);
      }
      return;
    }

    default:
      return;
  }
});

wsServer.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket 监听 ws://0.0.0.0:${PORT}`);
});

/** ★ 列出局域网 IP —— 玩家要填的是这个，不是 127.0.0.1。
 *
 *  最常见的连不上其实是地址填错：在手机上开服、用另一台设备连，
 *  却填了 127.0.0.1，那指向的是设备自己。启动就打印出来省得猜。
 */
function lanIPs() {
  const out = [];
  try {
    const nets = os.networkInterfaces();
    for (const list of Object.values(nets)) {
      for (const n of list || []) {
        if (n.family === 'IPv4' && !n.internal) out.push(n.address);
      }
    }
  } catch { /* 忽略 */ }
  return out;
}

server.on('listening', () => {
  const a = server.address();
  console.log(`破绷战场服务器已启动  UDP ${a.address}:${a.port}`);
  console.log(`最多 ${MAX_PLAYERS} 人，广播 ${1000 / TICK}Hz`);
  const ips = lanIPs();
  if (ips.length) {
    console.log(`客户端地址填：${ips.map((i) => `${i}:${PORT}`).join(' 或 ')}`);
  }
  console.log(`本机自测可填：127.0.0.1:${PORT}`);
  console.log(`端口：WS ${PORT}（TCP），状态页 ${HTTP_PORT}`);
});

server.bind(PORT, '0.0.0.0');

// ---- 超时清理 ----
setInterval(() => {
  const now = Date.now();
  for (const [id, p] of players) {
    if (now - p.last > TIMEOUT) {
      console.log(`[超时] ${p.name}`);
      players.delete(id);
    }
  }
}, 5000);

// ---- 广播循环 ----
setInterval(() => broadcast(null), TICK);

// ---- 简易 HTTP 状态页（便于查看是否活着）----
http.createServer((req, res) => {
  // ★ 与 Python 版 /info 返回同样的字段，客户端才能正确显示在线人数
  //   （少了 online 字段，服务器列表里会显示 undefined）
  const url = req.url || '/';
  const info = {
    name: SERVER_NAME,
    online: countOnline(),
    max: MAX_PLAYERS,
    version: '0.2.6',
    map: 'arena',
    udp: PORT,
    list: snapshot().map((p) => ({ name: p.name, hp: p.hp, k: p.kills, d: p.deaths })),
  };
  if (url.startsWith('/info')) {
    // ★ 必须给 Content-Length，否则 Node 会用 Transfer-Encoding: chunked，
    //   简易客户端（包括游戏里的状态查询）解析不出 JSON。
    const body = Buffer.from(JSON.stringify(info), 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Content-Length': body.length,
      Connection: 'close',
    });
    res.end(body);
    return;
  }
  const html = Buffer.from(`<html><body><h3>${SERVER_NAME}</h3>`
    + `<p>在线 ${players.size} / ${MAX_PLAYERS}</p>`
    + `<p>WebSocket: ws://HOST:${PORT}</p></body></html>`, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': html.length,
    Connection: 'close',
  });
  res.end(html);
}).listen(HTTP_PORT, () => {
  console.log(`状态页  http://0.0.0.0:${HTTP_PORT}/`);
});

process.on('SIGINT', () => { console.log('\n正在关闭…'); server.close(); process.exit(0); });

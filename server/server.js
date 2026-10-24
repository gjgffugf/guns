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

function broadcast(exceptId) {
  const msg = { t: 'state', seq: ++seq, players: snapshot() };
  const buf = Buffer.from(JSON.stringify(msg), 'utf8');
  for (const p of players.values()) {
    if (p.id === exceptId) continue;
    try {
      server.send(buf, 0, buf.length, p.port, p.addr);
    } catch { /* 忽略单个失败 */ }
  }
}

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

server.on('listening', () => {
  const a = server.address();
  console.log(`破绷战场服务器已启动  UDP ${a.address}:${a.port}`);
  console.log(`最多 ${MAX_PLAYERS} 人，广播 ${1000 / TICK}Hz`);
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
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    ok: true, udp: PORT, players: players.size, max: MAX_PLAYERS,
    list: snapshot().map((p) => ({ name: p.name, hp: p.hp, k: p.kills, d: p.deaths })),
  }));
}).listen(HTTP_PORT, () => {
  console.log(`状态页  http://0.0.0.0:${HTTP_PORT}/`);
});

process.on('SIGINT', () => { console.log('\n正在关闭…'); server.close(); process.exit(0); });

/**
 * 服务端冒烟测试（零依赖）。
 * 启动临时服务器，验证 query / join / ping / state 四件事。
 *   node server/test.js
 */
const { spawn } = require('node:child_process');
const dgram = require('node:dgram');
const path = require('node:path');

const PORT = Number(process.env.BB_TEST_PORT || 19600);
const HTTP_PORT = PORT + 1;
const HOST = '127.0.0.1';

const proc = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: { ...process.env, BB_PORT: String(PORT), BB_HTTP_PORT: String(HTTP_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let failed = 0;
const ok = (cond, name, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failed++;
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await wait(1200);

  const c = dgram.createSocket('udp4');
  const seen = { welcome: null, pong: null, info: null, states: 0 };
  c.on('message', (m) => {
    let o;
    try { o = JSON.parse(m.toString()); } catch { return; }
    if (o.t === 'welcome') seen.welcome = o;
    else if (o.t === 'pong') seen.pong = o;
    else if (o.t === 'info') seen.info = o;
    else if (o.t === 'state') seen.states++;
  });
  const send = (o) => {
    const b = Buffer.from(JSON.stringify(o));
    c.send(b, 0, b.length, PORT, HOST);
  };

  await new Promise((r) => c.bind(0, r));

  // 1) 服务器信息查询（不必先加入）
  send({ t: 'query', ts: Date.now() });
  await wait(400);
  ok(seen.info !== null, 'query -> info 返回服务器信息',
    seen.info ? `在线 ${seen.info.players}/${seen.info.max}` : '');

  // 2) 加入
  send({ t: 'join', id: 'p1', name: '测试兵', x: 1, y: 0, z: 2, yaw: 0, pitch: 0, stance: 'stand' });
  await wait(400);
  ok(seen.welcome !== null, 'join -> welcome 加入成功');

  // 3) 延迟
  const ts = Date.now();
  send({ t: 'ping', ts });
  await wait(400);
  ok(seen.pong !== null, 'ping -> pong 测延迟',
    seen.pong ? `${Date.now() - seen.pong.ts}ms` : '');

  // 4) 状态广播
  send({ t: 'state', id: 'p1', x: 5, y: 0, z: 5, yaw: 1, pitch: 0, stance: 'crouch' });
  await wait(900);
  ok(seen.states > 0, 'state 广播收到快照', `${seen.states} 次`);

  // 5) HTTP 状态页
  const httpOk = await new Promise((resolve) => {
    require('node:http').get(`http://${HOST}:${HTTP_PORT}/`, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(body).ok === true); } catch { resolve(false); }
      });
    }).on('error', () => resolve(false));
  });
  ok(httpOk, 'HTTP 状态页可访问');

  c.close();
  proc.kill();

  console.log(failed === 0 ? '\n服务端冒烟测试全部通过' : `\n${failed} 项失败`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('测试异常', e);
  proc.kill();
  process.exit(1);
});

import { test } from 'node:test';
import * as assert from 'node:assert';
import { v3 } from '../src/core/vec';
import {
  resolveAgainst, clampToBounds, sweepMove, insideAny, type Cylinder,
} from '../src/game/collide';
import { createPlayer, step, DEFAULT_TUNING, type PlayerInput, type StepWorld } from '../src/game/player';
import { ARENA, groundHeight } from '../src/game/world';

const R = 0.42;
const BOX: Cylinder[] = [{ pos: v3(10, 0, 0), r: 2.3, h: 2.0 }];

function world(obs: Cylinder[], bounds = ARENA - 0.6): StepWorld {
  return { bounds, obstacles: obs, radius: R, heightAt: groundHeight };
}

const NOINPUT: PlayerInput = {
  axisX: 0, axisY: 0, jumpPressed: false,
  wantCrouch: false, wantProne: false, autoSprint: false,
};

test('★ 碰撞: 走进箱子会被挡住，不会穿过去', () => {
  const w = world(BOX);
  // 从 x=5 一路朝 +x 冲向 x=10 的箱子
  let p = createPlayer(v3(5, 0, 0));
  for (let i = 0; i < 400; i++) {
    p = step(p, { ...NOINPUT, axisY: -1 }, 1 / 60, DEFAULT_TUNING, w);
    // 朝 +x：yaw = π/2
    p.yaw = Math.PI / 2;
  }
  const d = Math.hypot(p.pos.x - 10, p.pos.z);
  assert.ok(d >= 2.3 + R - 0.05,
    `不应进入箱子内部，实际到圆心距离 ${d.toFixed(3)}（需 ≥ ${(2.3 + R).toFixed(2)}）`);
  assert.ok(p.pos.x < 10, `应停在箱子近侧，实际 x=${p.pos.x.toFixed(2)}`);
});

test('★ 碰撞: 走不出场外', () => {
  const w = world([], ARENA);
  let p = createPlayer(v3(0, 0, 0));
  p.yaw = Math.PI / 2;                    // 朝 +x
  for (let i = 0; i < 1200; i++) {
    p = step(p, { ...NOINPUT, axisY: -1 }, 1 / 60, DEFAULT_TUNING, w);
    p.yaw = Math.PI / 2;
  }
  assert.ok(Math.abs(p.pos.x) <= ARENA - R + 0.05,
    `x 应被限制在 ±${ARENA - R}，实际 ${p.pos.x.toFixed(2)}`);
  assert.ok(Math.abs(p.pos.z) <= ARENA - R + 0.05, `z 越界: ${p.pos.z.toFixed(2)}`);
});

test('★ 碰撞: 沿斜坡能登上中央高台（不会被侧面挡在外面）', () => {
  // 高台本身不是障碍物（否则会在坡底把人挡住），只由 groundHeight 提供高度
  const w = world([]);
  let p = createPlayer(v3(0, 0, 14));
  let maxY = 0;
  for (let i = 0; i < 600; i++) {
    p.yaw = 0;                              // yaw=0 时前进方向是 -z
    p = step(p, { ...NOINPUT, axisY: -1 }, 1 / 60, DEFAULT_TUNING, w);
    maxY = Math.max(maxY, p.pos.y);
  }
  assert.ok(maxY >= 2.35,
    `一路走过去应该踩上台面(2.4)，实际最高只到 ${maxY.toFixed(2)}`);
});

test('碰撞: 站在箱子顶上不会被推开', () => {
  const box: Cylinder[] = [{ pos: v3(0, 0, 0), r: 2.3, h: 2.0 }];
  const at = resolveAgainst(v3(0, 2.0, 0), R, 2.0, box);
  assert.equal(at.x, 0, '在顶部不该被推');
  assert.equal(at.z, 0, '在顶部不该被推');
});

test('碰撞: 贴着箱子侧面会被推到表面外', () => {
  const box: Cylinder[] = [{ pos: v3(0, 0, 0), r: 2.3, h: 2.0 }];
  const at = resolveAgainst(v3(0.5, 0, 0), R, 0.5, box);
  const d = Math.hypot(at.x, at.z);
  assert.ok(Math.abs(d - (2.3 + R)) < 1e-6, `应被推到 ${2.3 + R}，实际 ${d}`);
});

test('碰撞: 恰好落在圆心也不会产生 NaN', () => {
  const box: Cylinder[] = [{ pos: v3(0, 0, 0), r: 2.3, h: 2.0 }];
  const at = resolveAgainst(v3(0, 0, 0), R, 0, box);
  assert.ok(Number.isFinite(at.x) && Number.isFinite(at.z), '不应出现 NaN');
  assert.ok(Math.hypot(at.x, at.z) > 2.3, '应被推出去');
});

test('碰撞: 边界夹取留出身位', () => {
  const p = clampToBounds(v3(100, 0, -100), R, ARENA);
  assert.equal(p.x, ARENA - R);
  assert.equal(p.z, -(ARENA - R));
});

test('★ 碰撞: sweepMove 不允许穿过障碍物（高速也不穿）', () => {
  const box: Cylinder[] = [{ pos: v3(0, 0, 0), r: 2.3, h: 3 }];
  // 一帧从 -5 跨到 +5，中间隔着箱子
  const to = sweepMove(v3(-5, 0, 0), v3(5, 0, 0), R, 0, box, 30);
  assert.ok(to.x <= -1, `应被挡在近侧，实际 x=${to.x}`);
  assert.ok(!insideAny(to, R, box), '终点不应在障碍内');
});

test('碰撞: 无障碍时 sweepMove 不截断位移', () => {
  const to = sweepMove(v3(-5, 0, 0), v3(5, 0, 0), R, 0, [], 30);
  assert.equal(to.x, 5);
});

test('碰撞: 沿墙滑行仍能前进（不会被完全卡死）', () => {
  const wall: Cylinder[] = [{ pos: v3(10, 0, 0), r: 2.3, h: 3 }];
  const w = world(wall);
  let p = createPlayer(v3(5, 0, 0));
  // 朝 +x 顶着箱子，同时朝 +z 走
  for (let i = 0; i < 240; i++) {
    p.yaw = Math.PI / 2;
    p = step(p, { ...NOINPUT, axisY: -1, axisX: 1 }, 1 / 60, DEFAULT_TUNING, w);
  }
  assert.ok(p.pos.z > 2, `顶着墙也应该能沿墙滑动，实际 z=${p.pos.z.toFixed(2)}`);
});

test('碰撞: 高台上表面高度正确（中央为台高）', () => {
  assert.ok(Math.abs(groundHeight(0, 0) - 2.4) < 1e-6, '中心应是台高');
  assert.equal(groundHeight(25, 25), 0, '远处应是地面');
});

test('碰撞: 斜坡高度连续，没有台阶', () => {
  let prev = groundHeight(6, 0);
  for (let d = 6.05; d <= 10.6; d += 0.05) {
    const h = groundHeight(d, 0);
    assert.ok(h >= 0 && h <= 2.4 + 1e-9, `高度越界 ${h}`);
    assert.ok(prev - h < 0.1, `坡度太陡 d=${d} ${prev}->${h}`);
    prev = h;
  }
});

test('碰撞: 斜坡上下都不会把人卡住（能上也能下）', () => {
  const w = world([]);
  let p = createPlayer(v3(0, 0, 14));
  const ys: number[] = [];
  for (let i = 0; i < 900; i++) {
    p.yaw = 0;
    p = step(p, { ...NOINPUT, axisY: -1 }, 1 / 60, DEFAULT_TUNING, w);
    ys.push(p.pos.y);
  }
  assert.ok(Math.max(...ys) >= 2.35, '应登上台面');
  assert.ok(ys[ys.length - 1] < 0.5, '走过去后应回到地面');
});

test('碰撞: 不传世界时退化为平地无碰撞（向后兼容）', () => {
  let p = createPlayer(v3(0, 0, 0));
  p.yaw = Math.PI / 2;
  p = step(p, { ...NOINPUT, axisY: -1 }, 1 / 60, DEFAULT_TUNING);
  assert.ok(p.pos.x > 0, '无世界时应自由移动');
});

// ---------------- 人机行为 ----------------
import { createBot, stepBot, type BotWorld } from '../src/game/bot';

const BW: BotWorld = {
  playerPos: v3(0, 0, 0),
  playerAlive: true,
  bounds: 29.4,
  obstacles: [],
  radius: 0.42,
  heightAt: groundHeight,
};

test('★ 人机: 交战时不会一直绕着玩家转圈', () => {
  // 把人放在交战距离内，跑一段时间，看它相对玩家的方位角漂移多少
  const b = createBot('测试兵', v3(0, 0, 12));
  let bot = b;
  const angles: number[] = [];
  for (let i = 0; i < 900; i++) {
    const r = stepBot(bot, BW, 1 / 60, DEFAULT_TUNING);
    bot = r.bot;
    angles.push(Math.atan2(bot.state.pos.x, bot.state.pos.z));
  }
  // 统计累计转角（相邻帧角度差之累加，取绝对值上界）
  let total = 0;
  for (let i = 1; i < angles.length; i++) {
    let d = angles[i] - angles[i - 1];
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    total += Math.abs(d);
  }
  assert.ok(total < 6.5,
    `15 秒内绕圈总转角应有限（旧版会一直转），实际 ${total.toFixed(2)} rad`);
});

test('人机: 交战时保持大致距离，不会贴脸也不会跑掉', () => {
  let bot = createBot('测试兵', v3(0, 0, 12));
  const ds: number[] = [];
  for (let i = 0; i < 900; i++) {
    const r = stepBot(bot, BW, 1 / 60, DEFAULT_TUNING);
    bot = r.bot;
    if (i > 120) ds.push(Math.hypot(bot.state.pos.x, bot.state.pos.z));
  }
  const avg = ds.reduce((a, c) => a + c, 0) / ds.length;
  assert.ok(avg > 6 && avg < 24,
    `平均交战距离应在 6~24 之间，实际 ${avg.toFixed(2)}`);
});

test('人机: 不会走出地图边界', () => {
  let bot = createBot('测试兵', v3(0, 0, 12));
  for (let i = 0; i < 1800; i++) {
    bot = stepBot(bot, BW, 1 / 60, DEFAULT_TUNING).bot;
    assert.ok(Math.abs(bot.state.pos.x) <= 29.4 && Math.abs(bot.state.pos.z) <= 29.4,
      `越界: ${bot.state.pos.x}, ${bot.state.pos.z}`);
  }
});

test('人机: 巡逻时会换目标点（不是原地不动）', () => {
  let bot = createBot('测试兵', v3(0, 0, 12));
  const seen = new Set<string>();
  for (let i = 0; i < 3000; i++) {
    // 玩家很远，强制巡逻
    bot = stepBot(bot, { ...BW, playerPos: v3(999, 0, 999), playerAlive: true },
      1 / 60, DEFAULT_TUNING).bot;
    seen.add(`${Math.round(bot.target.x)},${Math.round(bot.target.z)}`);
  }
  assert.ok(seen.size >= 2, `巡逻点应有变化，实际 ${seen.size} 个`);
});

import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  defaultSettings, sanitize, FPS_OPTIONS, SETTINGS_KEY, type Settings,
} from '../src/core/settings';
import { createMeter, tickMeter, shouldRender, createAccum, pump } from '../src/core/loop';
import { createBot, stepBot, hurtBot, BOT_TUNING, type BotWorld } from '../src/game/bot';

/** 测试用世界：30 的方形场地，中间没有障碍 */
const WORLD: BotWorld = {
  playerPos: { x: 0, y: 0, z: 0 },
  playerAlive: true,
  bounds: 30,
  obstacles: [],
  radius: 0.42,
  heightAt: () => 0,
};
import { DEFAULT_TUNING } from '../src/game/player';
import { raycastTarget, dirFrom, pickTarget, eyePos } from '../src/game/combat';
import { v3 } from '../src/core/vec';

// ---------------- 设置 ----------------

test('设置: 默认 FPS 为 60', () => {
  assert.equal(defaultSettings().targetFps, 60);
});

test('设置: 支持的帧率档位', () => {
  assert.deepEqual([...FPS_OPTIONS], [60, 90, 120, 144]);
});

test('设置: sanitize 把非法值夹回合法范围', () => {
  const s = sanitize({ targetFps: 9999, sensitivity: -5, masterVolume: 5, serverPort: 0 });
  assert.equal(s.targetFps, 60, '非法帧率应回落 60');
  assert.ok(s.sensitivity >= 0.1, '灵敏度应被夹到下限');
  assert.ok(s.masterVolume <= 1, '音量应被夹到上限');
  assert.ok(s.serverPort >= 1, '端口应合法');
});

test('设置: 合法帧率档位被保留', () => {
  for (const f of FPS_OPTIONS) {
    assert.equal(sanitize({ targetFps: f }).targetFps, f, `${f} 应被保留`);
  }
});

test('设置: 坏数据不抛异常，回落到默认', () => {
  for (const bad of [null, undefined, 42, 'x', [], { controls: 'no' }]) {
    const s = sanitize(bad);
    assert.equal(s.targetFps, 60, '应回落到默认');
    assert.ok(s.controls.fire, '控件应有默认值');
  }
});

test('设置: 控件越界被夹回屏幕内', () => {
  const s = sanitize({ controls: { fire: { x: 5, y: -3, s: 99, a: -1 } } });
  assert.ok(s.controls.fire.x <= 0.97 && s.controls.fire.x >= 0.03, 'x 应在安全区');
  assert.ok(s.controls.fire.y <= 0.96 && s.controls.fire.y >= 0.04, 'y 应在安全区');
  assert.ok(s.controls.fire.s <= 2.0, '缩放应受限');
  assert.ok(s.controls.fire.a >= 0.25, '透明度应受限');
});

test('设置: 存取往返一致', () => {
  const mem = new Map<string, string>();
  const fake = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  // 直接验证序列化/反序列化不丢字段
  const orig: Settings = { ...defaultSettings(), targetFps: 144, playerName: '测试员' };
  const s = sanitize(JSON.parse(JSON.stringify(orig)));
  assert.equal(s.targetFps, 144);
  assert.equal(s.playerName, '测试员');
  assert.ok(s.controls.jump, '控件应保留');
  assert.equal(SETTINGS_KEY, 'bb.settings.v1');
  void fake;
});

// ---------------- 主循环 / FPS ----------------

test('FPS: 统计每秒刷新一次读数', () => {
  let m = createMeter();
  for (let i = 0; i < 60; i++) m = tickMeter(m, 1 / 60);
  assert.ok(m.fps > 55 && m.fps < 65, `60 帧 1 秒应约 60fps，实际 ${m.fps.toFixed(1)}`);
});

test('FPS: 144Hz 下统计正确', () => {
  let m = createMeter();
  for (let i = 0; i < 144; i++) m = tickMeter(m, 1 / 144);
  assert.ok(m.fps > 138 && m.fps < 150, `应约 144fps，实际 ${m.fps.toFixed(1)}`);
});

test('★ 帧门控: 目标 60 时丢弃多余帧', () => {
  assert.ok(shouldRender(60, 1 / 60), '正好 1/60 应渲染');
  assert.ok(!shouldRender(60, 1 / 144), '144Hz 下选 60 应丢弃多数帧');
  assert.ok(shouldRender(60, 1 / 30), '掉帧时应渲染');
});

test('★ 帧门控: 目标 144 时 144Hz 屏可跑满', () => {
  assert.ok(shouldRender(144, 1 / 144), '144Hz 屏选 144 应全部放行');
  assert.ok(shouldRender(144, 1 / 120), '120Hz 屏选 144 应全部放行（不人为限流）');
  assert.ok(shouldRender(144, 1 / 60), '60Hz 屏选 144 应全部放行');
  // 上限含义：超过 144 的帧才丢弃（240Hz 屏选 144）
  assert.ok(!shouldRender(144, 1 / 240), '240Hz 屏选 144 应丢弃多余帧');
});

test('★ 帧门控: 60Hz 屏选任何档位都不掉帧', () => {
  for (const f of FPS_OPTIONS) {
    assert.ok(shouldRender(f, 1 / 60), `60Hz 屏选 ${f} 不应丢帧`);
  }
});

test('帧门控: 选 60 在 60Hz 屏上不会掉到 30', () => {
  // 浮点误差下 1/60 略小于阈值时应放行（容差 0.5ms）
  assert.ok(shouldRender(60, 1 / 60 - 0.0002), '容差内应渲染');
});

test('固定步长: 不同帧率下步数总和一致', () => {
  let a60 = createAccum(1 / 60);
  let a144 = createAccum(1 / 60);
  let n60 = 0;
  let n144 = 0;
  for (let i = 0; i < 60; i++) { const r = pump(a60, 1 / 60); n60 += r.steps; a60 = r.accum; }
  for (let i = 0; i < 144; i++) { const r = pump(a144, 1 / 144); n144 += r.steps; a144 = r.accum; }
  assert.ok(Math.abs(n60 - n144) <= 2, `1 秒内步数应接近：60fps=${n60} 144fps=${n144}`);
});

test('固定步长: 长时间卡顿不会一次跑上千步', () => {
  const r = pump(createAccum(1 / 60), 10.0);
  assert.ok(r.steps <= 5, `单帧步数应受限，实际 ${r.steps}`);
});

// ---------------- 人机 ----------------

test('人机: 创建后处于巡逻状态', () => {
  const b = createBot('测试兵', v3(0, 0, 0));
  assert.equal(b.phase, 'patrol');
  assert.ok(b.state.alive);
});

test('人机: 玩家进入视野会转为追击/交战', () => {
  const b = createBot('兵', v3(0, 0, 0));
  const r = stepBot(b, { ...WORLD, playerPos: v3(5, 0, 0), playerAlive: true }, 1 / 60, DEFAULT_TUNING);
  assert.ok(r.bot.phase === 'chase' || r.bot.phase === 'engage', `应追击，实际 ${r.bot.phase}`);
});

test('人机: 远距离时保持巡逻', () => {
  const b = createBot('兵', v3(0, 0, 0));
  const r = stepBot(b, { ...WORLD, bounds: 600, playerPos: v3(500, 0, 500), playerAlive: true }, 1 / 60, DEFAULT_TUNING);
  assert.equal(r.bot.phase, 'patrol');
});

test('人机: 死亡后进入倒地，到时间重生且满血', () => {
  let b = createBot('兵', v3(0, 0, 0));
  b = hurtBot(b, 999);
  assert.equal(b.phase, 'down', '应倒地');
  assert.equal(b.deaths, 1, '死亡数 +1');
  assert.ok(b.respawn > 0, '应有重生倒计时');

  let t = 0;
  while (b.phase === 'down' && t < 10) {
    b = stepBot(b, { ...WORLD, bounds: 600, playerPos: v3(999, 0, 999), playerAlive: true }, 1 / 30, DEFAULT_TUNING).bot;
    t += 1 / 30;
  }
  assert.equal(b.phase, 'patrol', '应重生');
  assert.equal(b.state.hp, 100, '重生应满血');
  assert.ok(t >= BOT_TUNING.respawnTime - 0.2, `重生耗时应约 ${BOT_TUNING.respawnTime}s，实际 ${t.toFixed(1)}s`);
});

test('人机: 不会走出地图边界', () => {
  let b = createBot('兵', v3(0, 0, 0));
  for (let i = 0; i < 600; i++) {
    b = stepBot(b, { ...WORLD, playerPos: v3(9999, 0, 9999), playerAlive: true }, 1 / 60, DEFAULT_TUNING).bot;
  }
  assert.ok(Math.abs(b.state.pos.x) <= 30.001, `x 应受限，实际 ${b.state.pos.x.toFixed(1)}`);
  assert.ok(Math.abs(b.state.pos.z) <= 30.001, `z 应受限，实际 ${b.state.pos.z.toFixed(1)}`);
});

// ---------------- 命中判定 ----------------

test('命中: 正前方目标应命中', () => {
  const target = { pos: v3(0, 0, -10), stance: 'stand' as const, radius: 0.45 };
  const hit = raycastTarget(v3(0, 1.6, 0), dirFrom(0, 0), target, 100);
  assert.ok(hit.hit, '正前方应命中');
  assert.ok(Math.abs(hit.distance - 10) < 0.6, `距离应约 10，实际 ${hit.distance.toFixed(2)}`);
});

test('命中: 偏离目标不命中', () => {
  const target = { pos: v3(0, 0, -10), stance: 'stand' as const, radius: 0.45 };
  const hit = raycastTarget(v3(0, 1.6, 0), dirFrom(0.5, 0), target, 100);
  assert.ok(!hit.hit, '偏 0.5 弧度不应命中');
});

test('命中: 超出射程不命中', () => {
  const target = { pos: v3(0, 0, -200), stance: 'stand' as const, radius: 0.45 };
  const hit = raycastTarget(v3(0, 1.6, 0), dirFrom(0, 0), target, 50);
  assert.ok(!hit.hit, '超出射程不应命中');
});

test('命中: 爆头判定', () => {
  const target = { pos: v3(0, 0, -10), stance: 'stand' as const, radius: 0.45 };
  // 瞄准头部（略高于眼睛）
  const headHit = raycastTarget(v3(0, 1.75, 0), dirFrom(0, 0), target, 100);
  assert.ok(headHit.hit && headHit.head, '瞄头部应判爆头');
  // 瞄准腿部
  const legHit = raycastTarget(v3(0, 0.2, 0), dirFrom(0, 0), target, 100);
  assert.ok(legHit.hit && !legHit.head, '瞄腿部不应判爆头');
});

test('命中: 趴下目标更难打中（高度更低）', () => {
  const stand = { pos: v3(0, 0, -10), stance: 'stand' as const, radius: 0.45 };
  const prone = { pos: v3(0, 0, -10), stance: 'prone' as const, radius: 0.45 };
  // dirFrom(yaw, pitch)：这里用 pitch 略微下压瞄准
  const hs = raycastTarget(v3(0, 1.6, 0), dirFrom(0, -0.06), stand, 100);
  const hp = raycastTarget(v3(0, 1.6, 0), dirFrom(0, -0.06), prone, 100);
  assert.ok(hs.hit, '站立目标应被击中');
  assert.ok(!hp.hit, '同样角度应打不到趴下的目标');
});

test('命中: pickTarget 选最近的', () => {
  const targets = [
    { id: 'far', pos: v3(0, 0, -30), stance: 'stand' as const, radius: 0.45 },
    { id: 'near', pos: v3(0, 0, -8), stance: 'stand' as const, radius: 0.45 },
  ];
  const pick = pickTarget(v3(0, 1.6, 0), dirFrom(0, 0), targets, 100);
  assert.ok(pick, '应命中');
  assert.equal(pick!.id, 'near', '应选中更近的');
});

test('眼位: 随姿态变化', () => {
  const base = {
    pos: v3(0, 0, 0), vel: v3(), yaw: 0, hp: 100, maxHp: 100,
    grounded: true, sprinting: false, jumpBuffer: 0, coyote: 0, alive: true,
  };
  const stand = eyePos({ ...base, stance: 'stand' as const });
  const crouch = eyePos({ ...base, stance: 'crouch' as const });
  const prone = eyePos({ ...base, stance: 'prone' as const });
  assert.ok(stand.y > 1.5, `站立眼位应 >1.5，实际 ${stand.y}`);
  assert.ok(crouch.y < stand.y, '蹲下应更低');
  assert.ok(prone.y < crouch.y, '趴下应最低');
  assert.ok(prone.y > 0, '趴下眼位仍应 >0');
});

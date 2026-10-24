import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  createPlayer, step, damage, heal, DEFAULT_TUNING, EYE_HEIGHT,
  type PlayerInput, type PlayerState,
} from '../src/game/player';
import {
  createWeapon, tryFire, tryReload, stepWeapon, isReloading, RIFLE, KNIFE,
} from '../src/game/weapon';
import { v3 } from '../src/core/vec';

const noInput = (over: Partial<PlayerInput> = {}): PlayerInput => ({
  axisX: 0, axisY: 0, jumpPressed: false,
  wantCrouch: false, wantProne: false, autoSprint: true, ...over,
});

/** 模拟 n 帧 */
function run(s: PlayerState, inp: PlayerInput, seconds: number, dt = 1 / 60): PlayerState {
  let cur = s;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) cur = step(cur, inp, dt);
  return cur;
}

test('移动: 向前推摇杆会前进', () => {
  const p = createPlayer();
  const after = run(p, noInput({ axisY: -1 }), 1.0);
  assert.ok(after.pos.z < -0.5, `应向 -z 前进，实际 z=${after.pos.z.toFixed(2)}`);
});

test('移动: 松开摇杆会停下（摩擦）', () => {
  let p = run(createPlayer(), noInput({ axisY: -1 }), 1.0);
  const moving = Math.abs(p.vel.z);
  p = run(p, noInput(), 1.5);
  assert.ok(moving > 1, '移动时应有速度');
  assert.ok(Math.abs(p.vel.z) < 0.15, `松开后应停下，实际 ${p.vel.z.toFixed(3)}`);
});

test('跳跃: 能离地并最终落回地面', () => {
  let p = createPlayer();
  p = step(p, noInput({ jumpPressed: true }), 1 / 60);
  assert.ok(!p.grounded || p.vel.y > 0, '按下跳跃后应有向上速度');
  let maxY = 0;
  for (let i = 0; i < 120; i++) {
    p = step(p, noInput(), 1 / 60);
    maxY = Math.max(maxY, p.pos.y);
  }
  assert.ok(maxY > 0.8, `跳跃高度应可观，实际 ${maxY.toFixed(2)}`);
  assert.ok(p.grounded, '2 秒后应已落地');
  assert.ok(Math.abs(p.pos.y) < 1e-6, '落地后 y 应为 0');
});

test('★ 边移动边跳: 起跳不清空水平速度', () => {
  // 先跑起来
  let p = run(createPlayer(), noInput({ axisY: -1 }), 1.0);
  const speedBefore = Math.abs(p.vel.z);
  // 边跑边跳
  p = step(p, noInput({ axisY: -1, jumpPressed: true }), 1 / 60);
  const speedAfter = Math.abs(p.vel.z);
  assert.ok(p.vel.y > 0, '应已起跳');
  assert.ok(
    speedAfter > speedBefore * 0.9,
    `起跳不应清空水平速度：${speedBefore.toFixed(2)} -> ${speedAfter.toFixed(2)}`,
  );
});

test('★ 边移动边跳: 空中仍能控制方向', () => {
  let p = run(createPlayer(), noInput({ axisY: -1 }), 0.8);
  p = step(p, noInput({ axisY: -1, jumpPressed: true }), 1 / 60);
  const vzStart = p.vel.z;
  // 空中改推右
  for (let i = 0; i < 20; i++) p = step(p, noInput({ axisX: 1, axisY: 0 }), 1 / 60);
  assert.ok(!p.grounded, '应仍在空中');
  assert.ok(p.vel.x > 0.5, `空中应能向右加速，实际 vx=${p.vel.x.toFixed(2)}`);
  assert.ok(Math.abs(p.vel.z - vzStart) > 0.1, '空中 z 速度应发生变化');
});

test('跳跃缓冲: 落地前一瞬按下也算数', () => {
  let p = step(createPlayer(), noInput({ jumpPressed: true }), 1 / 60);
  // 空中（接近落地）再按一次
  for (let i = 0; i < 55; i++) p = step(p, noInput(), 1 / 60);
  const beforeGround = p.grounded;
  p = step(p, noInput({ jumpPressed: true }), 1 / 60);
  if (!beforeGround) {
    // 还没落地：缓冲应保留，落地后自动起跳
    let bounced = false;
    for (let i = 0; i < 20; i++) {
      p = step(p, noInput(), 1 / 60);
      if (p.vel.y > 1) { bounced = true; break; }
    }
    assert.ok(bounced, '缓冲的跳跃应在落地后触发');
  } else {
    assert.ok(p.vel.y > 0 || p.grounded, '状态应合法');
  }
});

test('土狼时间: 刚离地还能补跳', () => {
  // 走到平台边缘直接离地（这里用直接改 grounded 模拟走下台阶）
  let p = createPlayer();
  p = { ...p, grounded: false, coyote: DEFAULT_TUNING.coyoteTime, pos: v3(0, 0.05, 0) };
  p = step(p, noInput({ jumpPressed: true }), 1 / 60);
  assert.ok(p.vel.y > 0, '土狼时间内应能起跳');
});

test('姿态: 蹲下 / 趴下降低速度与视高', () => {
  const stand = run(createPlayer(), noInput({ axisY: -1 }), 1.0);
  const crouch = run(createPlayer(), noInput({ wantCrouch: true }), 0.02);
  assert.equal(crouch.stance, 'crouch', '应进入蹲姿');
  const cRun = run({ ...crouch, vel: v3() }, noInput({ axisY: -1 }), 1.0);
  assert.ok(Math.abs(cRun.vel.z) < Math.abs(stand.vel.z) * 0.7, '蹲下应更慢');

  const prone = run(createPlayer(), noInput({ wantProne: true }), 0.02);
  assert.equal(prone.stance, 'prone', '应进入趴姿');
  assert.ok(EYE_HEIGHT.prone < EYE_HEIGHT.crouch, '趴下视高应最低');
  assert.ok(EYE_HEIGHT.crouch < EYE_HEIGHT.stand, '蹲下视高应低于站立');
});

test('再按一次蹲/趴会回到站立', () => {
  let p = step(createPlayer(), noInput({ wantCrouch: true }), 1 / 60);
  assert.equal(p.stance, 'crouch');
  p = step(p, noInput({ wantCrouch: true }), 1 / 60);
  assert.equal(p.stance, 'stand', '再按一次应回到站立');
});

test('自动疾跑: 摇杆推到顶触发，回中取消', () => {
  const p = run(createPlayer(), noInput({ axisY: -1 }), 1.2);
  assert.ok(p.sprinting, '推到顶应触发疾跑');
  const slow = run(createPlayer(), noInput({ axisY: -0.5 }), 1.2);
  assert.ok(!slow.sprinting, '半推不应疾跑');
  assert.ok(
    Math.abs(p.vel.z) > Math.abs(slow.vel.z) * 1.3,
    `疾跑应明显更快：${slow.vel.z.toFixed(2)} -> ${p.vel.z.toFixed(2)}`,
  );
});

test('自动疾跑可用设置关闭', () => {
  const p = run(createPlayer(), noInput({ axisY: -1, autoSprint: false }), 1.2);
  assert.ok(!p.sprinting, '关闭后不应疾跑');
});

test('生命: 受伤扣血，归零死亡', () => {
  let p = createPlayer();
  p = damage(p, 25);
  assert.equal(p.hp, 75);
  p = damage(p, 200);
  assert.equal(p.hp, 0);
  assert.ok(!p.alive, '血量归零应死亡');
});

test('生命: 治疗不超上限，死亡后不可治疗', () => {
  let p = damage(createPlayer(), 50);
  p = heal(p, 40);
  assert.equal(p.hp, 90, '应恢复 40');
  p = heal(p, 999);
  assert.equal(p.hp, 100, '不应超过上限');
  const dead = heal(damage(createPlayer(), 200), 50);
  assert.equal(dead.hp, 0, '死亡后治疗无效');
});

// ---------------- 武器 ----------------

test('武器: 开火消耗弹药并进入冷却', () => {
  let w = createWeapon();
  const r = tryFire(w);
  assert.ok(r.fired, '应能开火');
  assert.equal(r.weapon.ammo, 29, '应消耗 1 发');
  assert.equal(r.damage, RIFLE.damage);
  const again = tryFire(r.weapon);
  assert.ok(!again.fired, '冷却中不应再次开火');
  assert.equal(again.reason, 'cooldown');
});

test('武器: 打空后不能开火，换弹后恢复', () => {
  let w = createWeapon('ranged', 150);
  for (let i = 0; i < RIFLE.magSize; i++) {
    w = stepWeapon(w, RIFLE.cooldown + 0.001);
    w = tryFire(w).weapon;
  }
  assert.equal(w.ammo, 0, '应打空');
  assert.equal(tryFire(w).reason, 'empty', '空弹匣不应开火');

  const rl = tryReload(w);
  assert.ok(rl.ok, '应能换弹');
  assert.ok(isReloading(rl.weapon));
  assert.equal(tryFire(rl.weapon).reason, 'reloading', '换弹中不应开火');

  let w2 = rl.weapon;
  for (let i = 0; i < 200; i++) w2 = stepWeapon(w2, 1 / 60);
  assert.ok(!isReloading(w2), '换弹应完成');
  assert.equal(w2.ammo, RIFLE.magSize, '弹匣应补满');
  assert.equal(w2.reserve, 150 - RIFLE.magSize, '备弹应相应减少');
});

test('武器: 弹匣满 / 无备弹时不能换弹', () => {
  const full = createWeapon();
  assert.ok(!tryReload(full).ok, '满弹匣不应换弹');
  let empty = { ...createWeapon('ranged', 0), ammo: 0 };
  assert.ok(!tryReload(empty).ok, '无备弹不应换弹');
  empty = { ...empty, reserve: 30 };
  assert.ok(tryReload(empty).ok, '有备弹应能换弹');
});

test('武器: 近战攻速为枪的 40%', () => {
  assert.ok(
    Math.abs(KNIFE.cooldown - RIFLE.cooldown / 0.4) < 1e-9,
    `刀间隔应为 ${(RIFLE.cooldown / 0.4).toFixed(3)}s，实际 ${KNIFE.cooldown}`,
  );
  assert.equal(KNIFE.damage, 10, '刀伤害应为 10');
  const w = createWeapon('melee');
  const r = tryFire(w);
  assert.ok(r.fired, '刀应能挥砍');
  assert.equal(r.weapon.ammo, 0, '刀不消耗弹药');
  assert.ok(r.weapon.swingLeft > 0, '应进入挥砍动作');
  assert.ok(!tryReload(w).ok, '刀不能换弹');
});

test('武器: 备弹补给', () => {
  let w = { ...createWeapon('ranged', 0), ammo: 0 };
  w = { ...w, reserve: 90 };
  assert.ok(tryReload(w).ok, '有备弹应能换弹');
});

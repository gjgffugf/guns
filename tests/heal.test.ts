import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  createHeal, beginUse, tickHeal, cancelUse, applyHeal, canUse, isBusy,
  HEAL_DEFS, speedMul, takenMul, dealtMul,
  type HealState,
} from '../src/game/heal';
import { rayBlockDistance, rayHitWall, dirFrom, pickTarget } from '../src/game/combat';
import { createWeapon, tryFire, stepWeapon, tryReload, isReloading, def } from '../src/game/weapon';
import { v3 } from '../src/core/vec';

// ---------------- 治疗物 ----------------

test('治疗: 初始携带数量正确（绷带3 / 急救包1 / 饮料2）', () => {
  const h = createHeal();
  assert.equal(h.inv.bandage, 3);
  assert.equal(h.inv.medkit, 1);
  assert.equal(h.inv.energy, 2);
});

test('治疗: 绷带 5 秒后恢复 40 点并消耗一个', () => {
  let h = createHeal();
  h = beginUse(h, 'bandage', 50, 100);
  assert.ok(isBusy(h), '应进入使用中状态');

  let healed = 0;
  for (let i = 0; i < 60; i++) {
    const r = tickHeal(h, 0.1, 50, 100);
    h = r.state;
    if (r.finished) healed = r.healAmount;
  }
  assert.equal(h.inv.bandage, 2, '应消耗一个绷带');
  assert.equal(healed, 40);
  assert.equal(applyHeal(50, 100, healed, false), 90);
});

test('治疗: 急救包 7 秒回满', () => {
  let h = createHeal();
  h = beginUse(h, 'medkit', 12, 100);
  let full = false;
  for (let i = 0; i < 80; i++) {
    const r = tickHeal(h, 0.1, 12, 100);
    h = r.state;
    if (r.finished) full = r.full;
  }
  assert.ok(full, '急救包应回满');
  assert.equal(applyHeal(12, 100, 0, true), 100);
});

test('治疗: 冰冰冰 4 秒，给 15 秒 buff', () => {
  let h = createHeal();
  h = beginUse(h, 'energy', 100, 100);
  for (let i = 0; i < 45; i++) h = tickHeal(h, 0.1, 100, 100).state;
  assert.ok(h.buff.left > 14 && h.buff.left <= 15, `buff 应约 15 秒，实际 ${h.buff.left}`);
  assert.ok(Math.abs(speedMul(h.buff) - 1.1) < 1e-9, '移速 +10%');
  assert.ok(Math.abs(takenMul(h.buff) - 0.8) < 1e-9, '受伤 -20%');
  assert.ok(Math.abs(dealtMul(h.buff) - 1.1) < 1e-9, '输出 +10%');
});

test('治疗: buff 到期后归零', () => {
  let h = createHeal();
  h = beginUse(h, 'energy', 100, 100);
  for (let i = 0; i < 45; i++) h = tickHeal(h, 0.1, 100, 100).state;
  for (let i = 0; i < 200; i++) h = tickHeal(h, 0.1, 100, 100).state;
  assert.equal(h.buff.left, 0);
  assert.equal(speedMul(h.buff), 1);
});

test('治疗: 满血时不能用绷带/急救包，但能用饮料', () => {
  const h = createHeal();
  assert.equal(canUse(h, 'bandage', 100, 100), false);
  assert.equal(canUse(h, 'medkit', 100, 100), false);
  assert.equal(canUse(h, 'energy', 100, 100), true);
});

test('治疗: 用完了就不能再用', () => {
  let h = createHeal();
  h = { ...h, inv: { ...h.inv, bandage: 0 } };
  assert.equal(canUse(h, 'bandage', 50, 100), false);
  const after = beginUse(h, 'bandage', 50, 100);
  assert.equal(after, h, '不应开始使用');
});

test('治疗: 取消不消耗物品，且立刻可再次使用', () => {
  let h = createHeal();
  h = beginUse(h, 'bandage', 50, 100);
  for (let i = 0; i < 20; i++) h = tickHeal(h, 0.1, 50, 100).state;
  h = cancelUse(h);
  assert.equal(h.inv.bandage, 3, '取消不应消耗');
  assert.ok(!isBusy(h), '取消后应空闲');
  assert.ok(canUse(h, 'bandage', 50, 100), '取消后应能再用');
});

test('治疗: 使用期间不能开始另一个', () => {
  let h = createHeal();
  h = beginUse(h, 'bandage', 50, 100);
  const blocked = beginUse(h, 'medkit', 50, 100);
  assert.equal(blocked, h);
});

test('治疗: 恢复量不会超过上限', () => {
  assert.equal(applyHeal(80, 100, 40, false), 100);
  assert.equal(applyHeal(10, 100, 40, false), 50);
});

test('治疗: 倒计时单调递减', () => {
  let h = createHeal();
  h = beginUse(h, 'bandage', 50, 100);
  assert.equal(h.left, 5);
  let prev = h.left;
  for (let i = 0; i < 10; i++) {
    h = tickHeal(h, 0.1, 50, 100).state;
    assert.ok(h.left <= prev, '不应增加');
    prev = h.left;
  }
  assert.ok(Math.abs(prev - 4) < 1e-6, `1 秒后应剩 4，实际 ${prev}`);
});

// ---------------- 子弹不穿墙 ----------------

const WALL = [{ pos: v3(0, 0, 0), r: 2.3, h: 3 }];

test('★ 挡墙: 墙在中间时，射线先撞墙', () => {
  const origin = v3(-8, 1.6, 0);
  const dir = dirFrom(Math.PI / 2, 0);      // 朝 +x
  const d = rayBlockDistance(origin, dir, WALL, 100);
  assert.ok(Number.isFinite(d), '应撞到墙');
  assert.ok(Math.abs(d - (8 - 2.3)) < 0.05, `应在 ${8 - 2.3} 处撞墙，实际 ${d}`);
});

test('★ 挡墙: 目标在墙后不掉血', () => {
  const origin = v3(-8, 1.6, 0);
  const dir = dirFrom(Math.PI / 2, 0);
  // 目标在墙的另一侧 (+x = 8)
  const targets = [{ id: 't', pos: v3(8, 0, 0), stance: 'stand' as const, radius: 0.5 }];
  const pick = pickTarget(origin, dir, targets, 100);
  assert.ok(pick, '射线应能命中目标');
  const wallDist = rayBlockDistance(origin, dir, WALL, 100);
  assert.ok(pick!.distance > wallDist,
    `墙(${wallDist.toFixed(2)}) 应比目标(${pick!.distance.toFixed(2)}) 更近 → 不该掉血`);
});

test('挡墙: 目标在墙前正常命中', () => {
  const origin = v3(-8, 1.6, 0);
  const dir = dirFrom(Math.PI / 2, 0);
  const targets = [{ id: 't', pos: v3(-4, 0, 0), stance: 'stand' as const, radius: 0.5 }];
  const pick = pickTarget(origin, dir, targets, 100);
  assert.ok(pick);
  const wallDist = rayBlockDistance(origin, dir, WALL, 100);
  assert.ok(pick!.distance < wallDist, '目标更近，应命中');
});

test('挡墙: 没有墙时返回 Infinity', () => {
  const d = rayBlockDistance(v3(-8, 1.6, 0), dirFrom(Math.PI / 2, 0), [], 100);
  assert.equal(d, Infinity);
});

test('挡墙: 射线从墙顶上方掠过不算挡住', () => {
  // 从高处往下打，射线在墙位置的高度已经超过墙高
  const origin = v3(-8, 10, 0);
  const dir = { x: 1, y: 0, z: 0 };         // 水平，高度恒为 10 > 墙高 3
  const d = rayBlockDistance(origin, dir, WALL, 100);
  assert.equal(d, Infinity, '高于墙顶，不应被挡');
});

test('挡墙: 能返回弹着点（用于火花特效）', () => {
  const origin = v3(-8, 1.6, 0);
  const hit = rayHitWall(origin, dirFrom(Math.PI / 2, 0), WALL, 100);
  assert.ok(hit, '应返回弹着点');
  assert.ok(Math.abs(hit!.point.x - (-2.3)) < 0.05, `弹着点 x 应约 -2.3，实际 ${hit!.point.x}`);
});

// ---------------- 打空自动换弹 ----------------

test('★ 武器: 打空后 tryFire 返回 empty（可以据此自动换弹）', () => {
  let w = createWeapon('ranged', 150);
  for (let i = 0; i < def('ranged').magSize; i++) {
    const r = tryFire(w);
    assert.ok(r.fired, `第 ${i + 1} 发应能打出`);
    w = r.weapon;
    w = stepWeapon(w, def('ranged').cooldown + 0.001);   // 跳过冷却
  }
  assert.equal(w.ammo, 0);
  const r = tryFire(w);
  assert.equal(r.reason, 'empty', '打空应返回 empty');
});

test('★ 武器: 打空时若还有备弹，tryReload 应成功', () => {
  let w = createWeapon('ranged', 150);
  w = { ...w, ammo: 0 };
  const r = tryReload(w);
  assert.ok(r.ok, '有备弹就该能换');
  // 换弹完成
  let n = r.weapon;
  for (let i = 0; i < 30; i++) n = stepWeapon(n, 0.1);
  assert.equal(n.ammo, 30, '换弹后应满弹匣');
  assert.equal(n.reserve, 120);
});

test('武器: 没有备弹时不能换弹', () => {
  const w = { ...createWeapon('ranged', 0), ammo: 0 };
  const r = tryReload(w);
  assert.equal(r.ok, false);
  assert.equal(r.reason, '没有备用弹药');
});

test('武器: 近战不需要换弹，也没有弹药概念', () => {
  const w = createWeapon('melee', 150);
  const r = tryReload(w);
  assert.equal(r.ok, false);
  assert.equal(r.reason, '近战武器无需换弹');
  const f = tryFire(w);
  assert.ok(f.fired, '近战应能攻击');
});

test('武器: 换弹期间不能开火', () => {
  const w = { ...createWeapon('ranged', 150), reloadLeft: 1.0 };
  assert.ok(isReloading(w));
  assert.equal(tryFire(w).reason, 'reloading');
});

// ---------------- HealState 结构 ----------------
test('治疗: picked 可切换', () => {
  let h: HealState = createHeal();
  assert.equal(h.picked, 'bandage');
  h = { ...h, picked: 'medkit' };
  assert.equal(h.picked, 'medkit');
});

test('治疗: 三种物品定义齐全', () => {
  assert.equal(HEAL_DEFS.bandage.name, '破损的绷带');
  assert.equal(HEAL_DEFS.medkit.name, '布满灰的急救包');
  assert.equal(HEAL_DEFS.energy.name, '冰冰冰');
  assert.equal(HEAL_DEFS.bandage.time, 5);
  assert.equal(HEAL_DEFS.medkit.time, 7);
  assert.equal(HEAL_DEFS.energy.time, 4);
});

import { test } from 'node:test';
import * as assert from 'node:assert';
import { applyLook, clampPitch, normalizeYaw, PITCH_LIMIT } from '../src/game/aim';
import { dirFrom } from '../src/game/combat';

/**
 * 把"向右转"变成可验证的事实：新朝向在【右方向】上的投影为正。
 *
 * 右方向 = forward × up（up = (0,1,0)）：
 *   right.x = f.y*up.z - f.z*up.y = -f.z
 *   right.z = f.x*up.y - f.y*up.x =  f.x
 * 校验：yaw=0 时 forward=(0,0,-1)，right=(1,0,0)，与 player.ts 的
 *   rx=cos(yaw), rz=sin(yaw) 一致。
 */
function rightDot(yaw: number, refYaw: number): number {
  const f = dirFrom(yaw, 0);
  const rf = dirFrom(refYaw, 0);
  const rx = -rf.z;
  const rz = rf.x;
  return f.x * rx + f.z * rz;
}

test('★ 视角: 手指右滑应向右转（朝向偏向右侧）', () => {
  const r = applyLook(0, 0, 100, 0, 0.0064);
  assert.ok(rightDot(r.yaw, 0) > 0,
    `右滑后朝向应偏向右方，实际投影 ${rightDot(r.yaw, 0).toFixed(4)}`);
});

test('★ 视角: 手指左滑应向左转', () => {
  const r = applyLook(0, 0, -100, 0, 0.0064);
  assert.ok(rightDot(r.yaw, 0) < 0,
    `左滑后朝向应偏向左方，实际投影 ${rightDot(r.yaw, 0).toFixed(4)}`);
});

test('视角: 左右对称，位移相同则角度互为相反数', () => {
  const a = applyLook(0, 0, 100, 0, 0.0064);
  const b = applyLook(0, 0, -100, 0, 0.0064);
  assert.ok(Math.abs(a.yaw + b.yaw) < 1e-12, '应互为相反数');
});

test('视角: 手指下滑应向下看', () => {
  const r = applyLook(0, 0, 0, 100, 0.0064);
  assert.ok(r.pitch < 0, `下滑 pitch 应为负（向下看），实际 ${r.pitch}`);
});

test('视角: 手指上滑应向上看', () => {
  const r = applyLook(0, 0, 0, -100, 0.0064);
  assert.ok(r.pitch > 0, `上滑 pitch 应为正（向上看），实际 ${r.pitch}`);
});

test('视角: invertY 反转纵向但不影响横向', () => {
  const a = applyLook(0, 0, 100, 100, 0.0064, false);
  const b = applyLook(0, 0, 100, 100, 0.0064, true);
  assert.ok(Math.abs(a.yaw - b.yaw) < 1e-12, '横向不应受影响');
  assert.ok(a.pitch < 0 && b.pitch > 0, '纵向应相反');
});

test('视角: 抬头低头被限制，不会翻转', () => {
  const up = applyLook(0, 0, 0, -100000, 0.0064);
  const down = applyLook(0, 0, 0, 100000, 0.0064);
  assert.equal(up.pitch, PITCH_LIMIT);
  assert.equal(down.pitch, -PITCH_LIMIT);
  assert.ok(Math.abs(up.pitch) < Math.PI / 2 + 0.2, '不应翻过头顶');
});

test('视角: 灵敏度越大转得越多', () => {
  const slow = applyLook(0, 0, 100, 0, 0.003);
  const fast = applyLook(0, 0, 100, 0, 0.012);
  assert.ok(fast.yaw > slow.yaw, '灵敏度大应转得更多');
});

test('视角: 位移为 0 时视角不动', () => {
  const r = applyLook(1.2, 0.3, 0, 0, 0.0064);
  assert.equal(r.yaw, 1.2);
  assert.equal(r.pitch, 0.3);
});

test('视角: yaw 归一化到 (-π, π]', () => {
  assert.ok(Math.abs(normalizeYaw(Math.PI * 3) - (-Math.PI)) < 1e-9
    || Math.abs(normalizeYaw(Math.PI * 3) - Math.PI) < 1e-9, '3π 应归一');
  for (const y of [0.5, -0.5, 7, -7, 100]) {
    const n = normalizeYaw(y);
    assert.ok(n > -Math.PI - 1e-9 && n <= Math.PI + 1e-9, `${y} -> ${n} 超出范围`);
  }
});

test('视角: clampPitch 边界', () => {
  assert.equal(clampPitch(99), PITCH_LIMIT);
  assert.equal(clampPitch(-99), -PITCH_LIMIT);
  assert.equal(clampPitch(0.5), 0.5);
});

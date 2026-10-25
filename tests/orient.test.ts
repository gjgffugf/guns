import { test } from 'node:test';
import * as assert from 'node:assert';
import * as THREE from 'three';
import { modelYaw } from '../src/game/combat';
import { dirFrom } from '../src/game/combat';

/**
 * ★ 用真实的 three 四元数验证模型朝向，而不是只验证公式。
 *   之前 `yaw + Math.PI` 的错误正是在 ±π/2 附近碰巧正确，
 *   只看公式看不出来。
 */

/** 模型正面 = 局部 -z（火柴人的枪挂在 z = -0.42） */
function facingOf(rotY: number): THREE.Vector3 {
  const o = new THREE.Object3D();
  o.rotation.y = rotY;
  o.updateMatrixWorld(true);
  return new THREE.Vector3(0, 0, -1).applyQuaternion(o.quaternion);
}

const CASES = [0, 0.3, Math.PI / 4, Math.PI / 2, 1.9, -Math.PI / 2, -0.7, Math.PI, 2.4];

test('★ 模型朝向与视角朝向一致', () => {
  for (const yaw of CASES) {
    const want = dirFrom(yaw, 0);
    const got = facingOf(modelYaw(yaw));
    assert.ok(Math.abs(got.x - want.x) < 1e-6 && Math.abs(got.z - want.z) < 1e-6,
      `yaw=${yaw.toFixed(2)} 期望 (${want.x.toFixed(3)},${want.z.toFixed(3)}) 实得 (${got.x.toFixed(3)},${got.z.toFixed(3)})`);
  }
});

test('★ 旧公式 yaw+PI 确实错了（回归保护）', () => {
  // yaw=0 时旧公式让模型背对视角，这里显式证明差异存在
  let diff = 0;
  for (const yaw of CASES) {
    const want = dirFrom(yaw, 0);
    const oldV = facingOf(yaw + Math.PI);
    if (Math.abs(oldV.x - want.x) > 1e-6 || Math.abs(oldV.z - want.z) > 1e-6) diff++;
  }
  assert.ok(diff > 0, '旧公式应有若干角度不符，否则说明测试没覆盖到');
});

test('modelYaw 是奇函数（左右对称）', () => {
  for (const yaw of CASES) {
    assert.ok(Math.abs(modelYaw(yaw) + modelYaw(-yaw)) < 1e-9);
  }
});

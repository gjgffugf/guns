import { test } from 'node:test';
import * as assert from 'node:assert';
import { bearingTo } from '../src/game/session';
import { ICONS } from '../src/ui/icons';
import { CONTROL_KEYS } from '../src/core/layout';
import { loadSkinData, saveSkinData, clearSkinData } from '../src/core/skin';
import type { KV } from '../src/core/skin';

const PI = Math.PI;
const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps;

/**
 * ★ 受击方向指示的方位角。
 *   角度符号最容易写反，这里用"玩家朝向 + 敌人位置"的组合穷举验证。
 *   约定：0=正前，+π/2=正右，−π/2=正左，±π=正后。
 */
test('★ 方位角: yaw=0（面向 -z）时四个方向', () => {
  // 正前（-z）
  assert.ok(near(bearingTo(0, 0, 0, 0, -10), 0), '正前应为 0');
  // 正后（+z）
  assert.ok(near(Math.abs(bearingTo(0, 0, 0, 0, 10)), PI), '正后应为 ±π');
  // 正右（+x）
  assert.ok(near(bearingTo(0, 0, 0, 10, 0), PI / 2), '正右应为 +π/2');
  // 正左（-x）
  assert.ok(near(bearingTo(0, 0, 0, -10, 0), -PI / 2), '正左应为 -π/2');
});

test('★ 方位角: 转身后跟着变（yaw=π/2 面向 +x）', () => {
  // 面向 +x 时，敌人在 +x 是正前
  assert.ok(near(bearingTo(0, 0, PI / 2, 10, 0), 0), '面向+x时 +x 是正前');
  // 此时 +z 是右手边
  assert.ok(near(bearingTo(0, 0, PI / 2, 0, 10), PI / 2), '面向+x时 +z 是正右');
  // -z 是左手边
  assert.ok(near(bearingTo(0, 0, PI / 2, 0, -10), -PI / 2), '面向+x时 -z 是正左');
});

test('★ 方位角: 45 度斜向', () => {
  // yaw=0 面向 -z，敌人在右前方（+x, -z）
  const a = bearingTo(0, 0, 0, 10, -10);
  assert.ok(near(a, PI / 4), `右前应为 +π/4，实得 ${a}`);
  // 左后方（-x, +z）
  const b = bearingTo(0, 0, 0, -10, 10);
  assert.ok(near(b, -PI * 3 / 4), `左后应为 -3π/4，实得 ${b}`);
});

test('★ 方位角: 与距离无关（只要方向相同结果就一样）', () => {
  const a = bearingTo(0, 0, 0.7, 5, -12);
  const b = bearingTo(0, 0, 0.7, 50, -120);
  assert.ok(near(a, b, 1e-9), '同一方向不同距离应得到相同角度');
});

test('★ 方位角: 玩家不在原点也正确', () => {
  // 玩家在 (100, 100)，面向 -z，敌人在正前方 (100, 90)
  assert.ok(near(bearingTo(100, 100, 0, 100, 90), 0));
  // 敌人在右侧 (110, 100)
  assert.ok(near(bearingTo(100, 100, 0, 110, 100), PI / 2));
});

// ---------------- 控件图标 ----------------
test('★ 每个控件都有图标', () => {
  for (const k of CONTROL_KEYS) {
    const svg = ICONS[k];
    assert.ok(typeof svg === 'string' && svg.length > 40, `${k} 缺少图标`);
    assert.ok(svg.includes('<svg'), `${k} 不是 SVG`);
  }
});

test('★ 图标里不含中文（确认已用图标替代文字）', () => {
  const cjk = /[一-龥]/;
  for (const k of Object.keys(ICONS)) {
    assert.ok(!cjk.test(ICONS[k as keyof typeof ICONS]), `${k} 的图标里还残留中文`);
  }
});

test('★ 各控件图标互不相同（避免画错/复制粘贴）', () => {
  const seen = new Map<string, string>();
  for (const k of CONTROL_KEYS) {
    const svg = ICONS[k];
    const dup = seen.get(svg);
    assert.ok(!dup, `${k} 与 ${dup} 的图标完全一样`);
    seen.set(svg, k);
  }
});

// ---------------- 皮肤存档 ----------------
function memKV(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
}

test('★ 皮肤存档能存能读', () => {
  const kv = memKV();
  assert.equal(loadSkinData(kv), null);
  const data = 'data:image/jpeg;base64,AAAA';
  assert.equal(saveSkinData(data, kv), true);
  assert.equal(loadSkinData(kv), data);
});

test('★ 皮肤存档写失败时返回 false（不假装成功）', () => {
  const broken: KV = { getItem: () => null, setItem: () => { /* 存不进去 */ } };
  assert.equal(saveSkinData('data:image/jpeg;base64,x', broken), false);
});

test('★ 非图片内容不会被当成皮肤', () => {
  const kv = memKV();
  kv.setItem('bb.skin.v1', 'garbage');
  assert.equal(loadSkinData(kv), null);
});

test('★ 清除皮肤后读不到', () => {
  const kv = memKV();
  saveSkinData('data:image/jpeg;base64,AAAA', kv);
  clearSkinData(kv);
  assert.equal(loadSkinData(kv), null);
});

import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  uiScale, sizeOf, rectOf, hitTest, pointInRect, defaultControls,
  clampControl, insideScreen,
  BASE_SIZE, BASE_W, BASE_H, CONTROL_KEYS,
  type Rect, type ControlKey,
} from '../src/core/layout';

/**
 * 针对 Godot 版本踩过的坑：
 * 布局与命中测试必须共用同一套坐标系，否则
 * "控件看不见" + "点了没反应" 会同时出现。
 */

const DEVICES: Array<{ name: string; vw: number; vh: number }> = [
  { name: '基准1280x720', vw: 1280, vh: 720 },
  { name: '1080p横屏', vw: 1920, vh: 1080 },
  { name: '手机A(CSS)', vw: 780, vh: 360 },
  { name: '手机B(CSS)', vw: 640, vh: 360 },
  { name: '平板(CSS)', vw: 1024, vh: 768 },
  { name: '极端窄', vw: 800, vh: 360 },
];

test('uiScale: 基准为 1，非法输入退化为 1', () => {
  assert.ok(Math.abs(uiScale(BASE_W, BASE_H) - 1) < 1e-6, '基准应为 1');
  assert.equal(uiScale(0, 0), 1, '0 尺寸不能返回 0（否则控件消失）');
  assert.equal(uiScale(-5, 10), 1, '负数不能返回 0');
  assert.ok(Math.abs(uiScale(800, 360) - 0.5) < 1e-6, '应按较小边缩放');
});

test('布局: 所有机型下全部控件完整可见', () => {
  const cfg = defaultControls();
  for (const d of DEVICES) {
    for (const k of CONTROL_KEYS) {
      const r: Rect = rectOf(k, cfg[k], d.vw, d.vh);
      assert.ok(r.w > 0, `${d.name} ${k} 宽度>0`);
      assert.ok(r.h > 0, `${d.name} ${k} 高度>0`);
      assert.ok(r.x >= -0.001, `${d.name} ${k} 左边界不出屏 (x=${r.x})`);
      assert.ok(r.y >= -0.001, `${d.name} ${k} 上边界不出屏 (y=${r.y})`);
      assert.ok(r.x + r.w <= d.vw + 0.001, `${d.name} ${k} 右边界不出屏`);
      assert.ok(r.y + r.h <= d.vh + 0.001, `${d.name} ${k} 下边界不出屏`);
    }
  }
});

test('布局: 开火键恒在右下角，比例不随分辨率漂移', () => {
  const cfg = defaultControls();
  for (const d of DEVICES) {
    const r = rectOf('fire', cfg.fire, d.vw, d.vh);
    const cx = (r.x + r.w / 2) / d.vw;
    const cy = (r.y + r.h / 2) / d.vh;
    assert.ok(Math.abs(cx - 0.8950) < 0.01, `${d.name} 横向占比=${cx.toFixed(3)}`);
    assert.ok(Math.abs(cy - 0.8450) < 0.01, `${d.name} 纵向占比=${cy.toFixed(3)}`);
  }
});

test('布局: 尺寸随视口等比缩放', () => {
  const cfg = defaultControls();
  const a = sizeOf('stick', cfg.stick, 1280, 720);
  const b = sizeOf('stick', cfg.stick, 640, 360);
  assert.ok(Math.abs(b[0] - a[0] / 2) < 1e-3, '宽度应减半');
  assert.ok(Math.abs(b[1] - a[1] / 2) < 1e-3, '高度应减半');
});

test('命中: 点控件中心必定命中自身（全部机型 x 全部控件）', () => {
  const cfg = defaultControls();
  for (const d of DEVICES) {
    for (const k of CONTROL_KEYS) {
      const r = rectOf(k, cfg[k], d.vw, d.vh);
      const hit = hitTest(cfg, d.vw, d.vh, r.x + r.w / 2, r.y + r.h / 2);
      assert.equal(hit, k, `${d.name} 点击 ${k} 中心应命中 ${k}，实际 ${hit}`);
    }
  }
});

test('命中: 空白区不误触', () => {
  const cfg = defaultControls();
  assert.equal(hitTest(cfg, 1280, 720, 40, 40), null, '左上角空白');
  assert.equal(hitTest(cfg, 1280, 720, 640, 360), null, '屏幕正中');
  assert.equal(hitTest(cfg, 0, 0, 10, 10), null, '非法视口');
});

test('命中: pointInRect 边界正确', () => {
  const r: Rect = { x: 0, y: 0, w: 10, h: 10 };
  assert.ok(pointInRect(r, 5, 5), '内部应命中');
  assert.ok(!pointInRect(r, 10, 5), '右边界外不命中');
  assert.ok(!pointInRect(r, -1, 5), '左边界外不命中');
});

test('拖动后仍可命中（布局与命中共源）', () => {
  const cfg = defaultControls();
  const moved = { ...cfg.fire, x: 0.5, y: 0.5 };
  const c2 = { ...cfg, fire: moved };
  const r = rectOf('fire', moved, 1280, 720);
  const hit: ControlKey | null = hitTest(c2, 1280, 720, r.x + r.w / 2, r.y + r.h / 2);
  assert.equal(hit, 'fire', '拖到中间后点中心仍应命中');
  assert.equal(hitTest(c2, 1280, 720, 40, 40), null, '原位置应已空出');
});

// ---------------- 控件夹取（含自身尺寸）----------------

test('★ 夹取: 大控件（摇杆）拖到边角也不会出屏', () => {
  const k: ControlKey = 'stick';
  // 往下拖到 0.97 —— clampCenter 会放行，clampControl 必须拦住
  const c = clampControl(k, { x: 0.5, y: 0.97, s: 1, a: 0.85 });
  assert.ok(insideScreen(k, c),
    `摇杆应完整在屏内，实际 y=${c.y.toFixed(3)}`);
});

test('夹取: 所有控件在四个角都完整可见', () => {
  for (const k of CONTROL_KEYS) {
    for (const [x, y] of [[0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98]]) {
      const c = clampControl(k, { x, y, s: 1, a: 0.9 });
      assert.ok(insideScreen(k, c),
        `${k} 在 (${x}, ${y}) 出屏了 -> (${c.x.toFixed(3)}, ${c.y.toFixed(3)})`);
    }
  }
});

test('夹取: 放大到 2 倍也不会出屏', () => {
  for (const k of CONTROL_KEYS) {
    const c = clampControl(k, { x: 0.99, y: 0.99, s: 2, a: 0.9 });
    assert.ok(insideScreen(k, c), `${k} 在 2 倍尺寸下出屏`);
  }
});

test('夹取: 不改动本来就在安全区的配置', () => {
  const c = clampControl('fire', { x: 0.5, y: 0.5, s: 1, a: 0.9 });
  assert.equal(c.x, 0.5);
  assert.equal(c.y, 0.5);
});

test('夹取: 缩放倍率保留', () => {
  const c = clampControl('fire', { x: 0.5, y: 0.5, s: 1.5, a: 0.7 });
  assert.equal(c.s, 1.5);
  assert.equal(c.a, 0.7);
});

test('夹取: 基准尺寸自洽（最大控件也不超过屏幕的 1/3 宽）', () => {
  for (const k of CONTROL_KEYS) {
    const [w, h] = BASE_SIZE[k];
    assert.ok(w <= BASE_W / 3, `${k} 太宽 ${w}`);
    assert.ok(h <= BASE_H / 1.5, `${k} 太高 ${h}`);
  }
});


test('★ 布局: 放大后各控件互不重叠', () => {
  const cfg = defaultControls();
  const rs: Array<{ k: ControlKey; r: Rect }> =
    CONTROL_KEYS.map((k) => ({ k, r: rectOf(k, cfg[k], BASE_W, BASE_H) }));
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i].r;
      const b = rs[j].r;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      assert.ok(ox <= 0 || oy <= 0,
        `${rs[i].k} 与 ${rs[j].k} 重叠了（${ox.toFixed(0)}x${oy.toFixed(0)}px）`);
    }
  }
});

test('布局: 治疗物与换弹在底部中间，不挡视野中心', () => {
  const cfg = defaultControls();
  const h = rectOf('heal', cfg.heal, BASE_W, BASE_H);
  const rl = rectOf('reload', cfg.reload, BASE_W, BASE_H);
  const cy = BASE_H / 2;
  assert.ok(h.y > cy, '治疗物应在屏幕下半部');
  assert.ok(rl.y > cy, '换弹应在屏幕下半部');
  assert.ok(h.x < BASE_W / 2 && rl.x > BASE_W / 2, '两者应分居血条两侧');
});

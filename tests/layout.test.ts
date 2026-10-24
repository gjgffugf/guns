import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  BASE_W, BASE_H, CONTROL_KEYS, defaultControls, uiScale, rectOf,
  hitTest, sizeOf, pointInRect,
  type ControlKey, type Rect,
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
    assert.ok(Math.abs(cx - 0.9344) < 0.01, `${d.name} 横向占比=${cx.toFixed(3)}`);
    assert.ok(Math.abs(cy - 0.9028) < 0.01, `${d.name} 纵向占比=${cy.toFixed(3)}`);
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

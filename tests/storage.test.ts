import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  loadServers, saveServers, sanitizeServers, isValidServer,
  type SavedServer, type KV,
} from '../src/core/storage';
import { backoffMs, MAX_RETRY } from '../src/net/client';
import { pushRender, resetMeter, createRenderMeter } from '../src/core/loop';
import { CONTROLS_VER, DEFAULT_POS, rectOf, defaultControls, BASE_W, BASE_H } from '../src/core/layout';
import { defaultSettings, sanitize } from '../src/core/settings';

function memKV(): KV {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v); },
  };
}

test('★ 添加多个服务器后能全部读回', () => {
  const kv = memKV();
  const list: SavedServer[] = [
    { name: '家里', host: '192.168.1.10', port: 19000 },
    { name: '手机开服', host: '127.0.0.1', port: 19000 },
    { name: '朋友', host: '10.0.0.5', port: 20000 },
  ];
  assert.equal(saveServers(list, kv), true, '保存应返回成功');
  const back = loadServers(kv);
  assert.equal(back.length, 3);
  assert.deepEqual(back, list);
});

test('★ 保存后读回校验：存储写不进去时返回 false', () => {
  const broken: KV = {
    getItem: () => null,
    setItem: () => { /* 什么都不存 */ },
  };
  assert.equal(saveServers([{ name: 'a', host: 'h', port: 1 }], broken), false);
});

test('★ 损坏的存档不会让列表崩溃', () => {
  const kv = memKV();
  kv.setItem('bb.servers.v2', '{{{ 不是 json');
  assert.deepEqual(loadServers(kv), []);
});

test('★ 非法条目被过滤（缺 host / 端口越界）', () => {
  const out = sanitizeServers([
    { name: 'ok', host: '1.2.3.4', port: 19000 },
    { name: 'x', host: '', port: 19000 },
    { name: 'y', host: 'a', port: 99999 },
    null,
    'garbage',
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].host, '1.2.3.4');
});

test('isValidServer 基本判定', () => {
  assert.equal(isValidServer({ name: 'a', host: 'h', port: 1 }), true);
  assert.equal(isValidServer({ name: 'a', host: 'h', port: 0 }), false);
  assert.equal(isValidServer({ host: 'h' }), false);
});

test('★ 旧版本存档会被迁移，不会丢数据', () => {
  const kv = memKV();
  kv.setItem('bb.servers.v1', JSON.stringify([{ name: '老服', host: '192.168.0.9', port: 19000 }]));
  const back = loadServers(kv);
  assert.equal(back.length, 1);
  assert.equal(back[0].name, '老服');
});

// ---------------- 自动重连 ----------------
test('★ 重连退避递增且不超过 5 次', () => {
  assert.equal(MAX_RETRY, 5);
  const seq = [0, 1, 2, 3, 4].map((i) => backoffMs(i));
  for (let i = 1; i < seq.length; i++) {
    assert.ok(seq[i] > seq[i - 1], `第 ${i} 次等待应更久`);
  }
  // 超出次数后钳在最后一次
  assert.equal(backoffMs(99), seq[seq.length - 1]);
});

// ---------------- 帧率统计 ----------------
test('★ FPS 只统计渲染帧：120Hz 屏选 60 就显示 60', () => {
  let m = createRenderMeter();
  // 模拟：rAF 120Hz，但每两帧才渲染一次（选 60），
  // 因此每次渲染距上次渲染过了 2/120 = 1/60 秒
  for (let i = 0; i < 120; i++) m = pushRender(m, 2 / 120);
  assert.ok(Math.abs(m.fps - 60) < 1, `期望约 60，实得 ${m.fps}`);
});

test('★ 切后台后重置统计，巨大 dt 不会污染读数', () => {
  let m = createRenderMeter();
  for (let i = 0; i < 40; i++) m = pushRender(m, 1 / 60);
  // 后台停留：不推进（调用方暂停循环），回来时重置
  m = resetMeter();
  for (let i = 0; i < 40; i++) m = pushRender(m, 1 / 60);
  assert.ok(Math.abs(m.fps - 60) < 1, `期望约 60，实得 ${m.fps}`);
});

// ---------------- 控件布局 ----------------
test('★ 换弹 / 治疗物已右移，不再压在屏幕正下方', () => {
  assert.ok(DEFAULT_POS.heal[0] > 0.55, `治疗物 x=${DEFAULT_POS.heal[0]} 应靠右`);
  assert.ok(DEFAULT_POS.reload[0] > 0.64, `换弹 x=${DEFAULT_POS.reload[0]} 应靠右`);
  assert.ok(DEFAULT_POS.reload[0] > DEFAULT_POS.heal[0], '换弹应在治疗物右侧');
});

test('★ 新位置不与跳跃键重叠', () => {
  const c = defaultControls();
  const jump = rectOf('jump', c.jump, BASE_W, BASE_H);
  const reload = rectOf('reload', c.reload, BASE_W, BASE_H);
  assert.ok(reload.x + reload.w < jump.x,
    `换弹右缘 ${(reload.x + reload.w).toFixed(0)} 应小于跳跃左缘 ${jump.x.toFixed(0)}`);
});

test('★ 旧存档的 heal/reload 会被迁移到新位置', () => {
  const old = {
    ...defaultSettings(),
    controlsVer: 1,
    controls: {
      ...defaultControls(),
      heal: { x: 0.44, y: 0.845, s: 1.4, a: 0.5 },   // 用户自定义过大小
      reload: { x: 0.56, y: 0.845, s: 1, a: 1 },
    },
  };
  const out = sanitize(JSON.parse(JSON.stringify(old)));
  assert.equal(out.controls.heal.x, DEFAULT_POS.heal[0], '位置应迁到新默认');
  assert.equal(out.controls.heal.s, 1.4, '但用户自定义的大小要保留');
  assert.equal(out.controlsVer, CONTROLS_VER);
});

test('★ 当前版本存档不会被迁移覆盖', () => {
  const cur = {
    ...defaultSettings(),
    controlsVer: CONTROLS_VER,
    controls: { ...defaultControls(), heal: { x: 0.30, y: 0.40, s: 1, a: 1 } },
  };
  const out = sanitize(JSON.parse(JSON.stringify(cur)));
  assert.equal(out.controls.heal.x, 0.30);
});

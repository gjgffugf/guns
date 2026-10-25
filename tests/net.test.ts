import { test } from 'node:test';
import * as assert from 'node:assert';
import { toWsUrl, parseHost } from '../src/net/client';

test('地址: 裸 IP + 端口', () => {
  assert.equal(toWsUrl('192.168.1.10', 19000), 'ws://192.168.1.10:19000');
});

test('地址: 127.0.0.1（手机本机开服）', () => {
  assert.equal(toWsUrl('127.0.0.1', 19000), 'ws://127.0.0.1:19000');
});

test('★ 地址: 带 ws:// 协议时不再重复拼端口', () => {
  assert.equal(toWsUrl('ws://192.168.1.10:19000', 19000), 'ws://192.168.1.10:19000');
});

test('★ 地址: wss:// 域名走 443，不会算出 444', () => {
  const p = parseHost('wss://srv.example.com', 443);
  assert.equal(p.port, 443);
  assert.equal(p.scheme, 'wss');
  assert.equal(toWsUrl('wss://srv.example.com', 443), 'wss://srv.example.com:443');
});

test('★ 地址: https:// 自动映射成 wss://', () => {
  assert.equal(toWsUrl('https://srv.example.com', 19000), 'wss://srv.example.com:443');
});

test('地址: 地址自带端口时以自带的为准', () => {
  assert.equal(toWsUrl('ws://10.0.0.5:20000', 19000), 'ws://10.0.0.5:20000');
});

test('地址: 裸地址自带端口', () => {
  assert.equal(toWsUrl('10.0.0.5:20000', 19000), 'ws://10.0.0.5:20000');
});

test('地址: 多余斜杠不影响', () => {
  assert.equal(toWsUrl('ws://srv.example.com/', 19000), 'ws://srv.example.com:80');
});

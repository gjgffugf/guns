/** 极简 DOM 助手（避免引入框架，保持体积与可控性） */

import { sfx } from '../core/sfx';

type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') n.className = String(v);
    else if (k === 'text') n.textContent = String(v);
    else if (k === 'html') n.innerHTML = String(v);
    else n.setAttribute(k, String(v));
  }
  for (const c of children) n.append(c);
  return n;
}

/**
 * 按钮。默认带点击音 —— 在这里统一加，不用每个界面各自记得调，
 * 也不会出现"主菜单有声、设置页没声"这种漏掉的情况。
 * 需要静音的按钮传 silent=true。
 */
export function btn(
  label: string,
  cls = 'btn',
  onClick?: () => void,
  silent = false,
): HTMLButtonElement {
  const b = el('button', { class: cls, type: 'button', text: label });
  b.addEventListener('click', () => {
    if (!silent) sfx.click();
    onClick?.();
  });
  return b;
}

export function show(node: HTMLElement | null, on: boolean): void {
  if (!node) return;
  // ★ 用 display:none，而不是 visibility/opacity。
  //   DOM 里 display:none 的元素确实不参与事件命中 —— 从机制上杜绝
  //   "隐藏层吞掉点击"这一类问题。
  node.classList.toggle('hidden', !on);
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** 视口尺寸（CSS 像素）—— 与触摸事件的 clientX/clientY 同一坐标系 */
export function viewport(): { w: number; h: number } {
  return { w: window.innerWidth, h: window.innerHeight };
}

/** 屏幕是否横屏 */
export function isLandscape(): boolean {
  return window.innerWidth >= window.innerHeight;
}

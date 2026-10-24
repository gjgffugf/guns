import { el, btn, show } from './dom';
import type { Settings } from '../core/settings';

export interface MenuHandlers {
  onSolo: () => void;
  onMulti: () => void;
  onRoom: () => void;
  onSettings: () => void;
}

export class MainMenu {
  private node: HTMLElement;
  private toastEl: HTMLElement | null = null;

  constructor(parent: HTMLElement, h: MenuHandlers, _s: Settings) {
    void _s;
    this.node = el('div', { class: 'layer hidden', id: 'menu' });

    const wrap = el('div', { class: 'wrap' });

    const left = el('div', { class: 'left' });
    left.append(
      el('div', { class: 'title', text: '破绷战场' }),
      el('div', { class: 'sub', text: 'B R E A K B I N D   B A T T L E F I E L D' }),
      el('div', { class: 'foot', text: 'xfan.games.gun   v0.2.0' }),
    );

    const right = el('div', { class: 'right' });
    const mode = (t: string, d: string, bg: string, onClick: () => void): HTMLButtonElement => {
      const b = el('button', { class: 'mode', type: 'button' });
      b.style.background = bg;
      b.append(el('div', { class: 't', text: t }), el('div', { class: 'd', text: d }));
      b.addEventListener('click', onClick);
      return b;
    };
    right.append(
      mode('单 人 模 式', '离线训练场 · 含 1 名战术人机', 'rgba(178,32,36,.92)', h.onSolo),
      mode('多 人 模 式', '连接自建服务器 · 联机对战', 'rgba(30,74,124,.92)', h.onMulti),
      mode('开 房 间', '功能开发中 · 敬请期待', 'rgba(48,52,62,.92)', h.onRoom),
    );

    wrap.append(left, right);
    const gear = btn('设置', 'gear', h.onSettings);
    this.node.append(wrap, gear);
    parent.append(this.node);
  }

  open(): void { show(this.node, true); }
  close(): void { show(this.node, false); }

  toast(msg: string): void {
    if (!this.toastEl) {
      this.toastEl = el('div', {
        class: 'notice', text: msg,
      });
      this.toastEl.style.cssText =
        'position:absolute;left:50%;bottom:16%;transform:translateX(-50%);'
        + 'background:rgba(0,0,0,.72);padding:14px 26px;border-radius:12px;font-size:20px;';
      this.node.append(this.toastEl);
    }
    this.toastEl.textContent = msg;
    show(this.toastEl, true);
    window.setTimeout(() => show(this.toastEl, false), 1800);
  }
}

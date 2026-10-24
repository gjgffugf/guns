import { el, show } from './dom';

/** 真实加载动画：由实际进度驱动（不是假进度条） */

const TIPS = [
  '正在生成战场…', '正在校准准星…', '正在装填弹药…',
  '正在部署战术人机…', '正在同步服务器…', '正在擦拭绷带…',
];

export class LoadingScreen {
  private node: HTMLElement;
  private barIn: HTMLElement;
  private pct: HTMLElement;
  private tip: HTMLElement;
  private guard = 0;

  constructor(parent: HTMLElement) {
    this.node = el('div', { class: 'layer hidden', id: 'loading' });
    this.barIn = el('i');
    this.pct = el('div', { class: 'pct', text: '0%' });
    this.tip = el('div', { class: 'tip', text: TIPS[Math.floor(Math.random() * TIPS.length)] });
    const bar = el('div', { class: 'bar' });
    bar.append(this.barIn);
    const ring = el('div', { class: 'ring' });
    this.node.append(ring, this.pct, bar, this.tip);
    parent.append(this.node);
  }

  /** 显示加载层 */
  open(): void {
    show(this.node, true);
    this.setProgress(0);
    // 超时兜底：无论发生什么都不能永久卡住
    this.guard = window.setTimeout(() => {
      console.warn('[Loading] 超时，强制收起（请查看上方报错）');
      this.close();
    }, 20000);
  }

  setProgress(p: number): void {
    const v = Math.max(0, Math.min(1, p));
    this.barIn.style.width = `${v * 100}%`;
    this.pct.textContent = `${Math.round(v * 100)}%`;
  }

  close(): void {
    if (this.guard) window.clearTimeout(this.guard);
    this.guard = 0;
    show(this.node, false);
  }
}

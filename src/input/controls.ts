import { el } from '../ui/dom';
import {
  CONTROL_KEYS, CONTROL_NAMES, rectOf, hitTest, clampCenter,
  type ControlKey, type ControlCfg,
} from '../core/layout';

/**
 * 触摸控件层。
 *
 * ★ 为什么不会再出现"控件看不见 / 点了没反应"：
 *   1. 控件是绝对定位的 DOM 元素，位置由 core/layout 算出（CSS 像素）
 *   2. 触摸用 Pointer Events，坐标取 clientX/clientY（同样是 CSS 像素）
 *   3. 两者是同一坐标系，中间没有任何变换矩阵 —— 无需换算
 *   4. 容器 pointer-events:none，只有控件本身 pointer-events:auto，
 *      不会出现"透明遮罩吞事件"
 *
 * 全部控件用 pointerdown 捕获（不是 click），保证按下即响应，
 * 且天然支持多指同时操作（摇杆 + 开火 + 跳跃）。
 */

export interface CtrlEvent {
  key: ControlKey;
  /** down / move / up */
  phase: 'down' | 'move' | 'up';
  /** 触点在控件内的归一化偏移（-1~1，相对控件中心与半径） */
  nx: number;
  ny: number;
  pointerId: number;
}

export interface LookEvent {
  dx: number;
  dy: number;
  pointerId: number;
  phase: 'down' | 'move' | 'up';
}

type CtrlHandler = (e: CtrlEvent) => void;
type LookHandler = (e: LookEvent) => void;

export class TouchControls {
  private root: HTMLElement;
  private nodes = new Map<ControlKey, HTMLElement>();
  private cfg: Record<ControlKey, ControlCfg>;
  private onCtrl: CtrlHandler;
  private onLook: LookHandler;

  /** pointerId -> 命中的控件 */
  private held = new Map<number, ControlKey>();
  /** pointerId -> 上一次位置（用于算转视角增量） */
  private last = new Map<number, { x: number; y: number }>();
  /** 正在转视角的手指 */
  private looking = new Set<number>();

  constructor(
    parent: HTMLElement,
    cfg: Record<ControlKey, ControlCfg>,
    onCtrl: CtrlHandler,
    onLook: LookHandler,
  ) {
    this.cfg = cfg;
    this.onCtrl = onCtrl;
    this.onLook = onLook;

    this.root = el('div', { class: 'layer', id: 'touch' });
    // 整层穿透：只有控件本身接收事件
    this.root.style.pointerEvents = 'none';
    parent.append(this.root);

    for (const k of CONTROL_KEYS) {
      const n = el('div', { class: `ctrl ${k}`, text: CONTROL_NAMES[k] });
      n.style.position = 'absolute';
      n.style.pointerEvents = 'auto';
      this.nodes.set(k, n);
      this.root.append(n);
    }

    // 指针事件挂在 window 上：手指滑出控件范围也能继续收到 move/up，
    // 这样"长按开火后滑动瞄准"才成立。
    window.addEventListener('pointerdown', this.down, { passive: false });
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up, { passive: false });
    window.addEventListener('pointercancel', this.up, { passive: false });

    window.addEventListener('resize', () => this.relayout());
    this.relayout();
  }

  setConfig(cfg: Record<ControlKey, ControlCfg>): void {
    this.cfg = cfg;
    this.relayout();
  }

  /** 重新摆放所有控件（位置 / 尺寸 / 透明度） */
  relayout(): void {
    const { w, h } = { w: window.innerWidth, h: window.innerHeight };
    for (const k of CONTROL_KEYS) {
      const n = this.nodes.get(k);
      if (!n) continue;
      const r = rectOf(k, this.cfg[k], w, h);
      n.style.left = `${r.x}px`;
      n.style.top = `${r.y}px`;
      n.style.width = `${r.w}px`;
      n.style.height = `${r.h}px`;
      n.style.opacity = String(this.cfg[k].a);
      // 摇杆用横椭圆更顺手；其余保持圆形
      n.style.borderRadius = k === 'stick' ? '50%' : '50%';
    }
  }

  private down = (ev: PointerEvent): void => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    const hit = hitTest(this.cfg, window.innerWidth, window.innerHeight, ev.clientX, ev.clientY);
    this.last.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (hit) {
      // 命中控件：阻止默认行为，避免触发浏览器手势
      ev.preventDefault();
      this.held.set(ev.pointerId, hit);
      const node = this.nodes.get(hit);
      if (node) node.classList.add('active');
      this.emitCtrl(hit, 'down', ev);
      // 摇杆按下时同步记一次视角基准点，
      // 这样"按住开火不动 + 另一根手指转视角"两根手指互不干扰。
      this.onLook({ dx: 0, dy: 0, pointerId: ev.pointerId, phase: 'down' });
    } else {
      // 空白区 -> 转视角
      this.looking.add(ev.pointerId);
      this.onLook({ dx: 0, dy: 0, pointerId: ev.pointerId, phase: 'down' });
    }
  };

  private move = (ev: PointerEvent): void => {
    const prev = this.last.get(ev.pointerId);
    if (!prev) return;
    const dx = ev.clientX - prev.x;
    const dy = ev.clientY - prev.y;
    this.last.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    const key = this.held.get(ev.pointerId);
    if (key) {
      ev.preventDefault();
      this.emitCtrl(key, 'move', ev);
      // ★ 按住按钮滑动时同时转视角（滑动开火 / 边跳边瞄）。
      //   唯一例外是摇杆：左手拇指在摇杆上滑动是【移动】，
      //   如果这时还转视角，走位会被自己转晕。
      if (key !== 'stick') {
        this.onLook({ dx, dy, pointerId: ev.pointerId, phase: 'move' });
      }
      return;
    }
    if (this.looking.has(ev.pointerId)) {
      ev.preventDefault();
      this.onLook({ dx, dy, pointerId: ev.pointerId, phase: 'move' });
    }
  };

  private up = (ev: PointerEvent): void => {
    const key = this.held.get(ev.pointerId);
    if (key) {
      const node = this.nodes.get(key);
      if (node) node.classList.remove('active');
      this.emitCtrl(key, 'up', ev);
      this.held.delete(ev.pointerId);
    }
    if (this.looking.has(ev.pointerId)) {
      this.onLook({ dx: 0, dy: 0, pointerId: ev.pointerId, phase: 'up' });
      this.looking.delete(ev.pointerId);
    }
    this.last.delete(ev.pointerId);
  };

  private emitCtrl(key: ControlKey, phase: 'down' | 'move' | 'up', ev: PointerEvent): void {
    const r = rectOf(key, this.cfg[key], window.innerWidth, window.innerHeight);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const nx = (ev.clientX - cx) / (r.w / 2);
    const ny = (ev.clientY - cy) / (r.h / 2);
    this.onCtrl({ key, phase, nx, ny, pointerId: ev.pointerId });
  }

  /** 供设置页"控件编辑"复用：把拖动后的配置夹回安全区 */
  static clamp(cfg: ControlCfg): ControlCfg {
    return clampCenter(cfg);
  }

  destroy(): void {
    window.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.up);
    this.root.remove();
  }
}

/**
 * 控件布局（纯函数，可单元测试）。
 *
 * 设计基准 1280x720（横屏）。控件位置以 0~1 的比例存储，
 * 运行时换算成 CSS 像素。
 *
 * ★ 为什么这套不会再出 Godot 那轮的坐标系 bug：
 *   控件是 DOM 元素，位置用 CSS 像素；触摸事件的 clientX/clientY
 *   也是 CSS 像素。两者天然同一坐标系，中间没有任何变换矩阵，
 *   不需要 get_final_transform() 之类的换算 —— 从架构上消除了隐患。
 */

export const BASE_W = 1280;
export const BASE_H = 720;

export type ControlKey =
  | 'stick' | 'fire' | 'ads' | 'jump' | 'crouch'
  | 'prone' | 'reload' | 'melee' | 'heal';

export interface ControlCfg {
  /** 中心点比例 x (0~1) */
  x: number;
  /** 中心点比例 y (0~1) */
  y: number;
  /** 缩放倍率 */
  s: number;
  /** 透明度 0.25~1 */
  a: number;
}

/** 各控件在 1280x720 下的基准尺寸（中心对齐） */
export const BASE_SIZE: Record<ControlKey, [number, number]> = {
  // 屏幕高只有 720，96px 的按钮占到 13% 高度，太占地方。
  // 统一收到 76px（约 10.5%），摇杆也相应缩小，给视野留出空间。
  stick: [228, 218],
  fire: [78, 78],
  ads: [76, 76],
  jump: [76, 76],
  crouch: [76, 76],
  prone: [76, 76],
  reload: [76, 76],
  melee: [76, 76],
  heal: [84, 84],
};

/** 默认中心点比例 */
export const DEFAULT_POS: Record<ControlKey, [number, number]> = {
  // 开火键在基准位置上 x-8、y+6
  stick: [0.1281, 0.7556],
  fire: [0.9344, 0.9028],
  ads: [0.9406, 0.7389],
  jump: [0.8531, 0.8944],
  crouch: [0.8531, 0.7389],
  prone: [0.8531, 0.5833],
  reload: [0.9406, 0.5833],
  melee: [0.9406, 0.4444],
  heal: [0.2813, 0.8722],
};

export const CONTROL_KEYS: ControlKey[] = [
  'stick', 'fire', 'ads', 'jump', 'crouch', 'prone', 'reload', 'melee', 'heal',
];

export const CONTROL_NAMES: Record<ControlKey, string> = {
  stick: '移动摇杆', fire: '开火', ads: '开镜', jump: '跳跃',
  crouch: '蹲下', prone: '趴下', reload: '换弹', melee: '切换武器', heal: '治疗物',
};

export function defaultControls(): Record<ControlKey, ControlCfg> {
  const out = {} as Record<ControlKey, ControlCfg>;
  for (const k of CONTROL_KEYS) {
    const p = DEFAULT_POS[k];
    out[k] = { x: p[0], y: p[1], s: 1, a: k === 'stick' ? 0.85 : 0.92 };
  }
  return out;
}

/**
 * UI 缩放：取宽高中较小的缩放比，保证 1280x720 的内容完整可见。
 * 任意分辨率 / 任意 DPI 都成立。
 */
export function uiScale(vw: number, vh: number): number {
  if (vw <= 0 || vh <= 0) return 1;
  return Math.min(vw / BASE_W, vh / BASE_H);
}

/** 控件的像素尺寸 */
export function sizeOf(key: ControlKey, cfg: ControlCfg, vw: number, vh: number): [number, number] {
  const b = BASE_SIZE[key];
  const u = uiScale(vw, vh);
  return [b[0] * u * cfg.s, b[1] * u * cfg.s];
}

/** 控件中心的像素坐标 */
export function centerOf(cfg: ControlCfg, vw: number, vh: number): [number, number] {
  return [cfg.x * vw, cfg.y * vh];
}

export interface Rect { x: number; y: number; w: number; h: number; }

/** 控件矩形（左上角 + 宽高，中心对齐） */
export function rectOf(key: ControlKey, cfg: ControlCfg, vw: number, vh: number): Rect {
  const [w, h] = sizeOf(key, cfg, vw, vh);
  const [cx, cy] = centerOf(cfg, vw, vh);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function pointInRect(r: Rect, px: number, py: number): boolean {
  return px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
}

/**
 * 命中测试：返回被点中的控件名，没有则返回 null。
 *
 * 从后往前遍历 —— 数组里靠后的控件画在上层，应当优先命中。
 */
export function hitTest(
  controls: Record<ControlKey, ControlCfg>,
  vw: number,
  vh: number,
  px: number,
  py: number,
  order: ControlKey[] = CONTROL_KEYS,
): ControlKey | null {
  if (vw < 2 || vh < 2) return null;
  for (let i = order.length - 1; i >= 0; i--) {
    const k = order[i];
    const cfg = controls[k];
    if (!cfg) continue;
    const r = rectOf(k, cfg, vw, vh);
    // 尺寸过小的控件不参与命中，避免零尺寸矩形误吞点击
    if (r.w < 4 || r.h < 4) continue;
    if (pointInRect(r, px, py)) return k;
  }
  return null;
}

/** 把比例坐标限制在安全区内，避免控件被拖出屏幕 */
export function clampCenter(cfg: ControlCfg): ControlCfg {
  return {
    ...cfg,
    x: Math.min(0.97, Math.max(0.03, cfg.x)),
    y: Math.min(0.96, Math.max(0.04, cfg.y)),
  };
}

/**
 * ★ 按【控件自身尺寸】夹取，保证整个控件都在屏幕内。
 *
 * clampCenter 只夹中心点的比例，对摇杆这种大控件不够用：
 * 中心在 0.93 时控件下缘已经出屏，表现出来的就是"摇杆半个看不见"。
 * 这里用控件在基准分辨率下的占比反推允许的边界。
 */
export function clampControl(key: ControlKey, cfg: ControlCfg): ControlCfg {
  const [bw, bh] = BASE_SIZE[key];
  const w = (bw * cfg.s) / BASE_W;
  const h = (bh * cfg.s) / BASE_H;
  const hw = w / 2;
  const hh = h / 2;
  const m = 0.01;                       // 贴边留 1%
  const loX = hw + m;
  const hiX = 1 - hw - m;
  const loY = hh + m;
  const hiY = 1 - hh - m;
  return {
    ...cfg,
    x: loX >= hiX ? 0.5 : Math.min(hiX, Math.max(loX, cfg.x)),
    y: loY >= hiY ? 0.5 : Math.min(hiY, Math.max(loY, cfg.y)),
  };
}

/** 控件矩形是否完整落在屏幕内（用于自检与测试） */
export function insideScreen(key: ControlKey, cfg: ControlCfg): boolean {
  const [bw, bh] = BASE_SIZE[key];
  const cx = cfg.x * BASE_W;
  const cy = cfg.y * BASE_H;
  const w = bw * cfg.s;
  const h = bh * cfg.s;
  return cx - w / 2 >= -0.5 && cy - h / 2 >= -0.5
    && cx + w / 2 <= BASE_W + 0.5 && cy + h / 2 <= BASE_H + 0.5;
}

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
  stick: [272, 260],
  fire: [96, 96],
  ads: [96, 96],
  jump: [96, 96],
  crouch: [96, 96],
  prone: [96, 96],
  reload: [96, 96],
  melee: [96, 96],
  heal: [104, 104],
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

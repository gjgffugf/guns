/** 轻量向量运算（纯函数，不依赖 three，便于单元测试） */
export interface V3 { x: number; y: number; z: number; }

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const len = (a: V3): number => Math.hypot(a.x, a.y, a.z);
export const lenXZ = (a: V3): number => Math.hypot(a.x, a.z);

export function norm(a: V3): V3 {
  const l = len(a);
  return l < 1e-9 ? v3() : scale(a, 1 / l);
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 水平距离（忽略 y） */
export function distXZ(a: V3, b: V3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

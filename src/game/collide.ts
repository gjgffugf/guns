/**
 * 碰撞（纯函数，可单元测试）。
 *
 * 之前完全没有碰撞逻辑：玩家能走出场外、人机直接穿墙。
 * 这里用"圆柱体 + 圆形"近似：
 *   - 角色是半径 r 的竖直圆柱
 *   - 障碍物是半径 R 的竖直圆柱（箱子用外接圆近似，略保守但不会穿模）
 *   - 地面高度由 world.ts 的 groundHeight 提供，斜坡连续可走
 */

import type { V3 } from '../core/vec';

export interface Cylinder {
  pos: V3;
  r: number;
  h: number;
}

/**
 * 把角色推到障碍物外面。
 * 只在"角色当前高度低于障碍物顶部"时生效 —— 否则就是站在箱子上面，不该被推开。
 */
export function resolveAgainst(
  pos: V3,
  radius: number,
  feetY: number,
  obs: Cylinder[],
): V3 {
  let x = pos.x;
  let z = pos.z;

  for (const o of obs) {
    // 站在它顶上就不管
    if (feetY >= o.h - 0.05) continue;
    const dx = x - o.pos.x;
    const dz = z - o.pos.z;
    const minD = o.r + radius;
    let d2 = dx * dx + dz * dz;
    if (d2 >= minD * minD) continue;

    let d = Math.sqrt(d2);
    if (d < 1e-6) {
      // 正好在圆心：随便挑个方向推出去，避免出现 NaN
      x = o.pos.x + minD;
      z = o.pos.z;
      continue;
    }
    const push = (minD - d) / d;
    x += dx * push;
    z += dz * push;
    d2 = minD * minD;
  }
  return { x, y: pos.y, z };
}

/** 限制在世界边界内（留出角色半径，避免半个身子出墙） */
export function clampToBounds(pos: V3, radius: number, bounds: number): V3 {
  const lim = Math.max(0.1, bounds - radius);
  return {
    x: Math.min(lim, Math.max(-lim, pos.x)),
    y: pos.y,
    z: Math.min(lim, Math.max(-lim, pos.z)),
  };
}

/**
 * 完整的水平解算：先推出障碍物，再夹回边界，最后再推一次。
 * 两遍是必要的：夹回边界可能又把你推进障碍物里。
 */
export function resolveHorizontal(
  pos: V3,
  radius: number,
  feetY: number,
  obs: Cylinder[],
  bounds: number,
): V3 {
  let p = resolveAgainst(pos, radius, feetY, obs);
  p = clampToBounds(p, radius, bounds);
  p = resolveAgainst(p, radius, feetY, obs);
  return clampToBounds(p, radius, bounds);
}

/**
 * 线段是否直接穿过某个障碍物的内部（穿模检测）。
 *
 * 只判断"圆心到线段的距离 < o.r"（不加角色半径）——
 * 因为角色贴着墙走时本来就应该贴到 o.r + radius，
 * 如果把 radius 也算进去，贴墙滑行会被误判成穿模而彻底卡死。
 */
function crossesSolid(
  ax: number, az: number,
  bx: number, bz: number,
  obs: Cylinder[],
  feetY: number,
): boolean {
  const sx = bx - ax;
  const sz = bz - az;
  const len2 = sx * sx + sz * sz;
  if (len2 < 1e-12) return false;

  for (const o of obs) {
    if (feetY >= o.h - 0.05) continue;         // 站在顶上，不算
    const ex = o.pos.x - ax;
    const ez = o.pos.z - az;
    let t = (ex * sx + ez * sz) / len2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const px = ax + sx * t;
    const pz = az + sz * t;
    const d = Math.hypot(o.pos.x - px, o.pos.z - pz);
    if (d < o.r) return true;                  // 这一步直接跨过了障碍内部
  }
  return false;
}

/**
 * 扫掠移动：切成小段逐段推进，每段解算一次，能沿墙滑行。
 *
 * ★ 之前的实现有个严重手感 bug：贴着墙就不能侧向移动。
 *   原因是"某个轴一旦被挡住就永久停止推进"（blockX / blockZ）。
 *   对圆形障碍来说这是错的 —— 顶着圆走时，沿切线方向本来就该能走，
 *   永久锁轴会把角色钉死在墙上。
 *
 *   现在的做法：每段直接接受【解算后的位置】。解算把角色推到圆外，
 *   切线分量自然保留，于是能贴着墙滑行。
 *   穿模由 crossesSolid() 单独拦：一小步若跨过障碍内部就停止推进。
 *   因为 MAX_STEP(0.2) 远小于任何障碍直径，正常移动不会触发。
 */
const MAX_STEP = 0.2;

export function sweepMove(
  from: V3,
  to: V3,
  radius: number,
  feetY: number,
  obs: Cylinder[],
  bounds: number,
): V3 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / MAX_STEP));

  let cx = from.x;
  let cz = from.z;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const tx = from.x + dx * t;
    const tz = from.z + dz * t;

    // 这一小步会穿过障碍内部 → 停止推进（防穿模）
    if (crossesSolid(cx, cz, tx, tz, obs, feetY)) break;

    // 接受解算结果（沿墙滑行的关键）
    const r = resolveHorizontal({ x: tx, y: to.y, z: tz }, radius, feetY, obs, bounds);
    cx = r.x;
    cz = r.z;
  }

  return { x: cx, y: to.y, z: cz };
}

/** 判断一个点是否在障碍物内部（用于出生点检查） */
export function insideAny(pos: V3, radius: number, obs: Cylinder[]): boolean {
  for (const o of obs) {
    if (Math.hypot(pos.x - o.pos.x, pos.z - o.pos.z) < o.r + radius) return true;
  }
  return false;
}

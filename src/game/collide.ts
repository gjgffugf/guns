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
 * 扫掠移动：把位移切成小段逐段推进，撞上就停，能沿墙滑行。
 *
 * ★ 为什么不用"只解算终点"：那样高速移动会直接穿过障碍物
 *   （一帧从 -5 跨到 +5，终点和起点都在障碍外，中间却被穿过去了）。
 *   逐段推进保证任何速度下都不会穿模。
 *   每小步再逐轴尝试，于是顶着墙时仍能沿墙滑行，不会被彻底卡死。
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
  // ★ 一旦某个轴被挡住，本次移动就【永久】停止该轴推进。
  //   只判断采样点是不够的：障碍另一侧的点同样是"合法"的，
  //   否则会出现"一小步跨过障碍、后面继续前进"的穿模。
  let blockX = false;
  let blockZ = false;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const tx = from.x + dx * t;
    const tz = from.z + dz * t;

    if (!blockX) {
      const ax = resolveHorizontal({ x: tx, y: to.y, z: cz }, radius, feetY, obs, bounds);
      if (Math.abs(ax.x - tx) < 1e-6 && Math.abs(ax.z - cz) < 1e-6) cx = tx;
      else blockX = true;                    // 撞上了，这个轴不再前进
    }
    if (!blockZ) {
      const az = resolveHorizontal({ x: cx, y: to.y, z: tz }, radius, feetY, obs, bounds);
      if (Math.abs(az.z - tz) < 1e-6 && Math.abs(az.x - cx) < 1e-6) cz = tz;
      else blockZ = true;
    }
    if (blockX && blockZ) break;             // 两个方向都堵死，提前结束
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

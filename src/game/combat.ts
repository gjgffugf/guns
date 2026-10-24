import { V3, distXZ } from '../core/vec';
import type { PlayerState } from './player';
import { EYE_HEIGHT } from './player';

/**
 * 命中判定（纯逻辑，可测试）。
 * 用"射线 vs 胶囊/球体"的简化模型：把目标近似成竖直胶囊。
 */

export interface Target {
  pos: V3;
  stance: 'stand' | 'crouch' | 'prone';
  radius: number;
}

/** 目标的高度（用于胶囊顶端） */
export function targetHeight(t: Target): number {
  return EYE_HEIGHT[t.stance] + 0.18;
}

export interface RayHit {
  hit: boolean;
  /** 命中距离 */
  distance: number;
  /** 是否爆头（上半部分） */
  head: boolean;
}

/**
 * 射线与竖直胶囊求交。
 * 射线起点 origin，单位方向 dir。
 */
export function raycastTarget(origin: V3, dir: V3, t: Target, maxDist: number): RayHit {
  const h = targetHeight(t);
  // 把胶囊简化为：中心轴线段 (pos.y .. pos.y + h)，半径 radius
  const dx = t.pos.x - origin.x;
  const dz = t.pos.z - origin.z;

  // 在 XZ 平面上解：|P + d*t - C| = r  （2D 圆）
  const a = dir.x * dir.x + dir.z * dir.z;
  if (a < 1e-9) return { hit: false, distance: 0, head: false };

  const b = -2 * (dx * dir.x + dz * dir.z);
  const c = dx * dx + dz * dz - t.radius * t.radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return { hit: false, distance: 0, head: false };

  const sq = Math.sqrt(disc);
  let tNear = (-b - sq) / (2 * a);
  if (tNear < 0) tNear = (-b + sq) / (2 * a);
  if (tNear < 0 || tNear > maxDist) return { hit: false, distance: 0, head: false };

  // 参数 s：沿 3D 单位方向的距离（XZ 分量只占 sqrt(a)）
  const s = tNear / Math.sqrt(a);
  const yHit = origin.y + dir.y * s;

  if (yHit < t.pos.y - 0.05 || yHit > t.pos.y + h) {
    return { hit: false, distance: 0, head: false };
  }
  const headZone = t.pos.y + h - 0.28;
  return { hit: true, distance: s, head: yHit >= headZone };
}

/** 视线检测：是否被高度大于 obstacleH 的障碍挡住（简化：只判断目标是否可见） */
export function hasLineOfSight(from: V3, to: V3, blockers: Array<{ pos: V3; r: number; h: number }>): boolean {
  for (const b of blockers) {
    // 点到线段距离（XZ）
    const ax = from.x, az = from.z;
    const bx = to.x, bz = to.z;
    const abx = bx - ax, abz = bz - az;
    const abLen2 = abx * abx + abz * abz;
    if (abLen2 < 1e-6) continue;
    let t = ((b.pos.x - ax) * abx + (b.pos.z - az) * abz) / abLen2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + abx * t, pz = az + abz * t;
    if (Math.hypot(b.pos.x - px, b.pos.z - pz) < b.r) {
      // 障碍物高度是否挡住视线（取两端较高者判断）
      const rayY = from.y + (to.y - from.y) * t;
      if (rayY < b.h) return false;
    }
  }
  return true;
}

/** 找出射线命中的最近目标 */
export function pickTarget(
  origin: V3,
  dir: V3,
  targets: Array<Target & { id: string }>,
  maxDist: number,
): { id: string; distance: number; head: boolean } | null {
  let best: { id: string; distance: number; head: boolean } | null = null;
  for (const t of targets) {
    const r = raycastTarget(origin, dir, t, maxDist);
    if (r.hit && (best === null || r.distance < best.distance)) {
      best = { id: t.id, distance: r.distance, head: r.head };
    }
  }
  return best;
}

/** 玩家眼睛位置 */
export function eyePos(p: PlayerState): V3 {
  return { x: p.pos.x, y: p.pos.y + EYE_HEIGHT[p.stance], z: p.pos.z };
}

/** 由 yaw/pitch 生成单位方向 */
export function dirFrom(yaw: number, pitch: number): V3 {
  const cp = Math.cos(pitch);
  return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** 水平距离（复用） */
export { distXZ };

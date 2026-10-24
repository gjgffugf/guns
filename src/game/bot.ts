import { V3, v3, distXZ, clamp } from '../core/vec';
import { createPlayer, step, damage, type PlayerState, type PlayerInput, type PlayerTuning } from './player';
import type { StepWorld } from './player';
import { insideAny, type Cylinder } from './collide';

/**
 * 战术人机（纯逻辑，可测试）。
 *
 * 行为：巡逻 -> 发现玩家 -> 接近到射程内 -> 站定开火 -> 倒地 -> 重生。
 *
 * ★ 曾经的毛病：engage 阶段一直绕着玩家转圈，玩家很难瞄。
 *   现在改成"保持距离 + 开火时站定 + 少量横向微调"，
 *   并且只有在换弹冷却期间才做位置调整，正面交火时是可打的。
 */

export type BotPhase = 'patrol' | 'chase' | 'engage' | 'down';

export interface Bot {
  state: PlayerState;
  phase: BotPhase;
  /** 当前巡逻目标点 */
  target: V3;
  /** 开火冷却 */
  fireCd: number;
  kills: number;
  deaths: number;
  /** 倒地后的重生倒计时 */
  respawn: number;
  name: string;
  /** 横向微调的方向（-1/0/1），每隔几秒换一次 */
  strafeDir: number;
  strafeLeft: number;
  /** 卡住的累计时间，用于脱困 */
  stuck: number;
  lastX: number;
  lastZ: number;
}

export interface BotTuning {
  sightRange: number;
  fireRange: number;
  /** 理想交战距离 */
  keepRange: number;
  fireInterval: number;
  damage: number;
  respawnTime: number;
  /** 开火时的命中率（距离越近越高） */
  accuracyNear: number;
  accuracyFar: number;
}

export const BOT_TUNING: BotTuning = {
  sightRange: 42,
  fireRange: 26,
  keepRange: 14,
  fireInterval: 0.95,
  damage: 9,
  respawnTime: 3.0,
  accuracyNear: 0.62,
  accuracyFar: 0.28,
};

/** 巡逻点（地图四周，远离掩体） */
export const PATROL_POINTS: V3[] = [
  v3(-18, 0, -18), v3(18, 0, -18), v3(18, 0, 18), v3(-18, 0, 18),
  v3(0, 0, -26), v3(0, 0, 26), v3(-26, 0, 0), v3(26, 0, 0),
];

export function createBot(name: string, pos: V3): Bot {
  return {
    state: createPlayer(pos),
    phase: 'patrol',
    target: { ...pos },
    fireCd: 0,
    kills: 0,
    deaths: 0,
    respawn: 0,
    name,
    strafeDir: 0,
    strafeLeft: 0,
    stuck: 0,
    lastX: pos.x,
    lastZ: pos.z,
  };
}

/** 简易确定性随机（便于测试复现） */
export function pickPatrol(seed: number): V3 {
  return PATROL_POINTS[Math.abs(Math.floor(seed)) % PATROL_POINTS.length];
}

export interface BotWorld {
  /** 玩家当前位置 */
  playerPos: V3;
  /** 玩家是否存活 */
  playerAlive: boolean;
  /** 世界边界，避免人机走出地图 */
  bounds: number;
  /** 障碍物（避免人机穿墙） */
  obstacles: Cylinder[];
  /** 地面高度 */
  heightAt(x: number, z: number): number;
  /** 角色半径 */
  radius: number;
}

/**
 * 步进一个 Bot。返回新状态 + 本帧是否对玩家造成伤害。
 */
export function stepBot(
  b: Bot,
  world: BotWorld,
  dt: number,
  pt: PlayerTuning,
  bt: BotTuning = BOT_TUNING,
): { bot: Bot; hitPlayer: boolean } {
  const n: Bot = {
    ...b,
    state: { ...b.state },
    fireCd: Math.max(0, b.fireCd - dt),
  };
  let hitPlayer = false;

  // ---- 倒地 / 重生 ----
  if (n.phase === 'down' || !n.state.alive) {
    n.phase = 'down';
    n.respawn = Math.max(0, n.respawn - dt);
    if (n.respawn <= 0) {
      const p = pickPatrol(Math.floor(Math.random() * PATROL_POINTS.length));
      n.state = createPlayer(v3(p.x, 0, p.z));
      n.phase = 'patrol';
      n.target = { ...p };
      n.strafeLeft = 0;
      n.stuck = 0;
    }
    return { bot: n, hitPlayer };
  }

  const d = distXZ(n.state.pos, world.playerPos);

  // ---- 阶段判定 ----
  if (!world.playerAlive) {
    n.phase = 'patrol';
  } else if (d < bt.sightRange) {
    n.phase = d <= bt.fireRange ? 'engage' : 'chase';
  } else {
    n.phase = 'patrol';
  }

  // ---- 移动意图 ----
  const inp: PlayerInput = {
    axisX: 0, axisY: 0, jumpPressed: false,
    wantCrouch: false, wantProne: false, autoSprint: false,
  };

  // 面向玩家（交战时）或面向行进方向（巡逻时）
  let faceX = 0;
  let faceZ = 0;

  if (n.phase === 'patrol') {
    if (distXZ(n.state.pos, n.target) < 2.5) {
      n.target = pickPatrol(Math.floor(Math.random() * PATROL_POINTS.length));
    }
    faceX = n.target.x - n.state.pos.x;
    faceZ = n.target.z - n.state.pos.z;
  } else {
    faceX = world.playerPos.x - n.state.pos.x;
    faceZ = world.playerPos.z - n.state.pos.z;
    // 卡住了就随机换个横向方向脱困
    n.strafeLeft -= dt;
    if (n.strafeLeft <= 0) {
      n.strafeLeft = 1.2 + Math.random() * 1.6;
      n.strafeDir = [-1, 0, 0, 1][Math.floor(Math.random() * 4)];
    }
  }

  const fl = Math.hypot(faceX, faceZ);
  if (fl > 1e-4) {
    n.state.yaw = Math.atan2(faceX, -faceZ);
  }

  if (n.phase === 'patrol') {
    if (fl > 0.4) inp.axisY = -1;          // 向前走
  } else if (n.phase === 'chase') {
    inp.axisY = -1;
    inp.autoSprint = true;
  } else {
    // ★ engage：保持距离，【不绕圈】
    //   正对着玩家，只在冷却期间做小幅横向调整，开火瞬间站定 —— 好瞄也好打
    if (d > bt.keepRange * 1.15) inp.axisY = -1;          // 太远，压上去
    else if (d < bt.keepRange * 0.75) inp.axisY = 1;      // 太近，后退
    else inp.axisY = 0;                                    // 距离合适，站定
    // 冷却中才横移，开火时不横移
    if (n.fireCd > 0.25) inp.axisX = n.strafeDir;
    else inp.axisX = 0;
  }

  const sw: StepWorld = {
    bounds: world.bounds,
    obstacles: world.obstacles,
    radius: world.radius,
    heightAt: world.heightAt,
  };
  n.state = step(n.state, inp, dt, pt, sw);

  // ---- 脱困：撞墙/卡住时换个巡逻点或掉头 ----
  const moved = Math.hypot(n.state.pos.x - n.lastX, n.state.pos.z - n.lastZ);
  const wants = Math.abs(inp.axisX) + Math.abs(inp.axisY) > 0.1;
  if (wants && moved < 0.012) n.stuck += dt; else n.stuck = Math.max(0, n.stuck - dt * 2);
  n.lastX = n.state.pos.x;
  n.lastZ = n.state.pos.z;
  if (n.stuck > 0.7) {
    n.stuck = 0;
    if (n.phase === 'patrol') {
      n.target = pickPatrol(Math.floor(Math.random() * PATROL_POINTS.length));
    } else {
      n.strafeDir = -n.strafeDir || 1;
      n.strafeLeft = 0.8;
    }
  }

  // ---- 开火 ----
  if (n.phase === 'engage' && world.playerAlive && n.fireCd <= 0 && d <= bt.fireRange) {
    n.fireCd = bt.fireInterval;
    // 距离越远命中率越低
    const k = clamp(d / bt.fireRange, 0, 1);
    const acc = bt.accuracyNear * (1 - k) + bt.accuracyFar * k;
    if (Math.random() < acc) hitPlayer = true;
  }

  return { bot: n, hitPlayer };
}

/** 对人造成伤害 */
export function hurtBot(b: Bot, amount: number): Bot {
  const st = damage(b.state, amount);
  const n: Bot = { ...b, state: st };
  if (!st.alive && b.phase !== 'down') {
    n.phase = 'down';
    n.deaths += 1;
    n.respawn = BOT_TUNING.respawnTime;
  }
  return n;
}

/** 挑一个不在障碍物里的出生点 */
export function safeSpawn(pts: V3[], obstacles: Cylinder[], radius: number): V3 {
  for (const p of pts) {
    if (!insideAny(p, radius, obstacles)) return p;
  }
  return pts[0] ?? v3(0, 0, 0);
}

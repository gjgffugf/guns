import { V3, v3, distXZ, clamp } from '../core/vec';
import { createPlayer, step, damage, type PlayerState, type PlayerInput, type PlayerTuning } from './player';

/**
 * 战术人机（纯逻辑，可测试）。
 * 行为：巡逻 -> 发现玩家 -> 接近到射程内 -> 开火 -> 血量归零倒地 -> 若干秒后重生。
 */

export type BotPhase = 'patrol' | 'chase' | 'engage' | 'down';

export interface Bot {
  state: PlayerState;
  phase: BotPhase;
  /** 当前巡逻目标点 */
  target: V3;
  /** 开火冷却 */
  fireCd: number;
  /** 击杀 / 死亡计数 */
  kills: number;
  deaths: number;
  /** 倒地后的重生倒计时 */
  respawn: number;
  name: string;
}

export interface BotTuning {
  sightRange: number;
  fireRange: number;
  fireInterval: number;
  damage: number;
  respawnTime: number;
  moveJitter: number;
}

export const BOT_TUNING: BotTuning = {
  sightRange: 45,
  fireRange: 28,
  fireInterval: 0.85,
  damage: 9,
  respawnTime: 3.0,
  moveJitter: 0.35,
};

/** 巡逻点（地图四周） */
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
  const n: Bot = { ...b, state: { ...b.state }, fireCd: Math.max(0, b.fireCd - dt) };
  let hitPlayer = false;

  // ---- 倒地 / 重生 ----
  if (n.phase === 'down' || !n.state.alive) {
    n.phase = 'down';
    n.respawn = Math.max(0, n.respawn - dt);
    if (n.respawn <= 0 && n.deaths >= 0) {
      const p = pickPatrol(Math.floor(Math.random() * PATROL_POINTS.length));
      n.state = createPlayer(v3(p.x, 0, p.z));
      n.phase = 'patrol';
      n.target = { ...p };
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

  // ---- 生成移动意图 ----
  const inp: PlayerInput = {
    axisX: 0, axisY: 0, jumpPressed: false,
    wantCrouch: false, wantProne: false, autoSprint: true,
  };

  let dest: V3;
  if (n.phase === 'patrol') {
    if (distXZ(n.state.pos, n.target) < 2.5) {
      n.target = pickPatrol(Math.floor(Math.random() * PATROL_POINTS.length));
    }
    dest = n.target;
  } else if (n.phase === 'chase') {
    dest = world.playerPos;
  } else {
    // engage：保持距离，绕圈
    const ang = Math.atan2(world.playerPos.x - n.state.pos.x, world.playerPos.z - n.state.pos.z);
    const orbit = ang + 0.6;
    const keep = bt.fireRange * 0.7;
    dest = v3(
      world.playerPos.x + Math.sin(orbit) * keep,
      0,
      world.playerPos.z + Math.cos(orbit) * keep,
    );
  }

  // 朝向目标
  const dx = dest.x - n.state.pos.x;
  const dz = dest.z - n.state.pos.z;
  const dl = Math.hypot(dx, dz);
  if (dl > 0.001 && (n.phase !== 'engage' || dl > 1.0)) {
    n.state.yaw = Math.atan2(dx, -dz);
    // 摇杆推向目标
    const fwd = -Math.cos(n.state.yaw);
    const right = Math.sin(n.state.yaw);
    const wx = dx / dl;
    const wz = dz / dl;
    const along = wx * right + wz * fwd;
    const side = wx * right * 0 + 0;
    void side;
    inp.axisY = -clamp(along, -1, 1);
    inp.axisX = clamp((wx * Math.cos(n.state.yaw) - wz * Math.sin(n.state.yaw)) * 0 , -1, 1);
    // 简化：直接按世界方向推摇杆
    inp.axisY = -1;
  } else {
    inp.axisY = 0;
    inp.axisX = 0;
    n.state.yaw = Math.atan2(
      world.playerPos.x - n.state.pos.x,
      -(world.playerPos.z - n.state.pos.z),
    );
  }

  n.state = step(n.state, inp, dt, pt);

  // ---- 边界约束 ----
  n.state.pos.x = clamp(n.state.pos.x, -world.bounds, world.bounds);
  n.state.pos.z = clamp(n.state.pos.z, -world.bounds, world.bounds);

  // ---- 开火 ----
  if (n.phase === 'engage' && world.playerAlive && n.fireCd <= 0 && d <= bt.fireRange) {
    n.fireCd = bt.fireInterval;
    // 命中判定：距离越远命中率越低（简单模拟）
    const acc = 0.55 + 0.3 * (1 - d / bt.fireRange);
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

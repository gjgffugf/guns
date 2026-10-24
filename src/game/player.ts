import { V3, v3, clamp } from '../core/vec';
import { resolveHorizontal, sweepMove, type Cylinder } from './collide';

/**
 * 玩家运动学（纯逻辑，不依赖 DOM / three.js，可完整单元测试）。
 *
 * 刻意做成"状态 + 步进"的形式：渲染层每帧把输入填进 PlayerInput，
 * 调用 step() 拿到新状态，再同步到 three 的 Object3D。
 * 这样移动 / 跳跃 / 姿态这些最容易出错的逻辑可以脱离运行环境验证。
 */

export type Stance = 'stand' | 'crouch' | 'prone';

export interface PlayerInput {
  /** 摇杆向量，长度 0~1（-1~1 分量） */
  axisX: number;
  axisY: number;
  /** 是否请求跳跃（按下瞬间为 true） */
  jumpPressed: boolean;
  /** 姿态切换请求 */
  wantCrouch: boolean;
  wantProne: boolean;
  /** 是否允许自动疾跑（设置项） */
  autoSprint: boolean;
}

export interface PlayerState {
  pos: V3;
  vel: V3;
  yaw: number;
  hp: number;
  maxHp: number;
  stance: Stance;
  grounded: boolean;
  sprinting: boolean;
  /** 跳跃缓冲计时：落地前一瞬按下也算数 */
  jumpBuffer: number;
  /** 土狼时间：刚离开地面还能补跳 */
  coyote: number;
  alive: boolean;
}

/**
 * 步进所需的世界信息（可选）。
 * 不传就退化成"平地无碰撞"，方便测试纯运动学。
 */
export interface StepWorld {
  /** 世界半边界 */
  bounds: number;
  /** 障碍物（圆柱近似） */
  obstacles: Cylinder[];
  /** 角色半径 */
  radius: number;
  /** 某点的地面高度（斜坡/高台） */
  heightAt(x: number, z: number): number;
}

export interface PlayerTuning {
  walkSpeed: number;
  sprintSpeed: number;
  crouchSpeed: number;
  proneSpeed: number;
  jumpSpeed: number;
  gravity: number;
  accel: number;
  friction: number;
  jumpBufferTime: number;
  coyoteTime: number;
  /** 摇杆推到多满触发自动疾跑 */
  sprintThreshold: number;
}

export const DEFAULT_TUNING: PlayerTuning = {
  walkSpeed: 4.6,
  sprintSpeed: 7.6,
  crouchSpeed: 2.3,
  proneSpeed: 1.3,
  jumpSpeed: 6.4,
  gravity: 18.0,
  accel: 34.0,
  friction: 12.0,
  jumpBufferTime: 0.13,
  coyoteTime: 0.1,
  sprintThreshold: 0.92,
};

export const EYE_HEIGHT: Record<Stance, number> = {
  stand: 1.62,
  crouch: 1.05,
  prone: 0.45,
};

export function createPlayer(pos: V3 = v3(0, 0, 0)): PlayerState {
  return {
    pos: { ...pos },
    vel: v3(),
    yaw: 0,
    hp: 100,
    maxHp: 100,
    stance: 'stand',
    grounded: true,
    sprinting: false,
    jumpBuffer: 0,
    coyote: 0,
    alive: true,
  };
}

/** 当前姿态下的最大水平速度 */
export function maxSpeed(s: PlayerState, t: PlayerTuning): number {
  if (s.stance === 'prone') return t.proneSpeed;
  if (s.stance === 'crouch') return t.crouchSpeed;
  return s.sprinting ? t.sprintSpeed : t.walkSpeed;
}

/** 摇杆长度（0~1） */
export function stickMag(inp: PlayerInput): number {
  return Math.min(1, Math.hypot(inp.axisX, inp.axisY));
}

/**
 * 步进一帧。
 *
 * ★ 关键：跳跃不清空水平速度，空中摇杆照常控方向
 * —— 这是"边移动边跳"的实现要点。
 */
export function step(
  s: PlayerState,
  inp: PlayerInput,
  dt: number,
  t: PlayerTuning = DEFAULT_TUNING,
  world?: StepWorld,
): PlayerState {
  const n: PlayerState = { ...s, pos: { ...s.pos }, vel: { ...s.vel } };
  if (!n.alive) return n;

  // ---- 计时器 ----
  n.jumpBuffer = Math.max(0, n.jumpBuffer - dt);
  if (inp.jumpPressed) n.jumpBuffer = t.jumpBufferTime;
  n.coyote = n.grounded ? t.coyoteTime : Math.max(0, n.coyote - dt);

  // ---- 姿态 ----
  if (inp.wantProne) n.stance = n.stance === 'prone' ? 'stand' : 'prone';
  else if (inp.wantCrouch) n.stance = n.stance === 'crouch' ? 'stand' : 'crouch';

  // ---- 自动疾跑：摇杆推到顶触发 ----
  const mag = stickMag(inp);
  if (inp.autoSprint) {
    // 趴下 / 开镜时不疾跑；倒着走也不疾跑
    n.sprinting = n.stance === 'stand' && mag >= t.sprintThreshold && inp.axisY <= 0.05;
  } else {
    n.sprinting = false;
  }

  // ---- 水平移动 ----
  // 摇杆 y 向前为负（屏幕坐标），转成世界前方
  const fx = Math.sin(n.yaw);
  const fz = -Math.cos(n.yaw);
  const rx = Math.cos(n.yaw);
  const rz = Math.sin(n.yaw);

  let wishX = 0;
  let wishZ = 0;
  if (mag > 0.01) {
    const fwd = -inp.axisY;             // 向前推 = +1
    const strafe = inp.axisX;
    wishX = fx * fwd + rx * strafe;
    wishZ = fz * fwd + rz * strafe;
    const wl = Math.hypot(wishX, wishZ);
    if (wl > 1e-6) {
      wishX = (wishX / wl) * mag;
      wishZ = (wishZ / wl) * mag;
    }
  }

  const spd = maxSpeed(n, t);
  const targetX = wishX * spd;
  const targetZ = wishZ * spd;

  // 地面响应快，空中操控弱一些但仍有（保留空中控制）
  const control = n.grounded ? 1.0 : 0.42;
  const accel = t.accel * control * dt;

  if (mag > 0.01) {
    n.vel.x += (targetX - n.vel.x) * Math.min(1, accel / Math.max(spd, 0.001));
    n.vel.z += (targetZ - n.vel.z) * Math.min(1, accel / Math.max(spd, 0.001));
  } else if (n.grounded) {
    const f = Math.max(0, 1 - t.friction * dt);
    n.vel.x *= f;
    n.vel.z *= f;
  }

  // ---- 跳跃 ----
  if (n.jumpBuffer > 0 && (n.grounded || n.coyote > 0)) {
    n.vel.y = t.jumpSpeed;
    n.grounded = false;
    n.coyote = 0;
    n.jumpBuffer = 0;
  }

  // ---- 重力 ----
  n.vel.y -= t.gravity * dt;

  // ---- 积分 ----
  const prevX = n.pos.x;
  const prevZ = n.pos.z;
  let rawX = prevX + n.vel.x * dt;
  let rawZ = prevZ + n.vel.z * dt;
  n.pos.y += n.vel.y * dt;

  // ---- 地面高度（斜坡 / 高台）----
  const gh = world ? world.heightAt(rawX, rawZ) : 0;

  // ---- 水平碰撞 ----
  if (world) {
    // 脚部高度决定能不能走上箱子/高台
    const feet = n.pos.y;
    const moved = sweepMove(
      { x: prevX, y: n.pos.y, z: prevZ },
      { x: rawX, y: n.pos.y, z: rawZ },
      world.radius, feet, world.obstacles, world.bounds,
    );
    rawX = moved.x;
    rawZ = moved.z;
    // 撞墙就把该方向的速度清掉，避免贴着墙持续加速
    if (Math.abs(moved.x - prevX) < 1e-9 && Math.abs(n.vel.x) > 1e-6) n.vel.x *= 0.2;
    if (Math.abs(moved.z - prevZ) < 1e-9 && Math.abs(n.vel.z) > 1e-6) n.vel.z *= 0.2;
  }
  n.pos.x = rawX;
  n.pos.z = rawZ;

  if (n.pos.y <= gh) {
    n.pos.y = gh;
    if (n.vel.y < 0) n.vel.y = 0;
    n.grounded = true;
  } else {
    n.grounded = false;
  }

  // 保险：万一仍卡在障碍里（例如生成点重叠），推出来
  if (world) {
    n.pos = resolveHorizontal(n.pos, world.radius, n.pos.y, world.obstacles, world.bounds);
  }

  return n;
}

/** 造成伤害 */
export function damage(s: PlayerState, amount: number): PlayerState {
  if (!s.alive) return s;
  const hp = clamp(s.hp - amount, 0, s.maxHp);
  return { ...s, hp, alive: hp > 0 };
}

/** 治疗 */
export function heal(s: PlayerState, amount: number): PlayerState {
  if (!s.alive) return s;
  return { ...s, hp: clamp(s.hp + amount, 0, s.maxHp) };
}

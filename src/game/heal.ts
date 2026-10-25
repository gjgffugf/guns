/**
 * 治疗物（纯逻辑，可单元测试）。
 *
 * 三种物品：
 *   破损的绷带    x3   5s   +40 血
 *   布满灰的急救包 x1   7s   回满
 *   冰冰冰       x2   4s   15s 内：移速 +10%、受伤 -20%、输出 +10%
 *
 * 使用期间不可开枪；可取消，取消后立刻恢复开火能力。
 */

export type HealKind = 'bandage' | 'medkit' | 'energy';

export interface HealDef {
  kind: HealKind;
  name: string;
  /** 使用时长（秒） */
  time: number;
  /** 恢复量（0 表示回满） */
  heal: number;
  /** 是否回满 */
  full: boolean;
  /** buff 时长（秒），0 表示无 */
  buff: number;
  /** 携带上限 */
  capacity: number;
}

export const HEAL_DEFS: Record<HealKind, HealDef> = {
  bandage: { kind: 'bandage', name: '破损的绷带', time: 4, heal: 70, full: false, buff: 0, capacity: 3 },
  medkit: { kind: 'medkit', name: '布满灰的急救包', time: 7, heal: 0, full: true, buff: 0, capacity: 1 },
  energy: { kind: 'energy', name: '冰冰冰', time: 4, heal: 0, full: false, buff: 15, capacity: 2 },
};

export const HEAL_ORDER: HealKind[] = ['bandage', 'medkit', 'energy'];

export interface HealInventory {
  bandage: number;
  medkit: number;
  energy: number;
}

/** Buff 效果倍率（未激活时全为 1 / 0） */
export interface Buff {
  /** 移速倍率增量，如 0.1 表示 +10% */
  speed: number;
  /** 受伤减免，如 0.2 表示 -20% */
  damageTaken: number;
  /** 输出提升，如 0.1 表示 +10% */
  damageDealt: number;
  /** 剩余时间 */
  left: number;
}

export const NO_BUFF: Buff = { speed: 0, damageTaken: 0, damageDealt: 0, left: 0 };

export interface HealState {
  inv: HealInventory;
  /** 正在使用的物品；null 表示空闲 */
  using: HealKind | null;
  /** 使用剩余时间 */
  left: number;
  /** 当前选中的物品（点圆形按钮直接用它） */
  picked: HealKind;
  buff: Buff;
}

export function createHeal(): HealState {
  return {
    inv: { bandage: 3, medkit: 1, energy: 2 },
    using: null,
    left: 0,
    picked: 'bandage',
    buff: { ...NO_BUFF },
  };
}

export function isBusy(h: HealState): boolean {
  return h.using !== null;
}

/** 能否使用某种物品 */
export function canUse(h: HealState, kind: HealKind, hp: number, maxHp: number): boolean {
  if (isBusy(h)) return false;
  if (h.inv[kind] <= 0) return false;
  const d = HEAL_DEFS[kind];
  // 满血时用绷带/急救包没有意义（饮料仍然可以，因为给 buff）
  if (kind !== 'energy' && hp >= maxHp) return false;
  void d;
  return true;
}

export function pick(h: HealState, kind: HealKind): HealState {
  return { ...h, picked: kind };
}

/** 开始使用。返回新状态；不合法则原样返回 */
export function beginUse(h: HealState, kind: HealKind, hp: number, maxHp: number): HealState {
  if (!canUse(h, kind, hp, maxHp)) return h;
  const d = HEAL_DEFS[kind];
  return { ...h, using: kind, left: d.time };
}

export interface HealTickResult {
  state: HealState;
  /** 本次需要恢复的血量（0 表示还没完成） */
  healAmount: number;
  /** 是否回满 */
  full: boolean;
  /** 完成的物品（用于播报） */
  finished: HealKind | null;
}

/** 推进使用计时。完成时消耗物品并给出恢复量 */
export function tickHeal(h: HealState, dt: number, hp: number, maxHp: number): HealTickResult {
  // buff 独立计时
  let buff = h.buff;
  if (buff.left > 0) {
    buff = { ...buff, left: Math.max(0, buff.left - dt) };
    if (buff.left === 0) buff = { ...NO_BUFF };
  }

  if (!h.using) {
    return { state: { ...h, buff }, healAmount: 0, full: false, finished: null };
  }

  const left = Math.max(0, h.left - dt);
  if (left > 0) {
    return { state: { ...h, left, buff }, healAmount: 0, full: false, finished: null };
  }

  // 完成
  const kind = h.using;
  const d = HEAL_DEFS[kind];
  const inv: HealInventory = { ...h.inv, [kind]: Math.max(0, h.inv[kind] - 1) };
  let nextBuff = buff;
  if (d.buff > 0) {
    nextBuff = { speed: 0.1, damageTaken: 0.2, damageDealt: 0.1, left: d.buff };
  }
  void hp; void maxHp;
  return {
    state: { ...h, inv, using: null, left: 0, buff: nextBuff },
    healAmount: d.full ? 0 : d.heal,
    full: d.full,
    finished: kind,
  };
}

/** 取消使用（不消耗物品） */
export function cancelUse(h: HealState): HealState {
  return { ...h, using: null, left: 0 };
}

/** 实际恢复的血量（考虑上限） */
export function applyHeal(hp: number, maxHp: number, amount: number, full: boolean): number {
  if (full) return maxHp;
  return Math.min(maxHp, hp + amount);
}

/** 应用 buff 后的移速倍率 */
export function speedMul(b: Buff): number { return 1 + b.speed; }

/** 应用 buff 后的受伤倍率 */
export function takenMul(b: Buff): number { return 1 - b.damageTaken; }

/** 应用 buff 后的输出倍率 */
export function dealtMul(b: Buff): number { return 1 + b.damageDealt; }

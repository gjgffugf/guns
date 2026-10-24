import { clamp } from '../core/vec';

/**
 * 武器状态机（纯逻辑，可单元测试）。
 * 近战 / 远程共用一套"冷却 + 动作时长"的模型。
 */

export type WeaponKind = 'ranged' | 'melee';

export interface WeaponDef {
  kind: WeaponKind;
  name: string;
  damage: number;
  /** 两次攻击间隔（秒） */
  cooldown: number;
  /** 弹匣容量（近战为 0，表示无弹药） */
  magSize: number;
  /** 换弹时长（秒） */
  reloadTime: number;
  /** 单次攻击动作时长（近战用来算挥砍节奏） */
  swingTime: number;
  /** 射程 */
  range: number;
}

/** 步枪：攻速基准 */
export const RIFLE: WeaponDef = {
  kind: 'ranged',
  name: '步枪',
  damage: 25,
  cooldown: 0.1,
  magSize: 30,
  reloadTime: 2.0,
  swingTime: 0,
  range: 120,
};

/** 刀：伤害 10，攻速为枪的 40% → 间隔 = 0.1 / 0.4 = 0.25s */
export const KNIFE: WeaponDef = {
  kind: 'melee',
  name: '刀',
  damage: 10,
  cooldown: RIFLE.cooldown / 0.4,
  magSize: 0,
  reloadTime: 0,
  swingTime: 0.25,
  range: 2.6,
};

export interface WeaponState {
  kind: WeaponKind;
  ammo: number;
  reserve: number;
  /** 剩余冷却 */
  cd: number;
  /** 换弹剩余时间；>0 表示正在换弹 */
  reloadLeft: number;
  /** 挥砍剩余时间（近战） */
  swingLeft: number;
}

export function createWeapon(kind: WeaponKind = 'ranged', reserve = 150): WeaponState {
  const d = def(kind);
  return {
    kind,
    ammo: d.magSize,
    reserve,
    cd: 0,
    reloadLeft: 0,
    swingLeft: 0,
  };
}

export function def(kind: WeaponKind): WeaponDef {
  return kind === 'melee' ? KNIFE : RIFLE;
}

export function isReloading(w: WeaponState): boolean {
  return w.reloadLeft > 0;
}

/** 能否开火 */
export function canFire(w: WeaponState): boolean {
  if (isReloading(w)) return false;
  if (w.cd > 0) return false;
  if (w.kind === 'melee') return true;
  return w.ammo > 0;
}

/** 步进冷却与动作 */
export function stepWeapon(w: WeaponState, dt: number): WeaponState {
  const n: WeaponState = { ...w };
  n.cd = Math.max(0, n.cd - dt);
  n.swingLeft = Math.max(0, n.swingLeft - dt);
  if (n.reloadLeft > 0) {
    n.reloadLeft = Math.max(0, n.reloadLeft - dt);
    if (n.reloadLeft === 0) {
      // 换弹完成：把备弹补进弹匣
      const d = def(n.kind);
      const need = d.magSize - n.ammo;
      const take = Math.min(need, n.reserve);
      n.ammo += take;
      n.reserve -= take;
    }
  }
  return n;
}

export interface FireResult {
  fired: boolean;
  weapon: WeaponState;
  damage: number;
  reason: 'ok' | 'cooldown' | 'reloading' | 'empty';
}

export function tryFire(w: WeaponState): FireResult {
  if (isReloading(w)) return { fired: false, weapon: w, damage: 0, reason: 'reloading' };
  // ★ 弹药检查要排在冷却之前。
  //   打空最后一发时武器仍处于冷却，若先判冷却就会返回 'cooldown'，
  //   玩家看不到"没弹药了"的提示 —— 换弹提示会被吞掉。
  if (w.kind === 'ranged' && w.ammo <= 0) {
    return { fired: false, weapon: w, damage: 0, reason: 'empty' };
  }
  if (w.cd > 0) return { fired: false, weapon: w, damage: 0, reason: 'cooldown' };
  const d = def(w.kind);
  const n: WeaponState = { ...w, cd: d.cooldown };
  if (w.kind === 'ranged') n.ammo -= 1;
  else n.swingLeft = d.swingTime;
  return { fired: true, weapon: n, damage: d.damage, reason: 'ok' };
}

export type ReloadResult = { ok: boolean; weapon: WeaponState; reason: string };

export function tryReload(w: WeaponState): ReloadResult {
  const d = def(w.kind);
  if (w.kind === 'melee') return { ok: false, weapon: w, reason: '近战武器无需换弹' };
  if (isReloading(w)) return { ok: false, weapon: w, reason: '正在换弹' };
  if (w.ammo >= d.magSize) return { ok: false, weapon: w, reason: '弹匣已满' };
  if (w.reserve <= 0) return { ok: false, weapon: w, reason: '没有备用弹药' };
  return { ok: true, weapon: { ...w, reloadLeft: d.reloadTime }, reason: 'ok' };
}

/** 补满备弹（调试 / 复活用） */
export function refill(w: WeaponState, amount = 150): WeaponState {
  return { ...w, reserve: clamp(w.reserve + amount, 0, 999) };
}

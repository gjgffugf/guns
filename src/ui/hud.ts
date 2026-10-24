import { el, btn, show, clear } from './dom';
import { rectOf, type ControlCfg } from '../core/layout';
import type { Settings } from '../core/settings';

/** 战斗 HUD（DOM）。左上角实时 FPS，底部血条与弹药。 */

export interface HudCallbacks {
  onExit: () => void;
  /** 点击治疗圆形按钮：使用当前选中的物品 */
  onHealUse: () => void;
  /** 点击三角：展开 / 收起物品列表 */
  onHealToggle: () => void;
  /** 选中某个物品 */
  onHealPick: (kind: HealKind) => void;
  /** 取消使用 */
  onHealCancel: () => void;
}

export type HealKind = 'bandage' | 'medkit' | 'energy';

export class Hud {
  private node: HTMLElement;
  private stat: HTMLElement;
  private score: HTMLElement;
  private stance: HTMLElement;
  private hpIn: HTMLElement;
  private hpNum: HTMLElement;
  private ammo: HTMLElement;
  private tip: HTMLElement;
  private notice: HTMLElement;
  private feed: HTMLElement;
  private center: HTMLElement;
  private cancelBtn: HTMLButtonElement;
  private cross: HTMLElement;
  private scope: HTMLElement;
  private healWrap: HTMLElement;
  private healMain: HTMLButtonElement;
  private healArrow: HTMLButtonElement;
  private healList: HTMLElement;
  private healCount: HTMLElement;
  private hitMark: HTMLElement;
  private flash: HTMLElement;
  private muzzle: HTMLElement;

  constructor(parent: HTMLElement, cb: HudCallbacks, _s: Settings) {
    void _s;
    this.node = el('div', { class: 'layer hidden', id: 'hud' });

    this.stat = el('div', { class: 'stat', text: 'FPS 60' });
    this.score = el('div', { class: 'score', text: '' });
    this.cross = el('div', { id: 'crosshair' });
    this.scope = el('div');
    this.scope.style.cssText =
      'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);'
      + 'width:62vmin;height:62vmin;border-radius:50%;'
      + 'border:3px solid rgba(0,0,0,.85);box-shadow:0 0 0 9999px rgba(0,0,0,.55);display:none;';
    this.cross.append(this.scope);

    const exit = btn('退出', 'exit', cb.onExit);

    const bottom = el('div', { class: 'bottom' });
    this.stance = el('div', { class: 'stance', text: '站立' });
    this.hpIn = el('i');
    this.hpNum = el('div', { class: 'hpnum', text: '100' });
    const hpbar = el('div', { class: 'hpbar' });
    hpbar.append(this.hpIn);
    const hpwrap = el('div', { class: 'hpwrap' });
    hpwrap.append(hpbar, this.hpNum);
    this.ammo = el('div', { class: 'ammo', text: '30 / 150' });
    this.tip = el('div', { class: 'tip', text: '' });
    bottom.append(this.stance, hpwrap, this.ammo, this.tip);

    this.notice = el('div', { class: 'notice', text: '' });
    this.feed = el('div', { class: 'killfeed' });
    this.center = el('div', { class: 'center-timer', text: '' });
    this.cancelBtn = btn('取消', 'cancel', () => { /* 由外部绑定 */ });
    show(this.cancelBtn, false);

    // ---- 射击反馈层 ----
    this.hitMark = el('div', { class: 'hitmark' });
    show(this.hitMark, false);
    this.flash = el('div', { class: 'hurt-flash' });
    this.muzzle = el('div', { class: 'muzzle' });

    // ---- 治疗物：圆形按钮 + 上方三角展开 ----
    // ★ 位置由 layout.ts 的 heal 控件配置决定（与"治疗物"控件同一套坐标），
    //   不再固定在屏幕正中 —— 否则会和左下角的"治疗物"按钮重复成两个。
    this.healWrap = el('div', { class: 'healwrap' });
    this.healArrow = el('button', {
      class: 'heal-arrow', type: 'button', text: '▲',
    }) as HTMLButtonElement;
    this.healArrow.addEventListener('click', () => cb.onHealToggle());
    this.healList = el('div', { class: 'heallist hidden' });
    this.healMain = el('button', { class: 'heal-main', type: 'button' }) as HTMLButtonElement;
    this.healCount = el('div', { class: 'heal-count', text: '' });
    this.healMain.addEventListener('click', () => cb.onHealUse());
    this.healMain.append(this.healCount);
    this.healWrap.append(this.healList, this.healArrow, this.healMain);

    this.node.append(this.stat, this.score, exit, this.cross, bottom,
      this.notice, this.feed, this.center, this.cancelBtn,
      this.hitMark, this.flash, this.muzzle, this.healWrap);
    parent.append(this.node);
  }

  // ---------------- 射击 / 受击反馈 ----------------
  /** 命中标记（爆头为红色） */
  showHit(head: boolean): void {
    this.hitMark.classList.toggle('head', head);
    show(this.hitMark, true);
    this.hitMark.classList.remove('pop');
    // 强制重排以重启动画
    void this.hitMark.offsetWidth;
    this.hitMark.classList.add('pop');
    window.setTimeout(() => show(this.hitMark, false), 220);
  }

  /** 枪口闪光（屏幕右下角一闪） */
  flashMuzzle(): void {
    this.muzzle.classList.remove('on');
    void this.muzzle.offsetWidth;
    this.muzzle.classList.add('on');
    window.setTimeout(() => this.muzzle.classList.remove('on'), 55);
  }

  /** 受伤：屏幕边框红闪 */
  flashHurt(): void {
    this.flash.classList.remove('on');
    void this.flash.offsetWidth;
    this.flash.classList.add('on');
    window.setTimeout(() => this.flash.classList.remove('on'), 260);
  }

  open(): void { show(this.node, true); }
  close(): void { show(this.node, false); }

  setFps(fps: number): void {
    this.stat.textContent = `FPS ${Math.round(fps)}`;
  }
  setScore(t: string): void { this.score.textContent = t; }
  setStance(t: string): void { this.stance.textContent = t; }
  setHp(hp: number, max: number): void {
    const p = Math.max(0, Math.min(1, hp / max));
    this.hpIn.style.width = `${p * 100}%`;
    this.hpIn.style.background = p < 0.3
      ? 'linear-gradient(90deg,#d0342c,#ff6b5a)'
      : 'linear-gradient(90deg,#2fbf58,#6ee08a)';
    this.hpNum.textContent = String(Math.round(hp));
  }
  setAmmo(ammo: number, reserve: number, melee: boolean): void {
    this.ammo.textContent = melee ? '近战' : `${ammo} / ${reserve}`;
  }
  setTip(t: string): void { this.tip.textContent = t; }
  setNotice(t: string): void { this.notice.textContent = t; }
  setCenter(t: string): void { this.center.textContent = t; }
  pushKill(msg: string): void {
    const d = el('div', { text: msg });
    this.feed.append(d);
    window.setTimeout(() => d.remove(), 4000);
  }
  setCancel(on: boolean, cb?: () => void): void {
    show(this.cancelBtn, on);
    if (cb) {
      const n = this.cancelBtn.cloneNode(false) as HTMLButtonElement;
      n.addEventListener('click', cb);
      this.cancelBtn.replaceWith(n);
      this.cancelBtn = n;
    }
  }

  // ---------------- 治疗物 ----------------
  /** 按控件配置摆放（与触摸命中层用同一个 rectOf，位置必然一致） */
  layoutHeal(cfg: ControlCfg): void {
    const r = rectOf('heal', cfg, window.innerWidth, window.innerHeight);
    const w = this.healWrap;
    w.style.left = `${r.x}px`;
    w.style.top = `${r.y}px`;
    w.style.width = `${r.w}px`;
    w.style.height = `${r.h}px`;
    this.healMain.style.width = `${r.w}px`;
    this.healMain.style.height = `${r.h}px`;
    // 字号跟着按钮大小走，避免放大后文字溢出或太小
    const fs = Math.max(9, Math.round(r.w * 0.155));
    this.healMain.style.fontSize = `${fs}px`;
  }

  setHealListOpen(on: boolean): void { show(this.healList, on); }

  /** 物品列表：名称 + 数量 + 选中态 */
  renderHealList(
    items: Array<{ kind: HealKind; name: string; count: number }>,
    picked: HealKind,
    onPick: (k: HealKind) => void,
  ): void {
    const list = this.healList;
    while (list.firstChild) list.removeChild(list.firstChild);
    for (const it of items) {
      const b = el('button', { class: 'heal-item', type: 'button' }) as HTMLButtonElement;
      if (it.kind === picked) b.classList.add('on');
      if (it.count <= 0) b.classList.add('empty');
      b.append(
        el('span', { class: 'hn', text: it.name }),
        el('span', { class: 'hc', text: `x${it.count}` }),
      );
      b.addEventListener('click', () => onPick(it.kind));
      list.append(b);
    }
  }

  /** 圆形主按钮上的文字：选中的物品与数量 */
  setHealMain(name: string, count: number): void {
    this.healCount.textContent = count > 0 ? `${name}\nx${count}` : `${name}\n用完`;
    this.healMain.classList.toggle('empty', count <= 0);
  }

  /** 使用中的倒计时（画在圆形按钮上，不占屏幕中央） */
  setHealUsing(seconds: number): void {
    this.healMain.classList.toggle('using', seconds > 0);
    if (seconds > 0) {
      this.healMain.style.setProperty('--p', String(1 - seconds / 7));
      this.healCount.textContent = `${seconds.toFixed(1)}s`;
    }
  }

  /** 准星：与设置页共用同一套参数 */
  drawCrosshair(s: Settings): void {
    clear(this.cross);
    this.cross.append(this.scope);
    const len = s.crossLength * s.crossSize;
    const th = Math.max(1, s.crossThickness);
    const mk = (w: number, h: number, l: number, t: number): HTMLElement => {
      const d = el('div');
      d.style.cssText = `position:absolute;left:calc(50% + ${l}px);top:calc(50% + ${t}px);`
        + `width:${w}px;height:${h}px;background:${s.crossColor};box-shadow:0 0 2px #000;`;
      return d;
    };
    if (s.crossStyle === 'dot') {
      const r = Math.max(2, th * s.crossSize);
      this.cross.append(mk(r, r, -r / 2, -r / 2));
      return;
    }
    if (s.crossStyle === 'circle') {
      const d = el('div');
      d.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);`
        + `width:${len * 2}px;height:${len * 2}px;border:${th}px solid ${s.crossColor};`
        + `border-radius:50%;box-shadow:0 0 2px #000;`;
      this.cross.append(d);
      if (s.crossDot) this.cross.append(mk(th, th, -th / 2, -th / 2));
      return;
    }
    if (s.crossStyle === 'cross') {
      this.cross.append(
        mk(len * 2, th, -len, -th / 2), mk(th, len * 2, -th / 2, -len),
      );
      if (s.crossDot) this.cross.append(mk(th, th, -th / 2, -th / 2));
      return;
    }
    const gap = 4 * s.crossSize;
    this.cross.append(
      mk(th, len, -th / 2, -gap - len), mk(th, len, -th / 2, gap),
      mk(len, th, -gap - len, -th / 2), mk(len, th, gap, -th / 2),
    );
    if (s.crossDot) this.cross.append(mk(th, th, -th / 2, -th / 2));
  }

  /** 开镜：显示倍镜圆环（枪械模型由 3D 层隐藏，这里只画轮廓） */
  setAds(on: boolean): void {
    this.scope.style.display = on ? 'block' : 'none';
  }
}

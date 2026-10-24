import { el, btn, show, clear } from './dom';
import type { Settings } from '../core/settings';

/** 战斗 HUD（DOM）。左上角实时 FPS，底部血条与弹药。 */

export interface HudCallbacks {
  onExit: () => void;
}

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

    this.node.append(this.stat, this.score, exit, this.cross, bottom,
      this.notice, this.feed, this.center, this.cancelBtn);
    parent.append(this.node);
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

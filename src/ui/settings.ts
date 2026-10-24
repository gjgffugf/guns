import { el, btn, show, clear } from './dom';
import {
  FPS_OPTIONS, type Settings, type FpsOption,
} from '../core/settings';
import {
  CONTROL_KEYS, CONTROL_NAMES, clampCenter, rectOf,
  type ControlKey, type ControlCfg,
} from '../core/layout';

const TABS = ['通用', '准星', '控件', '关于'] as const;
const CROSS_STYLES: Array<Settings['crossStyle']> = ['standard', 'dot', 'circle', 'cross'];
const CROSS_STYLE_NAMES: Record<Settings['crossStyle'], string> = {
  standard: '标准', dot: '点', circle: '圆形', cross: '十字',
};
const SWATCHES = ['#ffffff', '#ff4d4d', '#4dff88', '#4da6ff', '#ffd24d', '#ff7ae0'];

export interface SettingsHandlers {
  onChange: (s: Settings) => void;
  onClose: () => void;
  /** 屏幕刷新率（用于提示实际帧率上限） */
  refreshHz: () => number;
}

export class SettingsPanel {
  private node: HTMLElement;
  private body: HTMLElement;
  private tabs: HTMLButtonElement[] = [];
  private s: Settings;
  private h: SettingsHandlers;
  private page = 0;
  private previewCanvas: HTMLElement | null = null;
  private editCanvas: HTMLElement | null = null;
  private proxies = new Map<ControlKey, HTMLElement>();
  private selected: ControlKey | null = null;
  private sizeSlider: HTMLInputElement | null = null;
  private alphaSlider: HTMLInputElement | null = null;
  private tipEl: HTMLElement | null = null;

  constructor(parent: HTMLElement, s: Settings, h: SettingsHandlers) {
    this.s = s;
    this.h = h;
    this.node = el('div', { class: 'layer hidden', id: 'settings' });

    const panel = el('div', { class: 'panel' });
    const tabCol = el('div', { class: 'tabs' });
    TABS.forEach((t, i) => {
      const b = btn(t, 'btn', () => this.select(i));
      this.tabs.push(b);
      tabCol.append(b);
    });
    const close = btn('关闭', 'btn close', () => { h.onClose(); });
    tabCol.append(close);

    this.body = el('div', { class: 'body' });
    panel.append(tabCol, this.body);
    this.node.append(panel);
    parent.append(this.node);
    this.select(0);
  }

  setSettings(s: Settings): void { this.s = s; this.render(); }
  open(): void { show(this.node, true); this.render(); }
  close(): void { show(this.node, false); }
  get isOpen(): boolean { return !this.node.classList.contains('hidden'); }

  private select(i: number): void {
    this.page = i;
    this.tabs.forEach((b, k) => b.classList.toggle('on', k === i));
    this.render();
  }

  private commit(): void { this.h.onChange(this.s); }

  private render(): void {
    clear(this.body);
    if (this.page === 0) this.renderGeneral();
    else if (this.page === 1) this.renderCross();
    else if (this.page === 2) this.renderControls();
    else this.renderAbout();
  }

  // ---------------- 通用 ----------------
  private renderGeneral(): void {
    // FPS
    const fpsRow = el('div', { class: 'row' });
    fpsRow.append(el('label', { text: '帧率上限' }));
    const fpsBtns = el('div', { class: 'fpsbtns' });
    for (const f of FPS_OPTIONS) {
      const b = btn(String(f), 'btn', () => {
        this.s.targetFps = f as FpsOption;
        this.commit();
        this.render();
      });
      b.classList.toggle('on', this.s.targetFps === f);
      fpsBtns.append(b);
    }
    fpsRow.append(fpsBtns);
    this.body.append(fpsRow);

    const hz = this.h.refreshHz();
    this.body.append(el('div', {
      class: 'note',
      text: hz > 0
        ? `当前屏幕刷新率约 ${Math.round(hz)}Hz，实际帧率不会超过它`
        : '帧率上限已按所选档位应用',
    }));

    // 灵敏度
    this.sliderRow('灵敏度', this.s.sensitivity, 0.1, 3, 0.05, (v) => {
      this.s.sensitivity = v;
      this.commit();
    }, (v) => v.toFixed(2));

    // 自动疾跑
    const sp = el('div', { class: 'row' });
    sp.append(el('label', { text: '自动疾跑' }));
    const b = btn(this.s.autoSprint ? '开' : '关', 'btn', () => {
      this.s.autoSprint = !this.s.autoSprint;
      this.commit();
      this.render();
    });
    if (this.s.autoSprint) b.classList.add('on');
    sp.append(b);
    this.body.append(sp);

    // 音量
    this.sliderRow('音量', this.s.masterVolume, 0, 1, 0.05, (v) => {
      this.s.masterVolume = v;
      this.commit();
    }, (v) => `${Math.round(v * 100)}%`);
  }

  private sliderRow(
    label: string, value: number, min: number, max: number, step: number,
    onInput: (v: number) => void, fmt: (v: number) => string,
  ): void {
    const row = el('div', { class: 'row' });
    row.append(el('label', { text: label }));
    const val = el('div', { class: 'val', text: fmt(value) });
    const input = el('input', {
      type: 'range', min: String(min), max: String(max), step: String(step), value: String(value),
    }) as HTMLInputElement;
    input.addEventListener('input', () => {
      const v = Number(input.value);
      val.textContent = fmt(v);
      onInput(v);
    });
    row.append(input, val);
    this.body.append(row);
  }

  // ---------------- 准星 ----------------
  private renderCross(): void {
    const styleRow = el('div', { class: 'row' });
    styleRow.append(el('label', { text: '预设' }));
    const wrap = el('div', { class: 'fpsbtns' });
    for (const st of CROSS_STYLES) {
      const b = btn(CROSS_STYLE_NAMES[st], 'btn', () => {
        this.s.crossStyle = st;
        this.commit();
        this.render();
      });
      b.classList.toggle('on', this.s.crossStyle === st);
      wrap.append(b);
    }
    styleRow.append(wrap);
    this.body.append(styleRow);

    this.sliderRow('长度', this.s.crossLength, 2, 40, 1, (v) => {
      this.s.crossLength = v; this.commit(); this.drawPreview();
    }, (v) => String(Math.round(v)));
    this.sliderRow('粗细', this.s.crossThickness, 1, 8, 1, (v) => {
      this.s.crossThickness = v; this.commit(); this.drawPreview();
    }, (v) => String(Math.round(v)));
    this.sliderRow('大小', this.s.crossSize, 0.5, 2.5, 0.05, (v) => {
      this.s.crossSize = v; this.commit(); this.drawPreview();
    }, (v) => `${v.toFixed(2)}x`);

    const dotRow = el('div', { class: 'row' });
    dotRow.append(el('label', { text: '中心点' }));
    const db = btn(this.s.crossDot ? '显示' : '隐藏', 'btn', () => {
      this.s.crossDot = !this.s.crossDot; this.commit(); this.drawPreview();
    });
    if (this.s.crossDot) db.classList.add('on');
    dotRow.append(db);
    this.body.append(dotRow);

    const colorRow = el('div', { class: 'row' });
    colorRow.append(el('label', { text: '颜色' }));
    const sw = el('div', { class: 'swatches' });
    for (const c of SWATCHES) {
      const b = el('button', { class: 'sw', type: 'button' }) as HTMLButtonElement;
      b.style.background = c;
      b.classList.toggle('on', this.s.crossColor === c);
      b.addEventListener('click', () => {
        this.s.crossColor = c; this.commit(); this.drawPreview(); this.render();
      });
      sw.append(b);
    }
    colorRow.append(sw);
    this.body.append(colorRow);

    this.previewCanvas = el('div', { class: 'preview' });
    this.body.append(el('div', { class: 'note', text: '实时预览' }), this.previewCanvas);
    this.drawPreview();
  }

  private drawPreview(): void {
    if (!this.previewCanvas) return;
    clear(this.previewCanvas);
    const c = this.previewCanvas;
    const s = this.s;
    const len = s.crossLength * s.crossSize;
    const th = Math.max(1, s.crossThickness);
    const mk = (w: number, h: number, l: number, t: number): HTMLElement => {
      const d = el('div');
      d.style.cssText = `position:absolute;left:${l}px;top:${t}px;width:${w}px;height:${h}px;background:${s.crossColor};`;
      return d;
    };
    const cx = c.clientWidth / 2 || 120;
    const cy = c.clientHeight / 2 || 75;
    if (s.crossStyle === 'dot') {
      const r = Math.max(2, th * s.crossSize);
      c.append(mk(r, r, cx - r / 2, cy - r / 2));
      return;
    }
    if (s.crossStyle === 'circle') {
      const d = el('div');
      const r = len;
      d.style.cssText = `position:absolute;left:${cx - r}px;top:${cy - r}px;width:${r * 2}px;height:${r * 2}px;border:${th}px solid ${s.crossColor};border-radius:50%;`;
      c.append(d);
      if (s.crossDot) c.append(mk(th, th, cx - th / 2, cy - th / 2));
      return;
    }
    if (s.crossStyle === 'cross') {
      c.append(mk(len * 2, th, cx - len, cy - th / 2), mk(th, len * 2, cx - th / 2, cy - len));
      if (s.crossDot) c.append(mk(th, th, cx - th / 2, cy - th / 2));
      return;
    }
    // standard: 四段 + 中心留空
    const gap = 4 * s.crossSize;
    c.append(
      mk(th, len, cx - th / 2, cy - gap - len),
      mk(th, len, cx - th / 2, cy + gap),
      mk(len, th, cx - gap - len, cy - th / 2),
      mk(len, th, cx + gap, cy - th / 2),
    );
    if (s.crossDot) c.append(mk(th, th, cx - th / 2, cy - th / 2));
  }

  // ---------------- 控件自定义 ----------------
  private renderControls(): void {
    this.tipEl = el('div', { class: 'note', text: '拖动摆放，点击选中后可调整大小与透明度' });
    this.sizeSlider = null;
    this.alphaSlider = null;

    const bar = el('div', { class: 'row' });
    bar.append(el('label', { text: '大小' }));
    const sv = el('div', { class: 'val', text: '1.00' });
    const size = el('input', { type: 'range', min: '0.5', max: '2', step: '0.05', value: '1' }) as HTMLInputElement;
    size.addEventListener('input', () => {
      if (!this.selected) return;
      sv.textContent = Number(size.value).toFixed(2);
      this.s.controls[this.selected] = { ...this.s.controls[this.selected], s: Number(size.value) };
      this.commit();
      this.placeProxy(this.selected);
    });
    bar.append(size, sv);
    this.sizeSlider = size;

    const bar2 = el('div', { class: 'row' });
    bar2.append(el('label', { text: '透明度' }));
    const av = el('div', { class: 'val', text: '0.92' });
    const alpha = el('input', { type: 'range', min: '0.3', max: '1', step: '0.02', value: '0.92' }) as HTMLInputElement;
    alpha.addEventListener('input', () => {
      if (!this.selected) return;
      av.textContent = Number(alpha.value).toFixed(2);
      this.s.controls[this.selected] = { ...this.s.controls[this.selected], a: Number(alpha.value) };
      this.commit();
      this.placeProxy(this.selected);
    });
    bar2.append(alpha, av);
    this.alphaSlider = alpha;

    const acts = el('div', { class: 'row' });
    acts.append(
      btn('保存', 'btn primary', () => { this.commit(); this.toast('已保存'); }),
      btn('复位', 'btn', () => {
        this.h.onChange({ ...this.s, controls: undefined as never });
        this.toast('已复位（重新打开生效）');
        this.render();
      }),
    );

    this.editCanvas = el('div', { class: 'canvas' });
    this.body.append(this.tipEl, bar, bar2, acts, this.editCanvas);
    this.buildProxies();
  }

  private toast(msg: string): void {
    if (this.tipEl) this.tipEl.textContent = msg;
  }

  private buildProxies(): void {
    if (!this.editCanvas) return;
    clear(this.editCanvas);
    this.proxies.clear();
    const cv = this.editCanvas;
    const w = cv.clientWidth || 900;
    const h = cv.clientHeight || 340;

    for (const k of CONTROL_KEYS) {
      const p = el('div', { class: 'proxy', text: CONTROL_NAMES[k] });
      this.proxies.set(k, p);
      cv.append(p);

      let dragging = false;
      let ox = 0;
      let oy = 0;
      const down = (ev: PointerEvent): void => {
        ev.preventDefault();
        ev.stopPropagation();
        this.selected = k;
        dragging = true;
        ox = ev.clientX;
        oy = ev.clientY;
        (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
        this.syncSliders();
        this.highlight();
      };
      const move = (ev: PointerEvent): void => {
        if (!dragging) return;
        ev.preventDefault();
        const dx = ev.clientX - ox;
        const dy = ev.clientY - oy;
        ox = ev.clientX;
        oy = ev.clientY;
        const cur = this.s.controls[k];
        this.s.controls[k] = clampCenter({ ...cur, x: cur.x + dx / w, y: cur.y + dy / h });
        this.placeProxy(k);
        this.commit();
      };
      const up = (): void => { dragging = false; };
      p.addEventListener('pointerdown', down);
      p.addEventListener('pointermove', move);
      p.addEventListener('pointerup', up);
      p.addEventListener('pointercancel', up);
      this.placeProxy(k);
    }
    this.highlight();
  }

  private placeProxy(k: ControlKey): void {
    const p = this.proxies.get(k);
    if (!p || !this.editCanvas) return;
    const w = this.editCanvas.clientWidth || 900;
    const h = this.editCanvas.clientHeight || 340;
    const cfg: ControlCfg = this.s.controls[k];
    const r = rectOf(k, cfg, w, h);
    p.style.left = `${r.x}px`;
    p.style.top = `${r.y}px`;
    p.style.width = `${r.w}px`;
    p.style.height = `${r.h}px`;
    p.style.opacity = String(cfg.a);
  }

  private syncSliders(): void {
    if (!this.selected) return;
    const c = this.s.controls[this.selected];
    if (this.sizeSlider) {
      this.sizeSlider.value = String(c.s);
      const v = this.sizeSlider.parentElement?.querySelector('.val');
      if (v) v.textContent = c.s.toFixed(2);
    }
    if (this.alphaSlider) {
      this.alphaSlider.value = String(c.a);
      const v = this.alphaSlider.parentElement?.querySelector('.val');
      if (v) v.textContent = c.a.toFixed(2);
    }
  }

  private highlight(): void {
    for (const [k, p] of this.proxies) p.classList.toggle('on', k === this.selected);
  }

  // ---------------- 关于 ----------------
  private renderAbout(): void {
    this.body.append(
      el('div', { class: 'row', text: '破绷战场  v0.2.0' }),
      el('div', { class: 'note', text: '包名 xfan.games.gun' }),
    );
  }
}

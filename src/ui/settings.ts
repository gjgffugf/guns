import { el, btn, show, clear } from './dom';
import {
  FPS_OPTIONS, type Settings, type FpsOption,
} from '../core/settings';
import {
  CONTROL_KEYS, CONTROL_NAMES, clampControl, rectOf, defaultControls,
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
  /** 右侧滚动条 */
  private scroller: HTMLElement;
  private scrollThumb: HTMLElement;
  private scrollDrag: { pointerId: number; startY: number; baseTop: number; travel: number } | null = null;
  /** 控件拖动状态（挂在 window 上，避免手指滑出元素后丢失事件） */
  private drag: {
    key: ControlKey; pointerId: number;
    startX: number; startY: number;
    baseX: number; baseY: number;
    cw: number; ch: number;
  } | null = null;

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

    // 右侧滚动条（内容超出时可长按拖动）
    this.scroller = el('div', { class: 'scroller' });
    this.scrollThumb = el('div', { class: 'scroll-thumb' });
    this.scroller.append(this.scrollThumb);
    this.bindScroller();

    panel.append(tabCol, this.body, this.scroller);
    this.node.append(panel);
    parent.append(this.node);

    // 滚动条拖动：同样挂 window，长按后可以一路滑到底
    window.addEventListener('pointermove', this.onScrollMove, { passive: false });
    window.addEventListener('pointerup', this.onScrollEnd);
    window.addEventListener('pointercancel', this.onScrollEnd);

    // 拖动全程在 window 上接收：手指移出代理元素也照样跟手
    window.addEventListener('pointermove', this.onDragMove, { passive: false });
    window.addEventListener('pointerup', this.onDragEnd);
    window.addEventListener('pointercancel', this.onDragEnd);

    this.select(0);
  }

  // ---------------- 右侧滚动条 ----------------
  /** 绑定滚动条事件 */
  private bindScroller(): void {
    // 拖动（pointerdown 后保持按住并上下滑）
    this.scrollThumb.addEventListener('pointerdown', (ev: PointerEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const box = this.scroller.getBoundingClientRect();
      const tb = this.scrollThumb.getBoundingClientRect();
      this.scrollDrag = {
        pointerId: ev.pointerId,
        startY: ev.clientY,
        baseTop: tb.top - box.top,
        travel: Math.max(1, box.height - tb.height),
      };
      this.scrollThumb.classList.add('dragging');
    });

    // 内容滚动 / 尺寸变化时同步滑块位置
    this.body.addEventListener('scroll', () => this.syncScrollThumb());
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.syncScrollThumb()).observe(this.body);
    }
  }

  private onScrollMove = (ev: PointerEvent): void => {
    const d = this.scrollDrag;
    if (!d || ev.pointerId !== d.pointerId) return;
    ev.preventDefault();
    const dy = ev.clientY - d.startY;
    const top = Math.max(0, Math.min(d.travel, d.baseTop + dy));
    const ratio = d.travel > 0 ? top / d.travel : 0;
    const max = this.body.scrollHeight - this.body.clientHeight;
    this.body.scrollTop = ratio * max;
    this.syncScrollThumb();
  };

  private onScrollEnd = (ev: PointerEvent): void => {
    const d = this.scrollDrag;
    if (!d || ev.pointerId !== d.pointerId) return;
    this.scrollDrag = null;
    this.scrollThumb.classList.remove('dragging');
  };

  /** 按当前滚动位置摆放滑块；内容没超出就整条隐藏 */
  private syncScrollThumb(): void {
    const b = this.body;
    const view = b.clientHeight;
    const total = b.scrollHeight;
    const max = total - view;
    if (max <= 2) {
      this.scroller.style.display = 'none';
      return;
    }
    this.scroller.style.display = 'block';
    const boxH = this.scroller.clientHeight || view;
    const th = Math.max(28, boxH * (view / total));
    const travel = Math.max(1, boxH - th);
    const ratio = Math.max(0, Math.min(1, b.scrollTop / max));
    this.scrollThumb.style.height = `${th}px`;
    this.scrollThumb.style.top = `${ratio * travel}px`;
  }

  private onDragMove = (ev: PointerEvent): void => {
    const d = this.drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    ev.preventDefault();
    // 用【起始点 → 当前点】的绝对位移，而不是逐帧累加增量
    const dx = ev.clientX - d.startX;
    const dy = ev.clientY - d.startY;
    this.s.controls[d.key] = clampControl(d.key, {
      ...this.s.controls[d.key],
      x: d.baseX + dx / d.cw,
      y: d.baseY + dy / d.ch,
    });
    this.placeProxy(d.key);
  };

  private onDragEnd = (ev: PointerEvent): void => {
    const d = this.drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    this.drag = null;
    this.proxies.get(d.key)?.classList.remove('dragging');
    this.commit();
  };

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
    this.body.scrollTop = 0;
    // 等一帧让容器完成布局，再按实际内容高度摆放滑块
    requestAnimationFrame(() => this.syncScrollThumb());
  }

  // ---------------- 通用 ----------------
  private renderGeneral(): void {
    // ★ 玩家名字（联机时其他玩家看到的名字）
    const nameRow = el('div', { class: 'row' });
    nameRow.append(el('label', { text: '玩家名字' }));
    const nameI = el('input', {
      type: 'text', value: this.s.playerName, maxlength: '16',
    }) as HTMLInputElement;
    nameI.placeholder = '指挥官';
    nameI.classList.add('textinput');
    // 输入时即时生效；失焦或回车时收起软键盘并重绘
    const apply = (): void => {
      const v = nameI.value.trim().slice(0, 16);
      this.s.playerName = v || '指挥官';
      nameI.value = this.s.playerName;
      this.commit();
    };
    nameI.addEventListener('change', () => { apply(); this.render(); });
    nameI.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') { apply(); nameI.blur(); this.render(); }
    });
    nameRow.append(nameI);
    this.body.append(nameRow);
    this.body.append(el('div', {
      class: 'note', text: '联机时显示给其他玩家，最长 16 字',
    }));

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

    // 纵向反转（视角上下方向因人而异，给个开关）
    const inv = el('div', { class: 'row' });
    inv.append(el('label', { text: '反转纵向' }));
    const ib = btn(this.s.invertY ? '开' : '关', 'btn', () => {
      this.s.invertY = !this.s.invertY;
      this.commit();
      this.render();
    });
    if (this.s.invertY) ib.classList.add('on');
    inv.append(ib);
    this.body.append(inv);
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
        // ★ 原来是塞 undefined 让它"重新打开生效"，
        //   结果如果直接进游戏，TouchControls 会因读不到配置而崩溃。
        //   改成立刻写回默认值并重建代理，所见即所得。
        this.s.controls = defaultControls();
        this.selected = null;
        this.commit();
        this.buildProxies();
        this.syncSliders();
        this.toast('已恢复默认布局');
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
    void cv;

    for (const k of CONTROL_KEYS) {
      const p = el('div', { class: 'proxy', text: CONTROL_NAMES[k] });
      this.proxies.set(k, p);
      cv.append(p);

      // ★ 拖动之前的实现有 bug：只能挪一小段就停。
      //   原因有两个：
      //   1) 监听挂在代理元素自己身上，手指稍快就会滑出元素范围，
      //      后续 pointermove 收不到（setPointerCapture 也不总能兜住）；
      //   2) 缺 touch-action:none，浏览器把手势判成滚动并发出 pointercancel。
      //   改成：按下时记【起始点 + 起始配置】，在 window 上监听，
      //   用绝对位移算新位置 —— 不累积误差，也不依赖元素是否还被命中。
      const down = (ev: PointerEvent): void => {
        ev.preventDefault();
        ev.stopPropagation();
        this.selected = k;
        const cv = this.editCanvas;
        if (!cv) return;
        const box = cv.getBoundingClientRect();
        this.drag = {
          key: k,
          pointerId: ev.pointerId,
          startX: ev.clientX,
          startY: ev.clientY,
          baseX: this.s.controls[k].x,
          baseY: this.s.controls[k].y,
          cw: box.width || 900,
          ch: box.height || 340,
        };
        this.syncSliders();
        this.highlight();
        p.classList.add('dragging');
      };
      p.addEventListener('pointerdown', down);
      this.placeProxy(k);
    }
    this.highlight();
  }

  private placeProxy(k: ControlKey): void {
    const p = this.proxies.get(k);
    if (!p || !this.editCanvas) return;
    // 实时取尺寸：面板刚打开时布局可能还没完成，用缓存值会算歪
    const w = this.editCanvas.clientWidth || 900;
    const h = this.editCanvas.clientHeight || 340;
    p.style.touchAction = 'none';
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

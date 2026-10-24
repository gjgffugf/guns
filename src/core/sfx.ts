/**
 * 音效（WebAudio 实时合成，不需要任何音频文件）。
 *
 * ★ 为什么不用素材文件：之前 assets 里的 wav 没进仓库，
 *   导致 Godot 版全程静音。这里改成代码合成，
 *   零依赖、零资源、不可能"文件丢失就没声音"。
 *
 * 浏览器/Android WebView 要求 AudioContext 必须由用户手势解锁，
 * 所以第一次点击时调 unlock()。
 */

type Ctx = AudioContext & { _bbUnlocked?: boolean };

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let volume = 0.9;
let enabled = true;

function ensure(): Ctx | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC() as Ctx;
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  return ctx;
}

/** 噪声缓冲（枪声/脚步都用它） */
let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.5);
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

/** 基础音块：噪声 + 包络 + 滤波 */
function burst(opt: {
  dur: number; gain: number; freq: number; q?: number;
  type?: BiquadFilterType; decay?: number;
}): void {
  const c = ensure();
  if (!c || !master || !enabled) return;
  if (c.state === 'suspended') void c.resume();
  const t = c.currentTime;

  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.loop = true;

  const f = c.createBiquadFilter();
  f.type = opt.type || 'lowpass';
  f.frequency.value = opt.freq;
  f.Q.value = opt.q ?? 1;

  const g = c.createGain();
  const decay = opt.decay ?? opt.dur;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(opt.gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);

  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
  src.stop(t + opt.dur + 0.02);
}

/** 单音（音调类音效） */
function tone(opt: {
  freq: number; to?: number; dur: number; gain: number;
  type?: OscillatorType; delay?: number;
}): void {
  const c = ensure();
  if (!c || !master || !enabled) return;
  if (c.state === 'suspended') void c.resume();
  const t = c.currentTime + (opt.delay || 0);

  const o = c.createOscillator();
  o.type = opt.type || 'sine';
  o.frequency.setValueAtTime(opt.freq, t);
  if (opt.to) o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.to), t + opt.dur);

  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(opt.gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);

  o.connect(g); g.connect(master);
  o.start(t);
  o.stop(t + opt.dur + 0.02);
}

export const sfx = {
  /** 首次用户手势时调用，解锁 AudioContext */
  unlock(): void {
    const c = ensure();
    if (c && c.state === 'suspended') void c.resume();
  },
  setVolume(v: number): void {
    volume = Math.max(0, Math.min(1, v));
    if (master && ctx) {
      master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    }
  },
  setEnabled(on: boolean): void { enabled = on; },

  /** 枪声：低频爆音 + 高频脆响 */
  shoot(melee = false): void {
    if (melee) {
      burst({ dur: 0.12, gain: 0.22, freq: 2600, type: 'bandpass', q: 2.2, decay: 0.1 });
      return;
    }
    burst({ dur: 0.16, gain: 0.5, freq: 1500, type: 'lowpass', q: 0.8, decay: 0.13 });
    burst({ dur: 0.06, gain: 0.3, freq: 4200, type: 'highpass', decay: 0.05 });
    tone({ freq: 180, to: 60, dur: 0.1, gain: 0.28, type: 'square' });
  },
  /** 空仓：清脆的咔哒 */
  dryFire(): void {
    burst({ dur: 0.05, gain: 0.26, freq: 5200, type: 'highpass', decay: 0.04 });
  },
  /** 换弹：两声机械音 */
  reload(): void {
    burst({ dur: 0.07, gain: 0.24, freq: 2200, type: 'bandpass', q: 3, decay: 0.06 });
    burst({ dur: 0.09, gain: 0.26, freq: 1600, type: 'bandpass', q: 2.5, decay: 0.08 });
    tone({ freq: 320, to: 200, dur: 0.12, gain: 0.14, type: 'triangle', delay: 0.22 });
  },
  /** 命中确认：短促高音 */
  hit(): void {
    tone({ freq: 1500, to: 900, dur: 0.07, gain: 0.2, type: 'square' });
  },
  /** 击杀：两声上行 */
  kill(): void {
    tone({ freq: 700, to: 1100, dur: 0.1, gain: 0.24, type: 'triangle' });
    tone({ freq: 1100, to: 1600, dur: 0.14, gain: 0.2, type: 'triangle', delay: 0.09 });
  },
  /** 受伤：低沉闷响 */
  hurt(): void {
    tone({ freq: 240, to: 110, dur: 0.18, gain: 0.3, type: 'sawtooth' });
    burst({ dur: 0.1, gain: 0.18, freq: 700, decay: 0.09 });
  },
  /** 落地 */
  land(): void {
    burst({ dur: 0.09, gain: 0.16, freq: 420, decay: 0.08 });
  },
  /** 跳跃 */
  jump(): void {
    burst({ dur: 0.06, gain: 0.1, freq: 900, decay: 0.05 });
  },
  /** UI 点击 */
  click(): void {
    tone({ freq: 900, to: 1300, dur: 0.05, gain: 0.16, type: 'square' });
  },
  /** 通用提示 */
  beep(): void {
    tone({ freq: 660, to: 880, dur: 0.09, gain: 0.18, type: 'sine' });
  },
  /** 报错/失败 */
  fail(): void {
    tone({ freq: 420, to: 220, dur: 0.16, gain: 0.2, type: 'sawtooth' });
  },
};

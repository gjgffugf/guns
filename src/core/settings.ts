import { defaultControls, type ControlKey, type ControlCfg } from './layout';

/**
 * 设置持久化（localStorage；在 WebView / Capacitor 里同样可用）。
 * 纯逻辑部分（默认值 / 校验 / 序列化）可单元测试。
 */

export const FPS_OPTIONS = [60, 90, 120, 144] as const;
export type FpsOption = (typeof FPS_OPTIONS)[number];

export interface Settings {
  targetFps: FpsOption;
  sensitivity: number;
  autoSprint: boolean;
  invertY: boolean;
  masterVolume: number;
  playerName: string;
  serverAddr: string;
  serverPort: number;
  controls: Record<ControlKey, ControlCfg>;
  crossStyle: 'standard' | 'dot' | 'circle' | 'cross';
  crossLength: number;
  crossThickness: number;
  crossSize: number;
  crossDot: boolean;
  crossColor: string;
}

export const SETTINGS_KEY = 'bb.settings.v1';

export function defaultSettings(): Settings {
  return {
    targetFps: 60,
    sensitivity: 0.7,          // 默认灵敏度（比初版降低 30%）
    autoSprint: true,
    invertY: false,
    masterVolume: 0.9,
    playerName: '指挥官',
    serverAddr: '192.168.1.10',
    serverPort: 19000,
    controls: defaultControls(),
    crossStyle: 'standard',
    crossLength: 10,
    crossThickness: 2,
    crossSize: 1,
    crossDot: true,
    crossColor: '#ffffff',
  };
}

/** 把任意输入夹到合法范围（存档被手改 / 版本升级时用） */
export function sanitize(raw: unknown): Settings {
  const d = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return d;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, fb: number): number => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : fb;
    return Math.min(hi, Math.max(lo, n));
  };
  const fps = FPS_OPTIONS.includes(num(o.targetFps, 0, 1000, 60) as FpsOption)
    ? (num(o.targetFps, 0, 1000, 60) as FpsOption)
    : 60;

  const ctrlSrc = (typeof o.controls === 'object' && o.controls !== null)
    ? (o.controls as Record<string, unknown>) : {};
  const controls = defaultControls();
  for (const k of Object.keys(controls) as ControlKey[]) {
    const c = ctrlSrc[k] as Record<string, unknown> | undefined;
    if (!c) continue;
    controls[k] = {
      x: num(c.x, 0.03, 0.97, controls[k].x),
      y: num(c.y, 0.04, 0.96, controls[k].y),
      s: num(c.s, 0.5, 2.0, 1),
      a: num(c.a, 0.25, 1.0, controls[k].a),
    };
  }

  const style = o.crossStyle;
  return {
    targetFps: fps,
    sensitivity: num(o.sensitivity, 0.1, 3, d.sensitivity),
    autoSprint: typeof o.autoSprint === 'boolean' ? o.autoSprint : d.autoSprint,
    invertY: typeof o.invertY === 'boolean' ? o.invertY : d.invertY,
    masterVolume: num(o.masterVolume, 0, 1, d.masterVolume),
    playerName: typeof o.playerName === 'string' && o.playerName ? o.playerName : d.playerName,
    serverAddr: typeof o.serverAddr === 'string' && o.serverAddr ? o.serverAddr : d.serverAddr,
    serverPort: Math.round(num(o.serverPort, 1, 65535, d.serverPort)),
    controls,
    crossStyle: style === 'dot' || style === 'circle' || style === 'cross' ? style : 'standard',
    crossLength: num(o.crossLength, 2, 40, d.crossLength),
    crossThickness: num(o.crossThickness, 1, 8, d.crossThickness),
    crossSize: num(o.crossSize, 0.5, 2.5, d.crossSize),
    crossDot: typeof o.crossDot === 'boolean' ? o.crossDot : d.crossDot,
    crossColor: typeof o.crossColor === 'string' ? o.crossColor : d.crossColor,
  };
}

/** 只依赖需要的两个方法，避免引用 DOM 的 Storage 类型（核心模块保持环境无关） */
export interface KVStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** 取得运行环境的存储（没有则回退到内存） */
const memory = new Map<string, string>();
const memoryKV: KVStore = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => { memory.set(k, v); },
};

function defaultKV(): KVStore {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    if (g && g.localStorage && typeof g.localStorage.getItem === 'function') {
      return g.localStorage as KVStore;
    }
  } catch { /* 某些环境访问 localStorage 会抛异常 */ }
  return memoryKV;
}

export function load(storage?: KVStore): Settings {
  try {
    const s = storage ?? defaultKV();
    if (!s) return defaultSettings();
    const raw = s.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    return sanitize(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

export function save(v: Settings, storage?: KVStore): void {
  try {
    const s = storage ?? defaultKV();
    if (!s) return;
    s.setItem(SETTINGS_KEY, JSON.stringify(v));
  } catch {
    /* 存储不可用时静默忽略，不影响游戏 */
  }
}

/**
 * 主循环 + FPS 控制（纯逻辑，可单元测试）。
 *
 * ★ 关于 144Hz：
 *   WebView 的 requestAnimationFrame 上限跟随屏幕刷新率（60/90/120/144）。
 *   想跑满 144 就必须【不人为限流】；而选 60 时才按帧间隔丢弃多余帧。
 *   这与"关掉垂直同步"是两回事 —— 浏览器里没有 VSync 开关，
 *   只能通过 rAF + 时间门控来达成。
 */

export interface FpsMeterState {
  /** 累计帧数 */
  frames: number;
  /** 累计时间 */
  elapsed: number;
  /** 平滑后的 FPS */
  fps: number;
}

export function createMeter(): FpsMeterState {
  return { frames: 0, elapsed: 0, fps: 0 };
}

/** 每帧调用，返回平滑 FPS（每秒刷新一次读数） */
export function tickMeter(m: FpsMeterState, dt: number): FpsMeterState {
  const n = { frames: m.frames + 1, elapsed: m.elapsed + dt, fps: m.fps };
  if (n.elapsed >= 0.5) {
    n.fps = n.frames / n.elapsed;
    n.frames = 0;
    n.elapsed = 0;
  }
  return n;
}

/**
 * 帧门控：判断本帧是否应该渲染。
 * targetFps <= 0 表示不限（跑满刷新率）。
 */
export function shouldRender(targetFps: number, sinceLastRender: number): boolean {
  if (targetFps <= 0) return true;
  // 留 0.5ms 容差，避免因为浮点误差丢帧（比如 60Hz 屏选 60 反而掉到 30）
  return sinceLastRender >= 1 / targetFps - 0.0005;
}

/**
 * 固定步长的物理累加器。
 * 保证 144Hz 与 60Hz 下的移动手感一致。
 */
export interface Accum {
  left: number;
  step: number;
  maxSteps: number;
}

export function createAccum(step = 1 / 60, maxSteps = 5): Accum {
  return { left: 0, step, maxSteps };
}

/** 返回本帧应执行的固定步数，并更新累加器 */
export function pump(a: Accum, dt: number): { steps: number; accum: Accum } {
  // 单帧最多消费 0.25 秒，防止切后台回来后一次跑上千步
  const left = Math.min(a.left + Math.min(dt, 0.25), a.step * a.maxSteps);
  let steps = 0;
  let rest = left;
  while (rest >= a.step && steps < a.maxSteps) {
    rest -= a.step;
    steps++;
  }
  return { steps, accum: { ...a, left: rest } };
}

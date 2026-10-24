/**
 * 视角控制（纯函数，可单元测试）。
 *
 * 约定（右手系，y 轴向上）：
 *   dirFrom(yaw, pitch) => x = sin(yaw)*cos(pitch), y = sin(pitch), z = -cos(yaw)*cos(pitch)
 *   yaw = 0    朝 -z
 *   yaw 增大   朝向从 -z 转向 +x —— 从上往下看是顺时针，也就是【向右转】
 *   pitch 增大 抬头；pitch 减小 低头
 *
 * 移动端主流手感（CODM / PUBG 一类）：
 *   手指右滑 (dx > 0) -> 视角向右转 -> yaw 增大
 *   手指下滑 (dy > 0) -> 视角向下看 -> pitch 减小
 */

export const PITCH_LIMIT = 1.45;

export interface LookResult { yaw: number; pitch: number; }

/**
 * @param dx 手指水平位移（像素，向右为正）
 * @param dy 手指垂直位移（像素，向下为正）
 * @param sens 灵敏度倍率
 * @param invertY 反转纵向
 */
export function applyLook(
  yaw: number,
  pitch: number,
  dx: number,
  dy: number,
  sens: number,
  invertY = false,
): LookResult {
  // ★ 这里原来是 yaw -= dx，方向反了：右滑变成向左转。
  const nYaw = yaw + dx * sens;
  const nPitch = pitch - (invertY ? -dy : dy) * sens;
  return { yaw: nYaw, pitch: clampPitch(nPitch) };
}

export function clampPitch(p: number): number {
  return p < -PITCH_LIMIT ? -PITCH_LIMIT : p > PITCH_LIMIT ? PITCH_LIMIT : p;
}

/** 把角度归一到 (-π, π]，避免 yaw 无限增大 */
export function normalizeYaw(y: number): number {
  let a = y % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

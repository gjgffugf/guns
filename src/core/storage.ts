/**
 * 服务器列表持久化。
 *
 * ★ 用户反馈"重启后服务器没了"，排查方向有两个：
 *   1. WebView 的 DOM Storage 没启用 → localStorage 抛异常或写不进去
 *   2. 写入后没有校验 → 静默失败却以为成功了
 *
 * 这里把"写后读回校验"做成默认行为：写进去立刻读一次比对，
 * 不一致就返回 false，UI 据此提示用户，而不是假装保存成功。
 */

export interface SavedServer {
  name: string;
  host: string;
  port: number;
}

export const SERVERS_KEY = 'bb.servers.v2';

/** 旧版本的键（用于迁移，避免老用户丢数据） */
const LEGACY_KEYS = ['bb.servers.v1'];

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** 内存兜底：localStorage 完全不可用时不至于崩 */
const mem = new Map<string, string>();
export const memoryKV: KV = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => { mem.set(k, v); },
};

export function defaultKV(): KV {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    if (g?.localStorage && typeof g.localStorage.getItem === 'function') {
      return g.localStorage as KV;
    }
  } catch { /* 某些 WebView 访问 localStorage 会抛异常 */ }
  return memoryKV;
}

/** 单条记录的合法性校验（存档被手改 / 旧版本残留） */
export function isValidServer(x: unknown): x is SavedServer {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.host !== 'string' || !o.host.trim()) return false;
  const p = typeof o.port === 'number' ? o.port : Number(o.port);
  if (!Number.isFinite(p) || p < 1 || p > 65535) return false;
  return true;
}

/** 清洗：去掉非法项并补默认值 */
export function sanitizeServers(list: unknown): SavedServer[] {
  if (!Array.isArray(list)) return [];
  const out: SavedServer[] = [];
  for (const x of list) {
    if (!isValidServer(x)) continue;
    out.push({
      name: typeof x.name === 'string' && x.name ? x.name : x.host.trim(),
      host: x.host.trim(),
      port: Math.round(Number(x.port)),
    });
  }
  return out;
}

export function loadServers(kv?: KV): SavedServer[] {
  const s = kv ?? defaultKV();
  try {
    const raw = s.getItem(SERVERS_KEY);
    if (raw) {
      const list = sanitizeServers(JSON.parse(raw));
      if (list.length > 0) return list;
    }
  } catch { /* 继续尝试迁移旧键 */ }

  // 迁移：把旧版本存的服务器搬过来
  for (const k of LEGACY_KEYS) {
    try {
      const raw = s.getItem(k);
      if (!raw) continue;
      const list = sanitizeServers(JSON.parse(raw));
      if (list.length > 0) {
        saveServers(list, s);
        return list;
      }
    } catch { /* 忽略损坏的旧数据 */ }
  }
  return [];
}

/**
 * 保存并校验。
 * @returns true 表示确认已写入（读回一致）
 */
export function saveServers(list: SavedServer[], kv?: KV): boolean {
  const s = kv ?? defaultKV();
  const json = JSON.stringify(list);
  try {
    s.setItem(SERVERS_KEY, json);
    // ★ 写后读回：不校验的话，存储满了 / 被禁用时会"假装保存成功"
    const back = s.getItem(SERVERS_KEY);
    return back === json;
  } catch {
    return false;
  }
}

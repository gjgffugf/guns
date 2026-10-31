/**
 * 联机协议（JSON over WebSocket）。
 *
 * ★ 为什么走 WebSocket 而不是 UDP：
 *   浏览器 / WebView 里根本发不出 UDP 包（没有原始 socket 能力），
 *   只有 WebSocket。所以服务端必须同时提供 WS 端口。
 *   UDP 端口保留给原生客户端 / 调试用。
 */

export type StanceName = 'stand' | 'crouch' | 'prone';

/** 客户端 → 服务端 */
export type ClientMsg =
  | { t: 'join'; name: string }
  | { t: 'state'; x: number; y: number; z: number; yaw: number; pitch: number;
      hp: number; stance: StanceName; kills: number; deaths: number }
  | { t: 'ping'; ts: number }
  | { t: 'hit'; target: string; damage: number; head: boolean }
  | { t: 'shoot'; x: number; y: number; z: number; dx: number; dy: number; dz: number }
  /** 只查状态，不创建玩家（游戏外测延迟用） */
  | { t: 'query' }
  /** 上传自己的皮肤（data 为空表示清除）；走 WS，UDP 装不下 */
  | { t: 'skin'; data: string }
  /** 拉取某个玩家的皮肤 */
  | { t: 'getskin'; id: string }
  | { t: 'leave' };

/** 服务端 → 客户端 */
export type ServerMsg =
  | { t: 'welcome'; id: string; players: RemoteSnapshot[]; max: number }
  | { t: 'state'; seq: number; players: RemoteSnapshot[] }
  | { t: 'pong'; ts: number }
  | { t: 'join'; id: string; name: string }
  | { t: 'leave'; id: string }
  | { t: 'hit'; from: string; damage: number; head: boolean }
  | { t: 'kill'; killer: string; victim: string }
  /** query 的应答 */
  | { t: 'info'; online: number; max: number }
  /**
   * 皮肤下发。
   * - 自己上传后，服务器广播给房间内其他人
   * - getskin 的应答
   * data 为空字符串表示该玩家没有自定义皮肤。
   */
  | { t: 'skin'; id: string; data: string }
  | { t: 'error'; msg: string };

export interface RemoteSnapshot {
  id: string;
  name: string;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  hp: number;
  stance: StanceName;
  kills: number;
  deaths: number;
}

/**
 * 网络传输用的皮肤上限（字符数）。
 *
 * ★ 为什么单独限一个值：贴图是 base64 文本，几十 KB 很轻松。
 *   不设上限的话，一个恶意/异常客户端能把整个房间的带宽吃光，
 *   也会让服务端内存暴涨。128px JPEG 压缩后约 4~8KB，128KB 足够宽松。
 */
export const MAX_SKIN_CHARS = 131072;

/** 服务器信息（HTTP 状态页 / query 返回） */
export interface ServerInfo {
  name: string;
  online: number;
  max: number;
  version: string;
  map: string;
}

export function parseServerMsg(raw: string): ServerMsg | null {
  try {
    const o = JSON.parse(raw) as ServerMsg;
    return o && typeof o === 'object' && typeof o.t === 'string' ? o : null;
  } catch {
    return null;
  }
}

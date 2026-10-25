/**
 * 联机客户端（WebSocket）。
 *
 * 只负责收发与连接维护，不含任何游戏逻辑。
 */

import { parseServerMsg, type ClientMsg, type RemoteSnapshot, type ServerMsg, type ServerInfo } from './protocol';

export type NetStatus = 'idle' | 'connecting' | 'online' | 'error' | 'closed';

export interface NetEvents {
  onStatus: (s: NetStatus, detail: string) => void;
  onWelcome: (id: string, players: RemoteSnapshot[], max: number) => void;
  onState: (players: RemoteSnapshot[]) => void;
  onPong: (rtt: number) => void;
  onHit: (from: string, damage: number, head: boolean) => void;
  onKill: (killer: string, victim: string) => void;
}

/**
 * 连接诊断。
 *
 * ★ 为什么要单独做这个：
 *   Android 的明文流量拦截（API 28+ 默认禁止 ws://）从 JS 侧看
 *   和"服务器没开"完全一样 —— WebSocket 构造函数不抛异常，
 *   close code 恒为 1006，拿不到任何原因。
 *   所以只能靠"HTTP 状态页是否通"这个旁路来区分：
 *     HTTP 通 + WS 不通  → 多半是明文被系统拦截 / 端口不对
 *     HTTP 也不通        → 地址写错 / 服务器没开 / 不在同一网段
 */
export interface DiagResult {
  /** WebSocket 是否连上 */
  ws: boolean;
  /** HTTP 状态页是否可访问 */
  http: boolean;
  wsDetail: string;
  httpDetail: string;
  rtt: number;
  online: number;
  max: number;
  /** 给玩家看的结论 */
  hint: string;
}

export async function diagnose(host: string, port: number, timeoutMs = 5000): Promise<DiagResult> {
  const q = await queryServer(host, port, timeoutMs);
  const httpOk = q !== null;

  const wsRes = await new Promise<{ ok: boolean; detail: string }>((resolve) => {
    let done = false;
    const finish = (ok: boolean, detail: string) => {
      if (done) return;
      done = true;
      resolve({ ok, detail });
    };
    let ws: WebSocket;
    try {
      ws = new WebSocket(toWsUrl(host, port));
    } catch (e) {
      finish(false, `地址无效：${(e as Error).message}`);
      return;
    }
    const to = window.setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      finish(false, '超时无响应');
    }, timeoutMs);
    ws.onopen = () => {
      window.clearTimeout(to);
      try { ws.close(); } catch { /* ignore */ }
      finish(true, '握手成功');
    };
    ws.onerror = () => {
      window.clearTimeout(to);
      // ★ 浏览器/WebView 出于安全考虑不给出具体原因，只能报 1006
      finish(false, '连接失败（浏览器不返回具体原因，常见为 1006）');
    };
    ws.onclose = (e: CloseEvent) => {
      window.clearTimeout(to);
      if (!done) finish(false, `关闭码 ${e.code}`);
    };
  });

  let hint: string;
  if (wsRes.ok) {
    hint = '一切正常，可以连接';
  } else if (httpOk) {
    hint = '状态页能访问但游戏端口连不上 —— 通常是 App 未允许明文流量，'
         + '或端口被防火墙拦住。请确认安装的是最新构建。';
  } else {
    hint = '状态页和游戏端口都不通 —— 服务器没启动、地址写错，'
         + '或手机与服务器不在同一网段。';
  }

  return {
    ws: wsRes.ok,
    http: httpOk,
    wsDetail: wsRes.detail,
    httpDetail: q ? `${q.rtt}ms` : '无法访问',
    rtt: q ? q.rtt : -1,
    online: q ? q.info.online : -1,
    max: q ? q.info.max : -1,
    hint,
  };
}

/** 解析后的地址：是否带协议、主机名、是否已含端口 */
export interface ParsedHost {
  scheme: 'ws' | 'wss' | '';
  host: string;
  port: number;
}

/**
 * 解析玩家填的地址。
 *
 * ★ 之前的实现有个 bug：地址带协议时（例如 `wss://srv.example.com`）
 *   仍然无脑拼上端口，wss 走 443 时会算出 444 这种不存在的端口。
 */
export function parseHost(input: string, defaultPort: number): ParsedHost {
  const raw = (input || '').trim().replace(/\/+$/, '');
  const m = raw.match(/^(wss?|https?):\/\/([^/]+)/i);
  if (!m) {
    // 裸地址：可能自带 :port
    const mm = raw.match(/^([^:]+)(?::(\d+))?$/);
    if (mm) {
      return { scheme: '', host: mm[1], port: mm[2] ? Number(mm[2]) : defaultPort };
    }
    return { scheme: '', host: raw, port: defaultPort };
  }
  let scheme = m[1].toLowerCase();
  if (scheme === 'http') scheme = 'ws';
  if (scheme === 'https') scheme = 'wss';
  const rest = m[2];
  const mm = rest.match(/^([^:]+)(?::(\d+))?$/);
  if (mm && mm[2]) {
    return { scheme: scheme as 'ws' | 'wss', host: mm[1], port: Number(mm[2]) };
  }
  return {
    scheme: scheme as 'ws' | 'wss',
    host: rest,
    // 带协议但没写端口 → 用协议默认端口，不要再拼 +1
    port: scheme === 'wss' ? 443 : 80,
  };
}

/** ws://host:port 或 wss:// */
export function toWsUrl(host: string, port: number): string {
  const p = parseHost(host, port);
  return `${p.scheme || 'ws'}://${p.host}:${p.port}`;
}

export class NetClient {
  private ws: WebSocket | null = null;
  private ev: NetEvents;
  private status: NetStatus = 'idle';
  private pingTimer = 0;
  private lastPingAt = 0;
  /** 最近一次往返延迟（ms） */
  private rtt = -1;
  /** 最近一次关闭码，用于诊断（1006 = 连不上 / 被拦截） */
  private lastCloseCode = -1;
  private queue: ClientMsg[] = [];

  constructor(ev: NetEvents) {
    this.ev = ev;
  }

  get connected(): boolean { return this.status === 'online'; }
  get latency(): number { return this.rtt; }
  get closeCode(): number { return this.lastCloseCode; }
  get selfId(): string { return this.myId; }
  private myId = '';

  connect(url: string, name: string, timeoutMs = 6000): void {
    this.close();
    this.setStatus('connecting', url);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      this.setStatus('error', `地址无效：${(e as Error).message}`);
      return;
    }
    this.ws = ws;

    // 连不上要有超时，否则会一直挂在 connecting
    const to = window.setTimeout(() => {
      if (this.status === 'connecting') {
        try { ws.close(); } catch { /* ignore */ }
        this.setStatus('error', '连接超时');
      }
    }, timeoutMs);

    ws.onopen = () => {
      window.clearTimeout(to);
      this.setStatus('online', url);
      this.send({ t: 'join', name });
      // 心跳：测延迟 + 保活
      this.pingTimer = window.setInterval(() => {
        this.lastPingAt = performance.now();
        this.send({ t: 'ping', ts: this.lastPingAt });
      }, 2000);
      for (const m of this.queue) this.rawSend(m);
      this.queue.length = 0;
    };

    ws.onmessage = (e: MessageEvent) => {
      const msg = typeof e.data === 'string'
        ? parseServerMsg(e.data)
        : null;
      if (!msg) return;
      this.handle(msg);
    };

    ws.onerror = () => {
      window.clearTimeout(to);
      this.setStatus('error', '连接失败');
    };

    ws.onclose = (e: CloseEvent) => {
      window.clearTimeout(to);
      if (this.pingTimer) window.clearInterval(this.pingTimer);
      this.pingTimer = 0;
      this.lastCloseCode = e.code;
      if (this.status !== 'error') this.setStatus('closed', `已断开 (${e.code})`);
    };
  }

  private handle(m: ServerMsg): void {
    switch (m.t) {
      case 'welcome':
        this.myId = m.id;
        this.ev.onWelcome(m.id, m.players, m.max);
        break;
      case 'state':
        this.ev.onState(m.players);
        break;
      case 'pong':
        this.rtt = Math.round(performance.now() - m.ts);
        this.ev.onPong(this.rtt);
        break;
      case 'hit':
        this.ev.onHit(m.from, m.damage, m.head);
        break;
      case 'kill':
        this.ev.onKill(m.killer, m.victim);
        break;
      case 'error':
        this.setStatus('error', m.msg);
        break;
      default:
        break;
    }
  }

  private rawSend(m: ClientMsg): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try { this.ws.send(JSON.stringify(m)); } catch { /* ignore */ }
  }

  send(m: ClientMsg): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // 还没连上就先存着，连上后补发（避免 join 丢失）
      if (this.queue.length < 32) this.queue.push(m);
      return;
    }
    this.rawSend(m);
  }

  private setStatus(s: NetStatus, d: string): void {
    this.status = s;
    if (s !== 'online') this.rtt = -1;
    this.ev.onStatus(s, d);
  }

  close(): void {
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.pingTimer = 0;
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.myId = '';
  }
}

/** 查询服务器信息（HTTP，不进房间就能看到在线人数） */
export async function queryServer(
  host: string, port: number, timeoutMs = 4000,
): Promise<{ info: ServerInfo; rtt: number } | null> {
  const p = parseHost(host, port);
  const secure = p.scheme === 'wss';
  // ★ 状态页端口：裸地址时是 WS 端口 +1（自建服务器的约定）；
  //   地址自带协议时按协议默认端口走，不能无脑 +1。
  const httpPort = p.scheme ? (secure ? 443 : 80) : p.port + 1;
  const scheme = secure ? 'https' : 'http';
  const url = `${scheme}://${p.host}:${httpPort}/info`;

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const to = window.setTimeout(() => ctrl?.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { signal: ctrl?.signal, mode: 'cors' });
    window.clearTimeout(to);
    if (!res.ok) return null;
    const info = (await res.json()) as ServerInfo;
    return { info, rtt: Math.round(performance.now() - t0) };
  } catch {
    window.clearTimeout(to);
    return null;
  }
}

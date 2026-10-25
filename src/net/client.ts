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

/** ws://host:port 或 wss:// */
export function toWsUrl(host: string, port: number): string {
  const h = host.trim().replace(/\/+$/, '');
  if (/^wss?:\/\//i.test(h)) return h;
  const secure = /^https:\/\//i.test(h);
  const bare = h.replace(/^https?:\/\//i, '');
  return `${secure ? 'wss' : 'ws'}://${bare}:${port}`;
}

export class NetClient {
  private ws: WebSocket | null = null;
  private ev: NetEvents;
  private status: NetStatus = 'idle';
  private pingTimer = 0;
  private lastPingAt = 0;
  /** 最近一次往返延迟（ms） */
  private rtt = -1;
  private queue: ClientMsg[] = [];

  constructor(ev: NetEvents) {
    this.ev = ev;
  }

  get connected(): boolean { return this.status === 'online'; }
  get latency(): number { return this.rtt; }
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

    ws.onclose = () => {
      window.clearTimeout(to);
      if (this.pingTimer) window.clearInterval(this.pingTimer);
      this.pingTimer = 0;
      if (this.status !== 'error') this.setStatus('closed', '已断开');
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
  const base = host.trim().replace(/\/+$/, '');
  const httpPort = port + 1;                 // HTTP 状态页默认在 WS 端口 +1
  const scheme = /^wss:\/\//i.test(base) ? 'https' : 'http';
  const bare = base.replace(/^wss?:\/\//i, '').replace(/^https?:\/\//i, '');
  const url = `${scheme}://${bare}:${httpPort}/info`;

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

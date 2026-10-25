/**
 * 联机客户端（WebSocket）。
 *
 * 只负责收发与连接维护，不含任何游戏逻辑。
 */

import { parseServerMsg, type ClientMsg, type RemoteSnapshot, type ServerMsg, type ServerInfo } from './protocol';

/** ★ 'reconnecting' = 断开后正在自动重连（区别于首次连接） */
export type NetStatus = 'idle' | 'connecting' | 'online' | 'error' | 'closed' | 'reconnecting';

/** 自动重连最多尝试次数 */
export const MAX_RETRY = 5;

/**
 * 重连退避间隔（毫秒）。
 * 取"递增"而不是固定值：服务器刚重启时立刻重试多半还是失败，
 * 每轮多等一会儿才更容易在它恢复后连上。
 * 注入 retryDelay 后便于单元测试。
 */
export function backoffMs(attempt: number): number {
  const table = [800, 1500, 2500, 4000, 6000];
  return table[Math.min(attempt, table.length - 1)];
}

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
  /** 自动重连：记住上次连接的参数 */
  private url = '';
  private name = '';
  /** 已尝试的重连次数 */
  private retries = 0;
  private retryTimer = 0;
  /** 主动关闭（玩家退出）不再重连 */
  private intentionalClose = false;
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
  /** 当前重连次数（0 = 还没重连过） */
  get retryCount(): number { return this.retries; }
  private myId = '';

  connect(url: string, name: string, timeoutMs = 6000): void {
    this.url = url;
    this.name = name;
    this.intentionalClose = false;
    this.retries = 0;
    this.clearRetry();
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
      // 重连成功：清零计数，下次断开重新从 1 开始
      this.retries = 0;
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
      this.ws = null;

      // ★ 主动退出/首次连接失败不再重连。
      //   只有"连上过又断开"才自动重连，避免玩家点退出后又被拉回来。
      const hadSession = this.myId !== '' || this.retries > 0;
      if (this.intentionalClose || (!hadSession && e.code === 1006)) {
        if (this.status !== 'error') this.setStatus('closed', `已断开 (${e.code})`);
        return;
      }
      this.scheduleRetry();
    };
  }

  /**
   * ★ 断开后自动重连，最多 MAX_RETRY 次。
   *
   * 判定顺序很关键：必须先判断是否还有额度，
   * 用完才置为 closed —— 否则会先报"已断开"再偷偷重连，
   * 界面上一闪而过的顺序是反的。
   */
  private scheduleRetry(): void {
    if (this.retries >= MAX_RETRY) {
      this.setStatus('closed', `已断开 · 重连 ${MAX_RETRY} 次均未成功`);
      return;
    }
    this.retries += 1;
    const wait = backoffMs(this.retries - 1);
    this.setStatus('reconnecting', `重连中 ${this.retries}/${MAX_RETRY}（${(wait / 1000).toFixed(1)}s 后）`);
    this.clearRetry();
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = 0;
      if (this.intentionalClose) return;
      this.open(this.url, this.name);
    }, wait);
  }

  private clearRetry(): void {
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.retryTimer = 0;
  }

  /** 发起一次连接（不重置重连计数，供重连复用） */
  private open(url: string, name: string, timeoutMs = 6000): void {
    if (!url) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    const to = window.setTimeout(() => {
      if (this.status === 'connecting' || this.status === 'reconnecting') {
        try { ws.close(); } catch { /* ignore */ }
      }
    }, timeoutMs);

    ws.onopen = () => {
      window.clearTimeout(to);
      this.retries = 0;
      this.setStatus('online', url);
      this.send({ t: 'join', name });
      if (this.pingTimer) window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => {
        this.lastPingAt = performance.now();
        this.send({ t: 'ping', ts: this.lastPingAt });
      }, 2000);
      for (const m of this.queue) this.rawSend(m);
      this.queue.length = 0;
    };

    ws.onmessage = (e: MessageEvent) => {
      const msg = typeof e.data === 'string' ? parseServerMsg(e.data) : null;
      if (!msg) return;
      this.handle(msg);
    };

    ws.onerror = () => {
      window.clearTimeout(to);
      // 这里不设 error：真正的判定交给 onclose，避免状态被覆盖
    };

    ws.onclose = (e: CloseEvent) => {
      window.clearTimeout(to);
      if (this.pingTimer) window.clearInterval(this.pingTimer);
      this.pingTimer = 0;
      this.lastCloseCode = e.code;
      this.ws = null;
      const hadSession = this.myId !== '' || this.retries > 0;
      if (this.intentionalClose || (!hadSession && e.code === 1006)) {
        if (this.status !== 'error') this.setStatus('closed', `已断开 (${e.code})`);
        return;
      }
      this.scheduleRetry();
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

  /** 主动关闭：不再自动重连 */
  close(): void {
    this.intentionalClose = true;
    this.clearRetry();
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.pingTimer = 0;
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.myId = '';
  }
}

/**
 * ★ 用 WebSocket 探测服务器（HTTP 状态页不通时的兜底）。
 *
 * 为什么要这个：状态页是 http://，而 App 页面是 https://（Capacitor 的
 *   androidScheme）。从 https 页面请求 http 属于【混合内容】，
 *   即使服务端带了 Access-Control-Allow-Origin，也可能被 WebView 拦下，
 *   表现就是"延迟一直不显示"。而 ws:// 在游戏里是通的，
 *   所以用它来兜底最可靠。
 *
 * 连上后服务器会立刻下发 welcome（含在场玩家与上限），
 * 再发一个 ping 就能量出往返延迟 —— 人数和延迟都能拿到。
 */
export function probeServer(
  host: string, port: number, timeoutMs = 5000,
): Promise<{ online: number; max: number; rtt: number } | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: { online: number; max: number; rtt: number } | null): void => {
      if (done) return;
      done = true;
      window.clearTimeout(to);
      try { ws.close(); } catch { /* ignore */ }
      resolve(v);
    };
    let ws: WebSocket;
    try {
      ws = new WebSocket(toWsUrl(host, port));
    } catch {
      resolve(null);
      return;
    }
    const to = window.setTimeout(() => finish(null), timeoutMs);

    let online = -1;
    let max = -1;
    const t0 = performance.now();

    ws.onopen = () => {
      // ★ 先 query 拿人数（不建号，不会在房间里留下幽灵玩家），
      //   再 ping 量延迟。两者都到齐或任一超时就结束。
      try {
        ws.send(JSON.stringify({ t: 'query' }));
        ws.send(JSON.stringify({ t: 'ping', ts: t0 }));
      } catch { /* ignore */ }
    };
    let rtt = -1;
    const maybe = (): void => {
      if (rtt < 0) return;
      finish({ online: online < 0 ? 1 : online, max: max < 0 ? 0 : max, rtt });
    };
    ws.onmessage = (e: MessageEvent) => {
      if (typeof e.data !== 'string') return;
      const m = parseServerMsg(e.data);
      if (!m) return;
      if (m.t === 'info') {
        online = m.online;
        max = m.max;
        maybe();
      } else if (m.t === 'welcome') {
        // 老服务端没有 query，用 welcome 兜底
        online = m.players.length + 1;
        max = m.max;
        maybe();
      } else if (m.t === 'pong') {
        rtt = Math.round(performance.now() - m.ts);
        maybe();
      }
    };
    ws.onerror = () => finish(null);
    ws.onclose = () => finish(null);
  });
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

import { el, btn, show } from './dom';
import type { Settings } from '../core/settings';

export interface MenuHandlers {
  onSolo: () => void;
  onMulti: () => void;
  onRoom: () => void;
  onSettings: () => void;
}

import type { DiagResult } from '../net/client';

export interface SavedServer {
  name: string;
  host: string;
  port: number;
}

export interface MenuHandlers2 extends MenuHandlers {
  /** 打开多人服务器列表 */
  onMulti: () => void;
}

const SERVERS_KEY = 'bb.servers.v1';

export function loadServers(): SavedServer[] {
  try {
    const raw = localStorage.getItem(SERVERS_KEY);
    if (!raw) return [];
    const a = JSON.parse(raw) as SavedServer[];
    return Array.isArray(a) ? a.filter((x) => x && typeof x.host === 'string') : [];
  } catch {
    return [];
  }
}

export function saveServers(list: SavedServer[]): void {
  try { localStorage.setItem(SERVERS_KEY, JSON.stringify(list)); } catch { /* 忽略 */ }
}

/**
 * 服务器列表面板。
 * 支持添加 / 编辑 / 删除，并实时显示延迟与在线人数。
 */
export class ServerPanel {
  private node: HTMLElement;
  private listEl: HTMLElement;
  private formEl: HTMLElement;
  private actEl: HTMLElement;
  private diagEl: HTMLElement;
  private selected = -1;
  private servers: SavedServer[] = loadServers();
  /** 查询结果缓存：index -> {online, max, rtt, err} */
  private stats = new Map<number, { online: number; max: number; rtt: number; ok: boolean }>();

  constructor(
    parent: HTMLElement,
    private onConnect: (s: SavedServer) => void,
    private onQuery: (s: SavedServer) => Promise<{ online: number; max: number; rtt: number } | null>,
    private onDiag: (s: SavedServer) => Promise<DiagResult | null>,
    onClose: () => void,
  ) {
    this.node = el('div', { class: 'layer hidden', id: 'servers' });
    const panel = el('div', { class: 'panel' });

    panel.append(el('div', { class: 'hd', text: '服务器列表' }));
    this.listEl = el('div', { class: 'srvlist' });
    this.formEl = el('div', { class: 'srvform' });
    this.actEl = el('div', { class: 'srvact' });
    this.diagEl = el('pre', { class: 'diag', text: '' });

    const close = btn('返回', 'btn', () => { this.hide(); onClose(); });
    panel.append(this.listEl, this.formEl, this.actEl, this.diagEl, close);
    this.node.append(panel);
    parent.append(this.node);
    this.renderList();
    this.renderForm(null);
  }

  show(): void { show(this.node, true); this.refreshAll(); }
  hide(): void { show(this.node, false); }
  get isOpen(): boolean { return !this.node.classList.contains('hidden'); }

  /** 刷新所有服务器的延迟与人数 */
  async refreshAll(): Promise<void> {
    this.stats.clear();
    this.renderList();
    for (let i = 0; i < this.servers.length; i++) {
      const r = await this.onQuery(this.servers[i]);
      this.stats.set(i, r ? { ...r, ok: true } : { online: -1, max: -1, rtt: -1, ok: false });
      this.renderList();
    }
  }

  private renderList(): void {
    while (this.listEl.firstChild) this.listEl.removeChild(this.listEl.firstChild);
    if (this.servers.length === 0) {
      this.listEl.append(el('div', { class: 'note', text: '还没有服务器，在下方添加' }));
      return;
    }
    this.servers.forEach((sv, i) => {
      const row = el('button', { class: 'srvrow', type: 'button' }) as HTMLButtonElement;
      if (i === this.selected) row.classList.add('on');
      const st = this.stats.get(i);
      const statTxt = !st ? '查询中…'
        : st.ok ? `${st.rtt}ms · ${st.online}/${st.max} 人`
          : '无法连接';
      row.append(
        el('span', { class: 'sn', text: sv.name || sv.host }),
        el('span', { class: 'sh', text: `${sv.host}:${sv.port}` }),
        el('span', { class: 'ss', text: statTxt }),
      );
      row.addEventListener('click', () => { this.selected = i; this.renderList(); this.renderActs(); });
      this.listEl.append(row);
    });
  }

  private renderForm(edit: SavedServer | null): void {
    while (this.formEl.firstChild) this.formEl.removeChild(this.formEl.firstChild);
    const mk = (label: string, val: string, ph: string): HTMLInputElement => {
      const wrap = el('div', { class: 'row' });
      wrap.append(el('label', { text: label }));
      const i = el('input', { type: 'text', value: val }) as HTMLInputElement;
      i.placeholder = ph;
      wrap.append(i);
      this.formEl.append(wrap);
      return i;
    };
    const nameI = mk('名称', edit?.name ?? '', '我的服务器');
    const hostI = mk('地址', edit?.host ?? '', '192.168.1.10');
    const portI = mk('端口', String(edit?.port ?? 19000), '19000');
    this.formEl.append(btn(edit ? '保存修改' : '添加服务器', 'btn primary', () => {
      const host = hostI.value.trim();
      const port = Number(portI.value.trim()) || 19000;
      if (!host) return;
      const item: SavedServer = { name: nameI.value.trim() || host, host, port };
      if (edit) {
        const i = this.servers.indexOf(edit);
        if (i >= 0) this.servers[i] = item;
      } else {
        this.servers.push(item);
        this.selected = this.servers.length - 1;
      }
      saveServers(this.servers);
      this.renderList();
      this.renderForm(null);
      this.renderActs();
      void this.refreshAll();
    }));
  }

  /** ★ 诊断：连不上时用它区分"服务器没开"和"被系统拦截" */
  private async runDiag(sv: SavedServer): Promise<void> {
    this.diagEl.textContent = `正在诊断 ${sv.host}:${sv.port} …`;
    const r = await this.onDiag(sv);
    if (!r) {
      this.diagEl.textContent = '诊断失败';
      return;
    }
    this.diagEl.textContent =
      `游戏端口(WS)：${r.ws ? '通' : '不通'} —— ${r.wsDetail}\n`
      + `状态页(HTTP)：${r.http ? '通' : '不通'} —— ${r.httpDetail}\n`
      + (r.online >= 0 ? `在线人数：${r.online}/${r.max}\n` : '')
      + `\n结论：${r.hint}`;
  }

  /** 选中项下方的按钮组：连接 / 刷新延迟 / 诊断 / 编辑 / 删除 */
  private renderActs(): void {
    while (this.actEl.firstChild) this.actEl.removeChild(this.actEl.firstChild);
    if (this.selected < 0 || this.selected >= this.servers.length) return;
    const sv = this.servers[this.selected];
    this.actEl.append(
      btn('连接', 'btn primary', () => { this.hide(); this.onConnect(sv); }),
      btn('刷新延迟', 'btn', () => { void this.refreshAll(); }),
      btn('★ 诊断', 'btn', () => { void this.runDiag(sv); }),
      btn('编辑', 'btn', () => this.renderForm(sv)),
      btn('删除', 'btn danger', () => {
        this.servers.splice(this.selected, 1);
        this.selected = -1;
        saveServers(this.servers);
        this.renderList();
        this.renderActs();
      }),
    );
  }
}

export class MainMenu {
  private node: HTMLElement;
  private toastEl: HTMLElement | null = null;

  constructor(parent: HTMLElement, h: MenuHandlers, _s: Settings) {
    void _s;
    this.node = el('div', { class: 'layer hidden', id: 'menu' });

    const wrap = el('div', { class: 'wrap' });

    const left = el('div', { class: 'left' });
    left.append(
      el('div', { class: 'title', text: '破绷战场' }),
      el('div', { class: 'sub', text: 'B R E A K B I N D   B A T T L E F I E L D' }),
      el('div', { class: 'foot', text: 'xfan.games.gun   v0.2.5' }),
    );

    const right = el('div', { class: 'right' });
    const mode = (t: string, d: string, bg: string, onClick: () => void): HTMLButtonElement => {
      const b = el('button', { class: 'mode', type: 'button' });
      b.style.background = bg;
      b.append(el('div', { class: 't', text: t }), el('div', { class: 'd', text: d }));
      b.addEventListener('click', onClick);
      return b;
    };
    right.append(
      mode('单 人 模 式', '离线训练场 · 含 1 名战术人机', 'rgba(178,32,36,.92)', h.onSolo),
      mode('多 人 模 式', '连接自建服务器 · 联机对战', 'rgba(30,74,124,.92)', h.onMulti),
      mode('开 房 间', '功能开发中 · 敬请期待', 'rgba(48,52,62,.92)', h.onRoom),
    );

    wrap.append(left, right);
    const gear = btn('设置', 'gear', h.onSettings);
    this.node.append(wrap, gear);
    parent.append(this.node);
  }

  open(): void { show(this.node, true); }
  close(): void { show(this.node, false); }

  toast(msg: string): void {
    if (!this.toastEl) {
      this.toastEl = el('div', {
        class: 'notice', text: msg,
      });
      this.toastEl.style.cssText =
        'position:absolute;left:50%;bottom:16%;transform:translateX(-50%);'
        + 'background:rgba(0,0,0,.72);padding:14px 26px;border-radius:12px;font-size:20px;';
      this.node.append(this.toastEl);
    }
    this.toastEl.textContent = msg;
    show(this.toastEl, true);
    window.setTimeout(() => show(this.toastEl, false), 1800);
  }
}

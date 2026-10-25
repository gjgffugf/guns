import './style.css';
import { el, show } from './ui/dom';
import { buildSplash } from './ui/splash';
import { LoadingScreen } from './ui/loading';
import { MainMenu } from './ui/menu';
import { SettingsPanel } from './ui/settings';
import { Hud } from './ui/hud';
import { TouchControls, type CtrlEvent, type LookEvent } from './input/controls';
import { SoloSession } from './game/session';
import { MultiSession } from './game/multi';
import { ServerPanel, type SavedServer } from './ui/menu';
import { queryServer, diagnose } from './net/client';
import { HEAL_DEFS, type HealState } from './game/heal';
import { load, save, defaultSettings, type Settings } from './core/settings';
import { sfx } from './core/sfx';
import type { ControlKey } from './core/layout';

/**
 * 应用入口：开屏 -> 真实加载 -> 主菜单 -> 游戏。
 *
 * ★ 界面切换一律用 display:none（show()），
 *   DOM 里 display:none 的元素确实不参与事件命中，
 *   不会出现"隐藏界面吞掉点击"的问题。
 */

const app = document.getElementById('app') as HTMLElement;
let settings: Settings = load();

const canvas = el('canvas', { id: 'gl' }) as HTMLCanvasElement;
app.append(canvas);

/**
 * 粗略探测屏幕刷新率。
 *
 * ★ 必须声明在 settingsPanel 之前：
 *   SettingsPanel 构造时会立刻调用 refreshHz() 来显示"当前屏幕刷新率"，
 *   而 `let hzCache` 存在暂时性死区（TDZ）—— 声明在后面就会在构造时抛
 *   "Cannot access 'hzCache' before initialization"，整个界面起不来。
 *   这类错误 TypeScript 检查不出来，只有真跑一遍才会暴露。
 */
let hzCache = 0;
function detectRefreshHz(): number {
  if (hzCache > 0) return hzCache;
  const samples: number[] = [];
  let last = performance.now();
  let n = 0;
  const step = (now: number): void => {
    samples.push(now - last);
    last = now;
    if (++n < 30) requestAnimationFrame(step);
    else {
      samples.sort((a, b) => a - b);
      const mid = samples[Math.floor(samples.length / 2)];
      hzCache = mid > 0 ? 1000 / mid : 60;
    }
  };
  requestAnimationFrame(step);
  return hzCache > 0 ? hzCache : 60;
}

const loading = new LoadingScreen(app);
const menu = new MainMenu(app, {
  onSolo: () => startSolo(),
  onMulti: () => openServers(),
  onRoom: () => menu.toast('开房间功能暂未开放'),
  onSettings: () => settingsPanel.open(),
}, settings);

const settingsPanel = new SettingsPanel(app, settings, {
  onChange: (s) => { settings = s; save(s); applySettings(); },
  onClose: () => settingsPanel.close(),
  refreshHz: () => detectRefreshHz(),
});

let hud: Hud | null = null;
let session: SoloSession | MultiSession | null = null;
let serversPanel: ServerPanel | null = null;
let controls: TouchControls | null = null;

function applySettings(): void {
  sfx.setVolume(settings.masterVolume);
  if (controls) controls.setConfig(settings.controls);
  if (hud) {
    hud.drawCrosshair(settings);
    // 治疗按钮跟着 heal 控件的配置走（在设置里拖过就一起动）
    hud.layoutHeal(settings.controls.heal);
  }
  if (session) session.look(0, 0);
}

// ---------------- 开屏 -> 加载 -> 菜单 ----------------
async function boot(): Promise<void> {
  sfx.setVolume(settings.masterVolume);
  const splash = buildSplash(app);
  await splash.done;

  loading.open();
  // 真实加载：动态载入游戏模块 + 预热
  for (let i = 1; i <= 5; i++) {
    await new Promise((r) => setTimeout(r, 90));
    loading.setProgress(i / 5 * 0.6);
  }
  const { SoloSession: SS } = await import('./game/session');
  loading.setProgress(0.85);
  void SS;
  await new Promise((r) => setTimeout(r, 120));
  loading.setProgress(1);
  await new Promise((r) => setTimeout(r, 150));
  loading.close();

  menu.open();
}

// ---------------- 单人游戏 ----------------
function openServers(): void {
  if (!serversPanel) {
    serversPanel = new ServerPanel(
      app,
      (sv) => { void startMulti(sv); },
      async (sv) => {
        const r = await queryServer(sv.host, sv.port);
        return r ? { online: r.info.online, max: r.info.max, rtt: r.rtt } : null;
      },
      async (sv) => diagnose(sv.host, sv.port),
      () => { /* 返回主菜单 */ },
    );
  }
  serversPanel.show();
}

async function startMulti(sv: SavedServer): Promise<void> {
  loading.open();
  loading.setProgress(0.3);
  try {
    const { MultiSession: MS } = await import('./game/multi');
    const canvas = document.getElementById('gl') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('找不到画布');

    menu.close();
    loading.setProgress(0.7);

    if (!hud) {
      hud = new Hud(app, {
        onExit: () => exitGame(),
        onHealUse: () => session?.useHeal(),
        onHealToggle: () => session?.toggleHealList(),
        onHealPick: (k) => session?.pickHeal(k),
        onHealCancel: () => session?.cancelHeal(),
      }, settings);
    }
    hud.open();
    hud.drawCrosshair(settings);
    hud.layoutHeal(settings.controls.heal);

    session = new MS(canvas, makeSessionUI(), settings, {
      host: sv.host, port: sv.port, name: settings.playerName || '玩家',
    });

    // ★ 先进房间再开打：连不上就退回菜单并说明原因，
    //   否则会进到一个"只有自己"的空房间，看起来像单机，很难发现是连不上。
    loading.setProgress(0.85);
    const okc = await (session as MultiSession).waitReady(6000);
    if (!okc) {
      const why = (session as MultiSession).connectError || '未知原因';
      session.stop();
      session = null;
      hud.close();
      menu.open();
      menu.toast(`连接失败：${why}\n请在服务器列表点“诊断”查看原因`);
      loading.close();
      return;
    }

    session.start();
    bindControls();
    syncHeal(session.healState);
    loading.setProgress(1);
    loading.close();
  } catch (err) {
    console.error('[startMulti] 连接失败', err);
    loading.close();
    menu.open();
    menu.toast(`连接失败：${(err as Error).message}`);
    if (session) { try { session.stop(); } catch { /* 忽略 */ } session = null; }
  }
}

/** HUD 回调集合（单人与多人共用） */
function makeSessionUI(): import('./game/session').SessionUI {
  return {
    setFps: (f) => hud?.setFps(f),
    setScore: (t) => hud?.setScore(t),
    setStance: (t) => hud?.setStance(t),
    setHp: (a, b) => hud?.setHp(a, b),
    setAmmo: (a, r, m) => hud?.setAmmo(a, r, m),
    setTip: (t) => hud?.setTip(t),
    setNotice: (t) => hud?.setNotice(t),
    setCenter: (t) => hud?.setCenter(t),
    pushKill: (m) => hud?.pushKill(m),
    setAds: (on) => hud?.setAds(on),
    onHit: (head) => hud?.showHit(head),
    onMuzzle: () => hud?.flashMuzzle(),
    onHurt: () => hud?.flashHurt(),
    onHealChange: (h) => syncHeal(h),
    setHealTimer: () => { /* 倒计时走 setCenter */ },
    setBuff: (left) => hud?.setBuff(left),
    setCancel: (on, cb) => hud?.setCancel(on, cb),
  };
}

async function startSolo(): Promise<void> {
  menu.close();
  loading.open();
  loading.setProgress(0.3);

  if (!hud) {
    hud = new Hud(app, {
      onExit: () => exitGame(),
      onHealUse: () => session?.useHeal(),
      onHealToggle: () => session?.toggleHealList(),
      onHealPick: (k) => session?.pickHeal(k),
      onHealCancel: () => session?.cancelHeal(),
    }, settings);
  }
  loading.setProgress(0.6);

  try {
  session = new SoloSession(canvas, {
    setFps: (f) => hud?.setFps(f),
    setScore: (t) => hud?.setScore(t),
    setStance: (t) => hud?.setStance(t),
    setHp: (a, b) => hud?.setHp(a, b),
    setAmmo: (a, r, m) => hud?.setAmmo(a, r, m),
    setTip: (t) => hud?.setTip(t),
    setNotice: (t) => hud?.setNotice(t),
    setCenter: (t) => hud?.setCenter(t),
    pushKill: (m) => hud?.pushKill(m),
    setAds: (on) => hud?.setAds(on),
    setCancel: (on, cb) => hud?.setCancel(on, cb),
    onHit: (head) => hud?.showHit(head),
    onMuzzle: () => hud?.flashMuzzle(),
    onHurt: () => hud?.flashHurt(),
    onHealChange: (h) => syncHeal(h),
    setHealTimer: () => { /* 倒计时走 setCenter */ },
    setBuff: (left) => hud?.setBuff(left),
  }, settings);

  loading.setProgress(1);
  await new Promise((r) => setTimeout(r, 120));
  loading.close();

  show(canvas, true);
  hud.open();
  hud.drawCrosshair(settings);
  hud.layoutHeal(settings.controls.heal);
  session.start();
  bindControls();
  syncHeal(session.healState);
  } catch (err) {
    // 任何一步出错都必须收起加载层并回到菜单，
    // 否则会卡在全屏不透明的加载页上，表现为"界面加载不出来"。
    console.error('[startSolo] 进入游戏失败', err);
    loading.close();
    hud?.close();
    if (session) { try { session.stop(); } catch { /* 忽略 */ } session = null; }
    show(canvas, false);
    menu.open();
    menu.toast('进入游戏失败，已返回主菜单');
  }
}

/** 同步治疗物 UI（主按钮文案 + 展开列表 + 选中态） */
function syncHeal(h: HealState): void {
  if (!hud || !session) return;
  const items = session.healOrder.map((k) => ({
    kind: k,
    name: HEAL_DEFS[k].name,
    count: h.inv[k],
  }));
  hud.setHealListOpen(session.healOpen);
  hud.setHealMain(HEAL_DEFS[h.picked].name, h.inv[h.picked]);
  hud.renderHealList(items, h.picked, (k) => session?.pickHeal(k));
}

function bindControls(): void {
  if (controls) controls.destroy();
  controls = new TouchControls(
    app,
    settings.controls,
    (e: CtrlEvent) => onCtrl(e),
    (e: LookEvent) => onLook(e),
  );
}

function onCtrl(e: CtrlEvent): void {
  if (!session) return;
  const k: ControlKey = e.key;
  if (k === 'stick') {
    // nx/ny 是相对控件中心的归一化偏移
    const len = Math.hypot(e.nx, e.ny);
    const cl = Math.min(1, len);
    const nx = len > 0 ? (e.nx / len) * cl : 0;
    const ny = len > 0 ? (e.ny / len) * cl : 0;
    // ★ 摇杆头跟着手指动（松手归位）
    controls?.setStickVisual(e.phase === 'up' ? 0 : nx, e.phase === 'up' ? 0 : ny);
    if (e.phase === 'up') session.setStick(0, 0);
    else session.setStick(nx, ny);
    return;
  }
  // ★ 开火键的抬起必须在 phase 判断之前处理。
  //   原来写成 `if (e.phase !== 'down') return;` 会让 'up' 永远走不到，
  //   结果是按下开火后停不下来 —— 一直打到弹匣空。
  if (k === 'fire') {
    session.setFire(e.phase !== 'up');
    return;
  }
  if (e.phase !== 'down') return;
  switch (k) {
    case 'ads': session.toggleAds(); break;
    case 'jump': session.setJump(true); break;
    case 'crouch': session.setStance('crouch'); break;
    case 'prone': session.setStance('prone'); break;
    case 'reload': session.reload(); break;
    case 'melee': session.toggleWeapon(); break;
    case 'heal': session.useHeal(); break;
    default: break;
  }
}

function onLook(e: LookEvent): void {
  if (!session) return;
  if (e.phase === 'move') session.look(e.dx, e.dy);
}

function exitGame(): void {
  if (session) { session.stop(); session = null; }
  if (controls) { controls.destroy(); controls = null; }
  if (hud) hud.close();
  show(canvas, false);
  menu.open();
}

// ★ 首次真实用户手势时解锁音频。
//   Android WebView 的 AudioContext 创建后是 suspended 状态，
//   没有用户手势就不会出声 —— 这是"装上去没音效"最常见的原因。
for (const ev of ['pointerdown', 'touchstart', 'mousedown'] as const) {
  window.addEventListener(ev, () => sfx.unlock(), { once: true, passive: true });
}
// 从后台切回时也要恢复（部分 WebView 会挂起 AudioContext）
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) sfx.unlock();
});

// 屏幕尺寸变化（转屏 / 分屏）后重摆所有控件
window.addEventListener('resize', () => {
  controls?.relayoutPublic();
  if (hud) hud.layoutHeal(settings.controls.heal);
});

// 阻止系统手势干扰
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

// 保存设置
window.addEventListener('pagehide', () => save(settings));

boot().catch((err) => {
  console.error('[boot] 启动失败', err);
  loading.close();
  menu.open();
  menu.toast('启动异常，已返回主菜单');
});

// 便于调试 / 自动化验证（浏览器测试脚本靠它读游戏内部状态）
(window as unknown as { __bbDiag?: unknown }).__bbDiag = diagnose;
interface DebugHook { session: SoloSession | MultiSession | null }
(window as unknown as { __bb?: DebugHook }).__bb = {
  get session(): SoloSession | MultiSession | null { return session; },
};

void defaultSettings;

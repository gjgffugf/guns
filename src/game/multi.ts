/**
 * 多人联机会话。
 *
 * 与 SoloSession 的差异：
 *   - 没有 AI 陪练（服务端也不放任何 AI）
 *   - 远端玩家由服务器快照驱动，客户端做插值平滑
 *   - 命中判定在【本地】做（手感好），命中后上报服务端，服务端广播扣血
 *   - 不限时，只累计全场总击杀
 */

import * as THREE from 'three';
import { buildWorld, spawnPoints, groundHeight, ARENA, OBSTACLES } from './world';
import { buildSoldier, animateSoldier, type Soldier } from './model';
import {
  createPlayer, step, damage, EYE_HEIGHT, DEFAULT_TUNING,
  type PlayerInput, type PlayerState, type Stance,
} from './player';
import {
  createWeapon, tryFire, tryReload, stepWeapon, isReloading, def, refill,
  type WeaponState, type WeaponKind,
} from './weapon';
import { safeSpawn } from './bot';
import { applyLook } from './aim';
import { eyePos, dirFrom, pickTarget, rayBlockDistance, rayHitWall, modelYaw } from './combat';
import type { Settings } from '../core/settings';
import { sfx } from '../core/sfx';
import {
  createRenderMeter, pushRender, resetMeter, type Meter,
} from '../core/loop';
import {
  createHeal, beginUse, tickHeal, cancelUse, applyHeal, isBusy, canUse,
  HEAL_DEFS, HEAL_ORDER, speedMul, takenMul, dealtMul,
  type HealState, type HealKind,
} from './heal';
import type { StepWorld } from './player';
import { NetClient, toWsUrl, type NetEvents } from '../net/client';
import type { RemoteSnapshot, StanceName } from '../net/protocol';
import type { SessionUI } from './session';

const BODY_R = 0.42;

/** 远端玩家的本地表现（插值用） */
interface RemoteView {
  id: string;
  name: string;
  mesh: Soldier;
  /** 目标位置（服务器给的） */
  tx: number; ty: number; tz: number;
  tyaw: number;
  /** 当前显示位置 */
  x: number; y: number; z: number;
  yaw: number;
  hp: number;
  stance: StanceName;
  kills: number;
  deaths: number;
  /** 血条（跟随头顶） */
  bar: THREE.Sprite | null;
  alive: boolean;
  /** 乐观预测：本地命中后立刻扣血，等服务器覆盖 */
  predictHp: number;
}

export interface MultiOptions {
  host: string;
  port: number;
  name: string;
}

export class MultiSession {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer | null = null;
  private noGL = false;
  private playerSoldier: Soldier;

  private p: PlayerState;
  private weapon: WeaponState;
  private pitch = 0;
  private input: PlayerInput = {
    axisX: 0, axisY: 0, jumpPressed: false,
    wantCrouch: false, wantProne: false, autoSprint: true,
  };
  private wantFire = false;
  private ads = false;
  private heal: HealState = createHeal();
  private healListOpen = false;
  private recoil = 0;

  private remotes = new Map<string, RemoteView>();
  private net: NetClient;
  private myId = '';
  private rtt = -1;
  private statusText = '';

  /** 连接结果：'' = 还没结果，非空 = 失败原因 */
  private connError = '';
  /** 是否曾经成功连上（用于区分"首次连不上"与"中途掉线"） */
  private everOnline = false;
  /** onopen 后设为 true */
  private ready = false;
  private readyWaiters: Array<(ok: boolean) => void> = [];

  /** 等待连接结果；超时或出错返回 false */
  waitReady(timeoutMs = 6000): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    if (this.connError) return Promise.resolve(false);
    return new Promise((resolve) => {
      const t = window.setTimeout(() => {
        this.connError = '连接超时（6 秒内没有响应）';
        resolve(false);
      }, timeoutMs);
      this.readyWaiters.push((ok) => {
        window.clearTimeout(t);
        resolve(ok);
      });
    });
  }

  get connectError(): string { return this.connError; }

  private settle(ok: boolean, err = ''): void {
    if (ok) this.everOnline = true;
    this.ready = ok;
    if (err) this.connError = err;
    for (const w of this.readyWaiters) w(ok);
    this.readyWaiters.length = 0;
  }

  /** 全场总击杀（双方合计） */
  private totalKills = 0;
  private myKills = 0;
  private myDeaths = 0;

  private canvas: HTMLCanvasElement;
  private ui: SessionUI;
  private s: Settings;
  private raf = 0;
  private lastT = 0;
  private animT = 0;
  private meter: Meter = createRenderMeter();
  private running = false;
  private tickFn: FrameRequestCallback | null = null;
  private visBound = false;
  private onVis: (() => void) | null = null;
  private sinceRender = 0;
  private sendAcc = 0;
  private respawnLeft = 0;

  constructor(canvas: HTMLCanvasElement, ui: SessionUI, s: Settings, opt: MultiOptions) {
    this.ui = ui;
    this.s = s;
    this.canvas = canvas;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas, antialias: true, powerPreference: 'high-performance',
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = false;
    } catch (e) {
      console.warn('[Multi] WebGL 不可用，降级为无渲染模式：', e);
      this.renderer = null;
      this.noGL = true;
    }

    this.camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 300);
    buildWorld(this.scene);
    const hemi = new THREE.HemisphereLight(0xbcd0e8, 0x3a3a30, 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2e0, 1.25);
    sun.position.set(18, 30, 12);
    this.scene.add(sun);

    this.playerSoldier = buildSoldier();
    this.scene.add(this.playerSoldier.root);

    this.p = createPlayer(safeSpawn(spawnPoints(), OBSTACLES, BODY_R));
    this.weapon = createWeapon('ranged', 150);

    const ev: NetEvents = {
      onStatus: (st, d) => {
        this.statusText = `${labelOf(st)}${d ? ' · ' + d : ''}`;
        this.ui.setTip(this.statusText);
        if (st === 'online') {
          this.settle(true);
          // 重连成功：清掉之前显示的失败/断开提示
          this.ui.setNotice('');
        } else if (st === 'error') {
          // ★ 把关闭码带上，1006 基本就是"根本没连出去"
          const code = this.net.closeCode;
          const tail = code > 0 ? `（关闭码 ${code}）` : '';
          const why = code === 1006
            ? '未发出连接：地址不可达，或 App 未允许明文流量'
            : d;
          this.ui.setNotice(`连接失败${tail} · ${why}`);
          this.settle(false, why);
        } else if (st === 'closed') {
          // ★ 只有"从未连上"才判定为失败并退回菜单；
          //   已经进过房间又断开的，留在游戏里等自动重连。
          if (!this.everOnline) this.settle(false, '已断开');
        } else if (st === 'reconnecting') {
          this.ui.setNotice('');
          this.ui.setCenter('');
        }
      },
      onWelcome: (id, players, max) => {
        this.myId = id;
        void max;
        this.settle(true);
        this.everOnline = true;
        this.ui.setNotice('');
        this.ui.setTip(`已连接 · ${players.length + 1} 人在房间`);
        for (const p of players) this.ensureRemote(p);
      },
      onState: (players) => this.applySnapshot(players),
      onPong: (r) => { this.rtt = r; },
      onHit: (from, dmg, head) => this.takeRemoteHit(from, dmg, head),
      onKill: (killer, victim) => {
        this.totalKills += 1;
        if (killer === this.myId) {
          this.myKills += 1;
          this.ui.pushKill(`你击倒了 ${this.nameOf(victim)}`);
        } else if (victim === this.myId) {
          this.myDeaths += 1;
          this.ui.pushKill(`你被 ${this.nameOf(killer)} 击倒`);
        } else {
          this.ui.pushKill(`${this.nameOf(killer)} 击倒 ${this.nameOf(victim)}`);
        }
      },
    };

    this.net = new NetClient(ev);
    this.net.connect(toWsUrl(opt.host, opt.port), opt.name);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ---------------- 远端玩家 ----------------
  private ensureRemote(s: RemoteSnapshot): RemoteView {
    const exist = this.remotes.get(s.id);
    if (exist) return exist;
    const mesh = buildSoldier(0xdfe6f2);
    this.scene.add(mesh.root);
    const v: RemoteView = {
      id: s.id, name: s.name, mesh,
      tx: s.x, ty: s.y, tz: s.z, tyaw: s.yaw,
      x: s.x, y: s.y, z: s.z, yaw: s.yaw,
      hp: s.hp, stance: s.stance, kills: s.kills, deaths: s.deaths,
      bar: null, alive: s.hp > 0, predictHp: s.hp,
    };
    this.remotes.set(s.id, v);
    return v;
  }

  private applySnapshot(list: RemoteSnapshot[]): void {
    const seen = new Set<string>();
    for (const s of list) {
      if (s.id === this.myId) continue;
      seen.add(s.id);
      const v = this.ensureRemote(s);
      v.tx = s.x; v.ty = s.y; v.tz = s.z; v.tyaw = s.yaw;
      v.hp = s.hp;                       // 服务器权威值覆盖乐观预测
      v.predictHp = s.hp;
      v.stance = s.stance;
      v.kills = s.kills; v.deaths = s.deaths;
      v.alive = s.hp > 0;
      v.name = s.name;
    }
    // 离开的玩家移除
    for (const id of Array.from(this.remotes.keys())) {
      if (!seen.has(id)) {
        const v = this.remotes.get(id)!;
        this.scene.remove(v.mesh.root);
        this.remotes.delete(id);
      }
    }
  }

  private nameOf(id: string): string {
    return this.remotes.get(id)?.name ?? '对手';
  }

  /** 被远端打中（服务端广播） */
  private takeRemoteHit(_from: string, dmg: number, _head: boolean): void {
    void _from; void _head;
    if (!this.p.alive) return;
    this.p = damage(this.p, dmg * takenMul(this.heal.buff));
    sfx.hurt();
    this.ui.onHurt();
    if (!this.p.alive) this.onDown();
  }

  private onDown(): void {
    this.respawnLeft = 3;
    this.ui.pushKill('你被击倒了');
    this.ui.setCenter('');
  }

  // ---------------- 主循环 ----------------
  start(): void {
    if (this.noGL) this.ui.setNotice('WebGL 不可用，无法显示画面');
    this.lastT = performance.now();
    this.meter = resetMeter();
    const tick = (now: number): void => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - this.lastT) / 1000);
      this.lastT = now;
      this.sinceRender += dt;
      const budget = this.s.targetFps > 0 ? 1 / this.s.targetFps - 0.0005 : 0;
      if (this.sinceRender >= budget) {
        const gap = this.sinceRender;
        this.sinceRender = 0;
        // ★ 只统计真正渲染出来的帧；gap 是距上次渲染的时间
        this.meter = pushRender(this.meter, gap);
        if (this.meter.fps > 0) {
          this.ui.setFps(this.meter.fps);
          // 右上角顺带显示延迟
          this.ui.setScore(`击杀 ${this.myKills} / 死亡 ${this.myDeaths} · 全场 ${this.totalKills}`
            + (this.rtt >= 0 ? ` · ${this.rtt}ms` : ''));
        }
        this.update(gap);
        this.render();
      }
    };
    this.tickFn = tick;
    this.running = true;
    this.raf = requestAnimationFrame(tick);
    this.bindVisibility();
  }

  /** 切后台暂停循环（与单人模式同样的原因：避免帧率读数被污染） */
  private bindVisibility(): void {
    if (this.visBound) return;
    this.visBound = true;
    this.onVis = () => {
      if (document.hidden) {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.meter = resetMeter();
      } else if (!this.raf && this.running && this.tickFn) {
        this.lastT = performance.now();
        this.sinceRender = 0;
        this.meter = resetMeter();
        this.raf = requestAnimationFrame(this.tickFn);
      }
    };
    document.addEventListener('visibilitychange', this.onVis);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.tickFn = null;
    if (this.onVis) {
      document.removeEventListener('visibilitychange', this.onVis);
      this.onVis = null;
    }
    this.visBound = false;
    this.net.close();
    window.removeEventListener('resize', () => this.resize());
    if (this.renderer) this.renderer.dispose();
  }

  private stepWorld(): StepWorld {
    return {
      bounds: ARENA - 0.6,
      obstacles: OBSTACLES,
      radius: BODY_R,
      heightAt: groundHeight,
    };
  }

  private update(dt: number): void {
    this.animT += dt;

    if (!this.p.alive) {
      this.respawnLeft -= dt;
      this.ui.setNotice(`${Math.max(0, Math.ceil(this.respawnLeft))} 秒后复活`);
      if (this.respawnLeft <= 0) this.respawn();
      this.updateRemotes(dt);
      return;
    }
    this.ui.setNotice('');

    const wasGrounded = this.p.grounded;
    const tun = speedMul(this.heal.buff) !== 1
      ? { ...DEFAULT_TUNING,
          walkSpeed: DEFAULT_TUNING.walkSpeed * speedMul(this.heal.buff),
          sprintSpeed: DEFAULT_TUNING.sprintSpeed * speedMul(this.heal.buff) }
      : DEFAULT_TUNING;
    this.p = step(this.p, this.input, dt, tun, this.stepWorld());
    this.input.jumpPressed = false;
    if (!wasGrounded && this.p.grounded) sfx.land();

    this.tickHealState(dt);

    this.weapon = stepWeapon(this.weapon, dt);
    if (this.wantFire) {
      if (isBusy(this.heal)) {
        this.wantFire = false;
      } else {
        const r = tryFire(this.weapon);
        if (r.fired) {
          this.weapon = r.weapon;
          sfx.shoot(this.weapon.kind === 'melee');
          this.ui.onMuzzle();
          this.recoil = Math.min(0.06, this.recoil + 0.012);
          this.shoot(r.damage * dealtMul(this.heal.buff));
        } else if (r.reason === 'empty') {
          if (this.weapon.reserve > 0 && !isReloading(this.weapon)) {
            const rl = tryReload(this.weapon);
            if (rl.ok) { this.weapon = rl.weapon; sfx.reload(); this.ui.setTip('弹匣已空 · 自动换弹'); }
          } else if (this.weapon.reserve <= 0) {
            this.ui.setTip('没有备用弹药');
            sfx.dryFire();
          }
          this.wantFire = false;
        }
      }
    }

    this.recoil = Math.max(0, this.recoil - dt * 0.28);
    this.updateRemotes(dt);
    this.syncHpBar();
    this.pushState(dt);

    const eye = eyePos(this.p);
    this.camera.position.set(eye.x, eye.y, eye.z);
    const d = dirFrom(this.p.yaw, this.pitch + this.recoil);
    this.camera.lookAt(eye.x + d.x, eye.y + d.y, eye.z + d.z);
    this.playerSoldier.root.visible = false;   // 第一人称不显示自己
  }

  /** 20Hz 上报自己的状态 */
  private pushState(dt: number): void {
    this.sendAcc += dt;
    if (this.sendAcc < 0.05) return;
    this.sendAcc = 0;
    this.net.send({
      t: 'state',
      x: +this.p.pos.x.toFixed(3), y: +this.p.pos.y.toFixed(3), z: +this.p.pos.z.toFixed(3),
      yaw: +this.p.yaw.toFixed(3), pitch: +this.pitch.toFixed(3),
      hp: Math.round(this.p.hp), stance: this.p.stance as StanceName,
      kills: this.myKills, deaths: this.myDeaths,
    });
  }

  private updateRemotes(dt: number): void {
    // 插值系数：快照 20Hz，用指数平滑逼近
    const k = Math.min(1, dt * 12);
    for (const v of this.remotes.values()) {
      v.x += (v.tx - v.x) * k;
      v.y += (v.ty - v.y) * k;
      v.z += (v.tz - v.z) * k;
      // 角度插值走最短弧
      let diff = v.tyaw - v.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      v.yaw += diff * k;

      const m = v.mesh;
      m.root.visible = v.alive;
      m.root.position.set(v.x, v.y, v.z);
      m.root.rotation.y = modelYaw(v.yaw);
      // 倒地：放倒
      m.root.rotation.x = v.alive ? 0 : Math.PI / 2 * 0.85;
      const speed = Math.hypot(v.tx - v.x, v.tz - v.z) / Math.max(dt, 1e-3);
      animateSoldier(m, this.animT, v.alive ? speed : 0, true);
      this.moveBar(v);
    }
  }

  /** 头顶血条（用 Sprite 始终朝向相机） */
  private barTex = new Map<string, THREE.CanvasTexture>();
  private moveBar(v: RemoteView): void {
    if (!v.bar) {
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 12;
      const tex = new THREE.CanvasTexture(cv);
      this.barTex.set(v.id, tex);
      const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(1.1, 0.2, 1);
      this.scene.add(sp);
      v.bar = sp;
    }
    const h = EYE_HEIGHT[v.stance] + 0.32;
    v.bar.position.set(v.x, v.y + h, v.z);
    v.bar.visible = v.alive;

    const tex = this.barTex.get(v.id)!;
    const cv = tex.image as HTMLCanvasElement;
    const g = cv.getContext('2d');
    if (g) {
      g.clearRect(0, 0, 64, 12);
      g.fillStyle = 'rgba(0,0,0,.65)';
      g.fillRect(0, 0, 64, 12);
      const p = Math.max(0, Math.min(1, v.predictHp / 100));
      g.fillStyle = p < 0.3 ? '#ff4d4d' : '#4dff88';
      g.fillRect(2, 2, Math.round(60 * p), 8);
      tex.needsUpdate = true;
    }
  }

  private syncHpBar(): void {
    this.ui.setHp(this.p.hp, this.p.maxHp);
    this.ui.setAmmo(this.weapon.ammo, this.weapon.reserve, this.weapon.kind === 'melee');
    const st = this.p.stance;
    this.ui.setStance(st === 'stand' ? '站立' : st === 'crouch' ? '蹲下' : '趴下');
  }

  private shoot(dmg: number): void {
    const origin = eyePos(this.p);
    const dir = dirFrom(this.p.yaw, this.pitch);
    const d = def(this.weapon.kind);

    const targets = Array.from(this.remotes.values())
      .filter((v) => v.alive)
      .map((v) => ({ id: v.id, pos: { x: v.x, y: v.y, z: v.z }, stance: v.stance as Stance, radius: 0.5 }));

    const pick = pickTarget(origin, dir, targets, d.range);
    const wallDist = rayBlockDistance(origin, dir, OBSTACLES, d.range);
    const wall = rayHitWall(origin, dir, OBSTACLES, d.range);

    if (!pick || pick.distance > wallDist) {
      if (wall) this.ui.onHit(false);
      return;
    }

    const mul = pick.head ? 1.6 : 1;
    const v = this.remotes.get(pick.id)!;
    this.ui.onHit(pick.head);
    sfx.hit();

    // ★ 乐观预测：立刻在本地扣血刷条，避免"看着还有半管血却突然死了"
    //   服务器快照回来会覆盖成权威值，所以不会累积误差。
    v.predictHp = Math.max(1, v.predictHp - dmg * mul);

    // 上报服务端
    this.net.send({ t: 'hit', target: pick.id, damage: dmg * mul, head: pick.head });
  }

  private respawn(): void {
    const p0 = safeSpawn(spawnPoints(), OBSTACLES, BODY_R);
    this.heal = cancelUse(this.heal);
    this.healListOpen = false;
    this.p = createPlayer(p0);
    this.weapon = refill(createWeapon('ranged', 150), 150);
    this.ui.setNotice('');
  }

  private tickHealState(dt: number): void {
    const r = tickHeal(this.heal, dt, this.p.hp, this.p.maxHp);
    this.heal = r.state;
    if (r.finished) {
      const d = HEAL_DEFS[r.finished];
      const before = this.p.hp;
      this.p = { ...this.p, hp: applyHeal(this.p.hp, this.p.maxHp, r.healAmount, r.full) };
      const gain = Math.round(this.p.hp - before);
      this.ui.setCenter('');
      this.ui.setCancel(false);
      this.ui.setTip(d.buff > 0 ? `${d.name} · 状态提升 15s` : `恢复 ${gain} 点`);
      this.ui.onHealChange(this.heal);
    } else if (this.heal.using) {
      this.ui.setCenter(`${HEAL_DEFS[this.heal.using].name}\n${this.heal.left.toFixed(1)}s`);
      this.ui.setCancel(true, () => this.cancelHeal());
      this.ui.setBuff(this.heal.buff.left);
    } else {
      this.ui.setBuff(this.heal.buff.left);
    }
  }

  private render(): void {
    if (this.renderer) this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width) || window.innerWidth);
    const h = Math.max(1, Math.round(rect.height) || window.innerHeight);
    if (this.renderer) this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------- 对外接口（与 SoloSession 一致） ----------------
  setStick(x: number, y: number): void { this.input.axisX = x; this.input.axisY = y; }
  setJump(v: boolean): void {
    this.input.jumpPressed = v;
    if (v && (this.p.grounded || this.p.coyote > 0)) sfx.jump();
  }
  setFire(v: boolean): void { this.wantFire = v; }
  toggleAds(): void {
    this.ads = !this.ads;
    this.ui.setAds(this.ads);
    this.playerSoldier.parts.gun.visible = !this.ads;
  }
  setStance(kind: 'crouch' | 'prone'): void {
    const was = this.p.stance;
    if (kind === 'crouch') this.p.stance = was === 'crouch' ? 'stand' : 'crouch';
    else this.p.stance = was === 'prone' ? 'stand' : 'prone';
  }
  reload(): void {
    const r = tryReload(this.weapon);
    if (r.ok) { this.weapon = r.weapon; sfx.reload(); }
    else if (r.reason === '没有备用弹药') this.ui.setTip('没有备用弹药');
    else if (r.reason === '弹匣已满') this.ui.setTip('弹匣已满');
  }
  toggleWeapon(): void {
    const next: WeaponKind = this.weapon.kind === 'ranged' ? 'melee' : 'ranged';
    this.weapon = createWeapon(next, this.weapon.reserve);
    this.playerSoldier.parts.gun.visible = next === 'ranged';
    sfx.click();
    this.ui.setTip(next === 'melee' ? '已切换到刀' : '已切换到步枪');
  }
  look(dx: number, dy: number): void {
    const sens = this.s.sensitivity * (this.ads ? 0.45 : 1) * 0.0064;
    const r = applyLook(this.p.yaw, this.pitch, dx, dy, sens, this.s.invertY);
    this.p.yaw = r.yaw;
    this.pitch = r.pitch;
  }

  useHeal(): void {
    if (this.healListOpen) return;
    const k = this.heal.picked;
    if (this.heal.inv[k] <= 0) { this.ui.setTip(`${HEAL_DEFS[k].name} 已用完`); return; }
    if (!canUse(this.heal, k, this.p.hp, this.p.maxHp)) {
      if (this.p.hp >= this.p.maxHp && k !== 'energy') this.ui.setTip('已满血');
      return;
    }
    this.heal = beginUse(this.heal, k, this.p.hp, this.p.maxHp);
    this.wantFire = false;
    this.ui.setCancel(true, () => this.cancelHeal());
    this.ui.onHealChange(this.heal);
  }
  pickHeal(k: HealKind): void {
    if (isBusy(this.heal)) return;
    this.heal = { ...this.heal, picked: k };
    this.healListOpen = false;
    this.ui.onHealChange(this.heal);
  }
  toggleHealList(): void {
    if (isBusy(this.heal)) return;
    this.healListOpen = !this.healListOpen;
    this.ui.onHealChange(this.heal);
  }
  cancelHeal(): void {
    this.heal = cancelUse(this.heal);
    this.ui.setCenter('');
    this.ui.setCancel(false);
    this.ui.setTip('已取消');
    this.ui.onHealChange(this.heal);
  }

  get healState(): HealState { return this.heal; }
  get healOpen(): boolean { return this.healListOpen; }
  get healOrder(): HealKind[] { return HEAL_ORDER; }
  get renderOK(): boolean { return !this.noGL; }
  get latency(): number { return this.rtt; }
  get debugYaw(): number { return this.p.yaw; }
  get debugHp(): number { return this.p.hp; }
  get debugAmmo(): number { return this.weapon.ammo; }
  get debugAirborne(): boolean { return !this.p.grounded; }
  get debugCannotFire(): boolean { return isBusy(this.heal); }
  setHpForTest(v: number): void { this.p = { ...this.p, hp: Math.max(1, Math.min(this.p.maxHp, v)) }; }
}

function labelOf(st: string): string {
  switch (st) {
    case 'connecting': return '连接中…';
    case 'online': return '已连接';
    case 'error': return '连接失败';
    case 'reconnecting': return '重连中';
    case 'closed': return '已断开';
    default: return '未连接';
  }
}

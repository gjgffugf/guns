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
import { createBot, stepBot, hurtBot, safeSpawn } from './bot';
import { applyLook } from './aim';
import { eyePos, dirFrom, pickTarget, hasLineOfSight } from './combat';
import type { Settings } from '../core/settings';
import type { V3 } from '../core/vec';
import { sfx } from '../core/sfx';
import type { StepWorld } from './player';

/** 单人对局：玩家 + 1 名战术人机，先到 10 分获胜，10 分钟倒计时 */

const WIN_SCORE = 10;
const MATCH_TIME = 600;

export interface SessionUI {
  setFps(fps: number): void;
  setScore(t: string): void;
  setStance(t: string): void;
  setHp(hp: number, max: number): void;
  setAmmo(a: number, r: number, melee: boolean): void;
  setTip(t: string): void;
  setNotice(t: string): void;
  setCenter(t: string): void;
  pushKill(m: string): void;
  setAds(on: boolean): void;
}

/** 角色圆柱半径（碰撞用） */
const BODY_R = 0.42;

export class SoloSession {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer | null = null;
  /** WebGL 不可用时的降级标志：逻辑照常跑，只是不出画面 */
  private noGL = false;
  private playerSoldier: Soldier;
  private botSoldiers: Soldier[] = [];
  private bots = new Map<string, ReturnType<typeof createBot>>();
  private botMeshes = new Map<string, Soldier>();

  private p: PlayerState;
  private weapon: WeaponState;
  private pitch = 0;
  private input: PlayerInput = {
    axisX: 0, axisY: 0, jumpPressed: false,
    wantCrouch: false, wantProne: false, autoSprint: true,
  };
  private wantFire = false;
  private ads = false;
  private respawnLeft = 0;

  private scoreSelf = 0;
  private scoreEnemy = 0;
  private timeLeft = MATCH_TIME;
  private over = false;
  private animT = 0;
  private ui: SessionUI;
  private s: Settings;
  private raf = 0;
  private lastT = 0;
  private sinceRender = 0;
  private frames = 0;
  private fpsAcc = 0;
  private fps = 60;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, ui: SessionUI, s: Settings) {
    this.ui = ui;
    this.s = s;
    this.canvas = canvas;

    // ★ WebGL 创建必须容错。
    //   设备不支持 / 驱动异常 / 内存不足时，构造函数会直接抛异常；
    //   不接住的话整个启动流程中断，加载层永远收不起来 —— 表现为"卡在加载页"。
    //   这里降级为"无画面但逻辑照跑"，并让 UI 明确提示，而不是白屏或卡死。
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas, antialias: true, powerPreference: 'high-performance',
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = false;
    } catch (e) {
      console.warn('[Session] WebGL 不可用，降级为无渲染模式：', e);
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

    this.spawnBots();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private spawnBots(): void {
    const pts = spawnPoints();
    for (let i = 0; i < 1; i++) {
      const b = createBot(`战术兵${i + 1}`, safeSpawn(pts, OBSTACLES, BODY_R));
      const m = buildSoldier(0xe8e4dc);
      this.scene.add(m.root);
      const id = `bot${i}`;
      this.bots.set(id, b);
      this.botMeshes.set(id, m);
      this.botSoldiers.push(m);
    }
  }

  private resize(): void {
    // ★ 用 canvas 的实际布局尺寸，而不是 window.innerWidth/Height。
    //   后者在部分 WebView / 带状态栏的机型上会与画布真实区域不一致，
    //   相机宽高比算错就会在边缘留出空白带。
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width) || window.innerWidth);
    const h = Math.max(1, Math.round(rect.height) || window.innerHeight);
    if (this.renderer) this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 渲染是否可用（供上层提示） */
  get renderOK(): boolean { return !this.noGL; }

  /** 碰撞与地面（玩家、人机共用同一套） */
  private stepWorld(): StepWorld {
    return {
      bounds: ARENA - 0.6,
      obstacles: OBSTACLES,
      radius: BODY_R,
      heightAt: groundHeight,
    };
  }

  /** 调试/测试用：当前朝向 */
  get debugYaw(): number { return this.p.yaw; }
  get debugPitch(): number { return this.pitch; }
  get debugPos(): V3 { return this.p.pos; }

  // ---------------- 输入接口 ----------------
  setStick(x: number, y: number): void { this.input.axisX = x; this.input.axisY = y; }
  setJump(v: boolean): void {
    this.input.jumpPressed = v;
    // 只有真的能起跳时才出声（避免在空中乱按一直响）
    if (v && (this.p.grounded || this.p.coyote > 0)) sfx.jump();
  }
  setFire(v: boolean): void { this.wantFire = v; }
  toggleAds(): void {
    this.ads = !this.ads;
    this.ui.setAds(this.ads);
    // 开镜时隐藏枪械模型，只显示倍镜轮廓
    this.playerSoldier.parts.gun.visible = !this.ads;
  }
  setStance(kind: 'crouch' | 'prone'): void {
    const was = this.p.stance;
    if (kind === 'crouch') this.p.stance = was === 'crouch' ? 'stand' : 'crouch';
    else this.p.stance = was === 'prone' ? 'stand' : 'prone';
  }
  reload(): void {
    const r = tryReload(this.weapon);
    if (r.ok) {
      this.weapon = r.weapon;
      sfx.reload();
    }
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
    // 每像素的转动弧度：0.0032*2 ≈ 0.0064 rad/px
    const sens = this.s.sensitivity * (this.ads ? 0.45 : 1) * 0.0064;
    const r = applyLook(this.p.yaw, this.pitch, dx, dy, sens, this.s.invertY);
    this.p.yaw = r.yaw;
    this.pitch = r.pitch;
  }

  // ---------------- 主循环 ----------------
  start(): void {
    if (this.noGL) {
      this.ui.setNotice('WebGL 不可用，无法显示画面');
    }
    this.lastT = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(0.1, (now - this.lastT) / 1000);
      this.lastT = now;
      this.frames++;
      this.fpsAcc += dt;
      if (this.fpsAcc >= 0.5) {
        this.fps = this.frames / this.fpsAcc;
        this.frames = 0;
        this.fpsAcc = 0;
        this.ui.setFps(this.fps);
      }

      // 帧门控
      this.sinceRender += dt;
      const budget = this.s.targetFps > 0 ? 1 / this.s.targetFps - 0.0005 : 0;
      if (this.sinceRender >= budget) {
        this.sinceRender = 0;
        this.update(dt);
        this.render();
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('resize', () => this.resize());
    if (this.renderer) this.renderer.dispose();
  }

  private update(dt: number): void {
    this.animT += dt;
    if (this.over) return;

    // ---- 死亡 / 复活 ----
    if (!this.p.alive) {
      this.respawnLeft -= dt;
      this.ui.setNotice(`${Math.max(0, Math.ceil(this.respawnLeft))} 秒后复活`);
      if (this.respawnLeft <= 0) this.respawn();
      this.updateBots(dt);
      return;
    }
    if (this.ui) this.ui.setNotice('');

    // ---- 玩家 ----
    // ★ 传入世界信息：碰撞 + 地面高度都在 step 内部完成，
    //   所以不会出现"走出场外"或"穿墙"。
    const wasGrounded = this.p.grounded;
    this.p = step(this.p, this.input, dt, DEFAULT_TUNING, this.stepWorld());
    this.input.jumpPressed = false;
    if (!wasGrounded && this.p.grounded) sfx.land();

    // ---- 武器 ----
    this.weapon = stepWeapon(this.weapon, dt);
    if (this.wantFire) {
      const r = tryFire(this.weapon);
      if (r.fired) {
        this.weapon = r.weapon;
        sfx.shoot(this.weapon.kind === 'melee');
        this.shoot(r.damage);
      } else if (r.reason === 'empty') {
        this.ui.setTip('弹匣已空 · 点击换弹');
        sfx.dryFire();
        this.wantFire = false;
      }
    }

    // ---- 人机 ----
    this.updateBots(dt);

    // ---- 比赛 ----
    this.timeLeft -= dt;
    if (this.scoreSelf >= WIN_SCORE || this.scoreEnemy >= WIN_SCORE || this.timeLeft <= 0) {
      this.finish();
    }

    // ---- HUD ----
    this.ui.setHp(this.p.hp, this.p.maxHp);
    this.ui.setAmmo(this.weapon.ammo, this.weapon.reserve, this.weapon.kind === 'melee');
    this.ui.setStance(this.stanceName());
    this.ui.setScore(`我方 ${this.scoreSelf} : ${this.scoreEnemy} 敌方    ${this.fmtTime()}`);
    if (isReloading(this.weapon)) {
      this.ui.setTip(`换弹中 ${(this.weapon.reloadLeft).toFixed(1)}s`);
    } else if (this.weapon.kind === 'ranged' && this.weapon.ammo === 0) {
      this.ui.setTip('按换弹补充弹药');
    } else if (!this.ui) {
      /* noop */
    } else {
      this.ui.setTip('');
    }

    // ---- 相机 ----
    const eye = eyePos(this.p);
    this.camera.position.set(eye.x, eye.y, eye.z);
    const d = dirFrom(this.p.yaw, this.pitch);
    this.camera.lookAt(eye.x + d.x, eye.y + d.y, eye.z + d.z);
    this.camera.fov = this.ads ? 38 : 75;
    this.camera.updateProjectionMatrix();

    // ---- 玩家模型 ----
    this.playerSoldier.root.position.set(this.p.pos.x, this.p.pos.y, this.p.pos.z);
    this.playerSoldier.root.rotation.y = this.p.yaw + Math.PI;
    this.playerSoldier.root.visible = false;   // 第一人称隐藏自身
    animateSoldier(this.playerSoldier, this.animT, Math.hypot(this.p.vel.x, this.p.vel.z), this.p.grounded);
  }

  private updateBots(dt: number): void {
    for (const [id, b] of this.bots) {
      const r = stepBot(b, {
        playerPos: this.p.pos,
        playerAlive: this.p.alive,
        bounds: ARENA - 0.6,
        obstacles: OBSTACLES,
        radius: BODY_R,
        heightAt: groundHeight,
      }, dt, DEFAULT_TUNING);
      if (r.hitPlayer && this.p.alive) {
        this.p = damage(this.p, 9);
        sfx.hurt();
        if (!this.p.alive) this.onPlayerDown();
      }
      this.bots.set(id, r.bot);
      const m = this.botMeshes.get(id);
      if (m) {
        m.root.position.set(r.bot.state.pos.x, r.bot.state.pos.y, r.bot.state.pos.z);
        m.root.rotation.y = r.bot.state.yaw + Math.PI;
        animateSoldier(m, this.animT, Math.hypot(r.bot.state.vel.x, r.bot.state.vel.z), r.bot.state.grounded);
        // 倒地：放倒
        m.root.rotation.z = r.bot.phase === 'down' ? Math.PI / 2 : 0;
      }
    }
  }

  private shoot(dmg: number): void {
    const origin = eyePos(this.p);
    const dir = dirFrom(this.p.yaw, this.pitch);
    const d = def(this.weapon.kind);

    const targets = Array.from(this.bots.entries())
      .filter(([, b]) => b.state.alive)
      .map(([id, b]) => ({
        id, pos: b.state.pos, stance: b.state.stance as Stance, radius: 0.5,
      }));

    const pick = pickTarget(origin, dir, targets, d.range);
    if (!pick) return;
    // 视线遮挡
    if (!hasLineOfSight(origin, this.bots.get(pick.id)!.state.pos, OBSTACLES)) return;

    const mul = pick.head ? 1.6 : 1;
    const b = this.bots.get(pick.id)!;
    const hurt = hurtBot(b, dmg * mul);
    this.bots.set(pick.id, hurt);
    if (!hurt.state.alive) {
      this.scoreSelf += 1;
      sfx.kill();
      this.ui.pushKill(`击倒 ${hurt.name}`);
    } else {
      sfx.hit();
    }
  }

  private onPlayerDown(): void {
    this.respawnLeft = 3;
    this.scoreEnemy += 1;
    this.ui.pushKill('你被击倒了');
    this.ui.setCenter('');
  }

  private respawn(): void {
    const p0 = safeSpawn(spawnPoints(), OBSTACLES, BODY_R);
    this.p = createPlayer(p0);
    this.weapon = refill(createWeapon('ranged', 150), 150);
    this.ui.setNotice('');
  }

  private finish(): void {
    this.over = true;
    let msg: string;
    if (this.scoreSelf > this.scoreEnemy) msg = '胜利';
    else if (this.scoreSelf < this.scoreEnemy) msg = '失败';
    else msg = '平局';
    this.ui.setNotice(`${msg}   ${this.scoreSelf} : ${this.scoreEnemy}`);
    this.ui.setCenter(msg);
  }

  private stanceName(): string {
    const map: Record<Stance, string> = { stand: '站立', crouch: '蹲下', prone: '趴下' };
    return map[this.p.stance];
  }

  private fmtTime(): string {
    const t = Math.max(0, Math.floor(this.timeLeft));
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }

  private render(): void {
    if (this.renderer) this.renderer.render(this.scene, this.camera);
  }

  /** 提供给外部：应用自定义贴图 */
  applySkin(img: HTMLImageElement): void {
    void img;
  }

  get eyeHeight(): number { return EYE_HEIGHT[this.p.stance]; }
  get playerPos(): V3 { return this.p.pos; }
}

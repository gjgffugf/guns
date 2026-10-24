import * as THREE from 'three';
import type { V3 } from '../core/vec';

/**
 * 地图：代码生成的测试战场。
 *
 * ★ 中央高台的斜坡方向（此前 Godot 版本出过 bug）：
 *   斜坡必须做成"外低内高"——外端贴地(y=0)、内端与台面齐平(y=台高)。
 *   写反了会变成"外高内低"，看着就是一堵悬空的薄墙，而且能穿过去。
 */

export const ARENA = 30;          // 半边长
export const PLATFORM_H = 2.4;    // 中央高台高度
export const PLATFORM_R = 6.0;    // 中央高台半径

export interface Obstacle {
  pos: V3;
  r: number;
  h: number;
}

/** 场景里的障碍物（用于碰撞与视线遮挡） */
export const OBSTACLES: Obstacle[] = [];

export function buildWorld(scene: THREE.Scene): void {
  OBSTACLES.length = 0;

  // ---- 地面 ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA * 2, ARENA * 2),
    new THREE.MeshLambertMaterial({ color: 0x3a3f36 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 地面网格（视觉参考）
  const grid = new THREE.GridHelper(ARENA * 2, 30, 0x4a5048, 0x333a33);
  grid.position.y = 0.01;
  scene.add(grid);

  // ---- 四面围墙 ----
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x4a4038 });
  const wallH = 4;
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(ARENA * 2, wallH, 0.6), wallMat);
    const a = (i * Math.PI) / 2;
    w.position.set(Math.sin(a) * ARENA, wallH / 2, Math.cos(a) * ARENA);
    w.rotation.y = a;
    scene.add(w);
  }

  // ---- 中央高台 ----
  const plat = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATFORM_R, PLATFORM_R, PLATFORM_H, 24),
    new THREE.MeshLambertMaterial({ color: 0x5a5040 }),
  );
  plat.position.set(0, PLATFORM_H / 2, 0);
  plat.castShadow = true;
  plat.receiveShadow = true;
  scene.add(plat);
  // ★ 高台【不】加进 OBSTACLES。
  //   四面都是斜坡，地面高度已由 groundHeight() 连续给出；
  //   若把它当实心圆柱，玩家会在坡底被侧面挡住，永远走不上台。
  //   （这一条由 tests/collide.test.ts 的"走上斜坡能登顶"守着）

  // ---- 四面斜坡（外低内高）----
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    // 斜坡水平投影长度
    const runLen = 4.5;
    const slopeLen = Math.hypot(runLen, PLATFORM_H);
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(5.0, 0.4, slopeLen),
      new THREE.MeshLambertMaterial({ color: 0x6a5f4a }),
    );
    // 内端搭在台边(y=PLATFORM_H)，外端落地(y=0)
    const innerR = PLATFORM_R - 0.6;
    const outerR = innerR + runLen;
    const midR = (innerR + outerR) / 2;
    // 倾角：从外端(0)升到内端(PLATFORM_H)
    const pitch = Math.atan2(PLATFORM_H, runLen);
    ramp.position.set(Math.sin(a) * midR, PLATFORM_H / 2, Math.cos(a) * midR);
    ramp.rotation.y = a;
    // 绕自身 X 轴倾斜，使外侧低、内侧高
    ramp.rotation.x = -pitch;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    scene.add(ramp);
  }

  // ---- 掩体箱子 ----
  const boxMat = new THREE.MeshLambertMaterial({ color: 0x5c5148 });
  const spots: Array<[number, number]> = [
    [-16, -16], [16, -16], [-16, 16], [16, 16],
    [-20, 0], [20, 0], [0, -20], [0, 20],
    [-10, -22], [10, 22], [22, -10], [-22, 10],
  ];
  for (const [x, z] of spots) {
    const h = 1.6 + ((Math.abs(x) + Math.abs(z)) % 3) * 0.5;
    const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, h, 3.2), boxMat);
    b.position.set(x, h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
    OBSTACLES.push({ pos: { x, y: 0, z }, r: 2.3, h });
  }
}

/** 地面高度：高台内为台高，其余为 0（简化） */
export function groundHeight(x: number, z: number): number {
  const d = Math.hypot(x, z);
  if (d <= PLATFORM_R) return PLATFORM_H;
  if (d <= PLATFORM_R + 4.5) {
    // 斜坡区：线性插值
    const t = (d - PLATFORM_R) / 4.5;
    return PLATFORM_H * (1 - t);
  }
  return 0;
}

/** 出生点（远离中心，且避开掩体） */
export function spawnPoints(): V3[] {
  return [
    { x: -24, y: 0, z: -24 }, { x: 24, y: 0, z: 24 },
    { x: -24, y: 0, z: 24 }, { x: 24, y: 0, z: -24 },
    { x: 0, y: 0, z: -26 }, { x: 0, y: 0, z: 26 },
  ];
}

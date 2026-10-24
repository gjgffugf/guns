import * as THREE from 'three';

/**
 * 标准白色火柴人（粗线条）。
 * 支持自定义贴图：任意比例图片按人形区域裁剪后贴到躯干。
 */

const LIMB = 0.13;      // 四肢粗细
const BODY_W = 0.42;    // 躯干宽

export interface Soldier {
  root: THREE.Group;
  parts: {
    head: THREE.Mesh;
    torso: THREE.Mesh;
    armL: THREE.Mesh;
    armR: THREE.Mesh;
    legL: THREE.Mesh;
    legR: THREE.Mesh;
    gun: THREE.Group;
  };
  skinTargets: THREE.Mesh[];
}

function limb(len: number, thick: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(thick, len - thick * 2, 4, 8), mat);
  return m;
}

export function buildSoldier(color = 0xf2f5fa): Soldier {
  const root = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(BODY_W, 0.72, 0.26), mat);
  torso.position.y = 1.16;
  torso.castShadow = true;
  root.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), mat);
  head.position.y = 1.68;
  head.castShadow = true;
  root.add(head);

  // 手臂：挂在肩部，绕肩摆动
  const armL = limb(0.62, LIMB, mat);
  armL.position.set(-0.30, 1.30, 0);
  armL.castShadow = true;
  root.add(armL);

  const armR = limb(0.62, LIMB, mat);
  armR.position.set(0.30, 1.30, 0);
  armR.castShadow = true;
  root.add(armR);

  // 腿：挂在髋部
  const legL = limb(0.78, LIMB + 0.02, mat);
  legL.position.set(-0.14, 0.45, 0);
  legL.castShadow = true;
  root.add(legL);

  const legR = limb(0.78, LIMB + 0.02, mat);
  legR.position.set(0.14, 0.45, 0);
  legR.castShadow = true;
  root.add(legR);

  // 枪（持在右手前方）
  const gun = buildGun();
  gun.position.set(0.30, 1.15, -0.42);
  root.add(gun);

  return { root, parts: { head, torso, armL, armR, legL, legR, gun }, skinTargets: [torso, head] };
}

export function buildGun(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x2b2f38 });
  const metal = new THREE.MeshLambertMaterial({ color: 0x4a5058 });

  const rec = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.12, 0.62), body);
  rec.position.z = -0.1;
  g.add(rec);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.42, 8), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.01, -0.55);
  g.add(barrel);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.20, 0.11), body);
  mag.position.set(0, -0.14, 0.06);
  g.add(mag);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.10, 0.24), body);
  stock.position.z = 0.28;
  g.add(stock);

  return g;
}

/** 近战武器（刀） */
export function buildKnife(): THREE.Group {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.03, 0.42),
    new THREE.MeshLambertMaterial({ color: 0xc8ced8 }),
  );
  blade.position.z = -0.26;
  g.add(blade);
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 0.16),
    new THREE.MeshLambertMaterial({ color: 0x33383f }),
  );
  grip.position.z = 0.04;
  g.add(grip);
  return g;
}

/** 跑动动画：四肢摆动 + 躯干起伏 */
export function animateSoldier(s: Soldier, t: number, speed: number, grounded: boolean): void {
  const amp = Math.min(1, speed / 7.6);
  const swing = Math.sin(t * 9) * 0.7 * amp;

  if (grounded && amp > 0.05) {
    s.parts.legL.rotation.x = swing;
    s.parts.legR.rotation.x = -swing;
    s.parts.armL.rotation.x = -swing * 0.8;
    s.parts.armR.rotation.x = swing * 0.8;
    s.root.position.y = Math.abs(Math.sin(t * 9)) * 0.05 * amp;
  } else if (!grounded) {
    // 空中：腿收起
    s.parts.legL.rotation.x = -0.4;
    s.parts.legR.rotation.x = 0.25;
    s.parts.armL.rotation.x = -0.5;
    s.parts.armR.rotation.x = -0.3;
    s.root.position.y = 0;
  } else {
    s.parts.legL.rotation.x *= 0.85;
    s.parts.legR.rotation.x *= 0.85;
    s.parts.armL.rotation.x *= 0.85;
    s.parts.armR.rotation.x *= 0.85;
    s.root.position.y = 0;
  }
}

/**
 * 应用自定义贴图。
 * 任意比例的图片都会按"人形区域"居中裁剪（cover 模式），
 * 不会拉伸变形。
 */
export function applySkin(s: Soldier, img: HTMLImageElement): void {
  const tex = new THREE.Texture(img);
  tex.needsUpdate = true;
  // 按图片长宽比做 cover 裁剪：把 UV 缩放到中心正方形区域
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const aspect = iw / ih;
  if (aspect > 1) {
    // 宽图：裁左右
    tex.repeat.set(1 / aspect, 1);
    tex.offset.set((1 - 1 / aspect) / 2, 0);
  } else {
    // 高图：裁上下
    tex.repeat.set(1, aspect);
    tex.offset.set(0, (1 - aspect) / 2);
  }
  const mat = new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff });
  for (const m of s.skinTargets) m.material = mat;
}

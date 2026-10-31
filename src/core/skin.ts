import { ICONS } from '../ui/icons';

/**
 * 自定义皮肤：选一张图，按"人形区域"裁剪后贴到角色身上。
 *
 * ★ 之前这个函数只有声明没有实现，UI 里也没有入口，
 *   等于功能压根没接上。这里补齐存储 + 加载 + 压缩。
 */

export const SKIN_KEY = 'bb.skin.v1';
/** 压缩后的最大边长：再大 localStorage 容易写满 */
export const MAX_SIDE = 512;
/** 网络同步用的边长：贴在火柴人上够看，体积却小得多 */
export const NET_SIDE = 128;

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function defaultKV(): KV {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    if (g?.localStorage && typeof g.localStorage.getItem === 'function') {
      return g.localStorage as KV;
    }
  } catch { /* 某些 WebView 访问会抛异常 */ }
  const mem = new Map<string, string>();
  return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); } };
}

export function loadSkinData(kv?: KV): string | null {
  try {
    const v = (kv ?? defaultKV()).getItem(SKIN_KEY);
    return v && v.startsWith('data:image/') ? v : null;
  } catch {
    return null;
  }
}

/** @returns true 表示确认写进去了（读回一致） */
export function saveSkinData(dataUrl: string, kv?: KV): boolean {
  const s = kv ?? defaultKV();
  try {
    s.setItem(SKIN_KEY, dataUrl);
    return s.getItem(SKIN_KEY) === dataUrl;
  } catch {
    return false;
  }
}

export function clearSkinData(kv?: KV): void {
  try { (kv ?? defaultKV()).setItem(SKIN_KEY, ''); } catch { /* ignore */ }
}

/**
 * 把任意图片缩放裁成居中的正方形。
 *
 * ★ 为什么要压缩：手机拍的图动辄 4000px，直接存 dataURL 会
 *   几 MB，localStorage 根本写不下（一般上限 5~10MB 且按字符算）。
 */
export function fitImage(img: HTMLImageElement, maxSide = MAX_SIDE): string {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const side = Math.min(maxSide, Math.max(iw, ih));
  const scale = side / Math.max(iw, ih);
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));

  const c = document.createElement('canvas');
  c.width = side;
  c.height = side;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  // 背景填白：JPEG 没有 alpha，不填会是黑底
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, side, side);
  ctx.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
  try {
    return c.toDataURL('image/jpeg', 0.86);
  } catch {
    return '';
  }
}

/**
 * 压缩到【网络传输用】的尺寸。
 *
 * ★ 为什么要比本地存档小得多：
 *   本地 512px 是为了看清楚，但网络版要发给房间里每一个人、
 *   而且新玩家加入时会重复拉取。128px 贴在火柴人身上完全够看
 *   （角色在屏幕上通常也就一两百像素），体积却只有本地版的 1/10 左右。
 */
export function compressForNet(img: HTMLImageElement, side = NET_SIDE): string {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const c = document.createElement('canvas');
  c.width = side;
  c.height = side;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  // 仍按 cover 裁成居中正方形，保证比例不变形
  const scale = side / Math.min(iw, ih);
  const w = Math.round(iw * scale);
  const h = Math.round(ih * scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, side, side);
  ctx.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
  try {
    return c.toDataURL('image/jpeg', 0.72);
  } catch {
    return '';
  }
}

/** 把 dataURL 转成可直接贴图的图片对象 */
export function imgFrom(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('皮肤解码失败'));
    im.src = dataUrl;
  });
}

/** 读文件 -> 图片对象（同时返回压缩后的 dataURL 以便存档） */
export function skinFromFile(file: File): Promise<{ img: HTMLImageElement; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const dataUrl = fitImage(img);
      // 用压缩后的图再建一个对象，保证贴图与存档一致
      const small = new Image();
      small.onload = () => resolve({ img: small, dataUrl });
      small.onerror = () => reject(new Error('图片处理失败'));
      small.src = dataUrl || url;
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取该图片'));
    };
    img.src = url;
  });
}

/** 从 dataURL 载入（启动时恢复上次选的皮肤） */
export function skinFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('皮肤加载失败'));
    img.src = dataUrl;
  });
}

/** 占位图标（没有自定义皮肤时展示） */
export function skinPlaceholder(): string {
  return ICONS.skin;
}

import { el, btn, show } from './dom';

/**
 * 开屏：优先播放视频（浏览器原生支持 mp4/H.264，比 Godot 的 ogv 通用得多），
 * 找不到视频则回退到静态图；播放结束后才进入真实加载动画。
 *
 * ★ 资源放在 assets/splash/：
 *   splash.mp4（首选）/ splash.webm / splash.jpg / splash.png
 */

const VIDEO_SRC = ['./assets/splash/splash.mp4', './assets/splash/splash.webm'];
const IMG_SRC = ['./assets/splash/splash.jpg', './assets/splash/splash.png'];

const VIDEO_MAX = 12;     // 视频最长等待（秒）
const IMG_TIME = 2.8;     // 静态图展示时长

export interface SplashHandle {
  node: HTMLElement;
  done: Promise<void>;
}

export function buildSplash(parent: HTMLElement): SplashHandle {
  const node = el('div', { class: 'layer', id: 'splash' });
  const bar = el('div', { class: 'bar' });
  const barIn = el('i');
  bar.append(barIn);

  let resolve: () => void;
  const done = new Promise<void>((r) => { resolve = r; });
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    resolve();
  };

  const skip = btn('跳过', 'skip', () => { finish(); });
  node.append(bar, skip);
  parent.append(node);

  const tryVideo = (): boolean => {
    for (const src of VIDEO_SRC) {
      // 用 fetch 探测资源是否存在（HEAD 更快，但部分静态服务不支持）
      const v = el('video', {
        src, muted: true, playsinline: true, autoplay: true, preload: 'auto',
      }) as HTMLVideoElement;
      v.muted = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.style.position = 'absolute';
      v.style.inset = '0';

      let ok = false;
      v.addEventListener('loadeddata', () => { ok = true; }, { once: true });
      v.addEventListener('error', () => {
        v.remove();
        // 视频不可用 -> 退回静态图
        if (!tryImage()) finish();
      }, { once: true });
      v.addEventListener('ended', () => { finish(); }, { once: true });

      node.prepend(v);
      v.play().catch(() => { /* 自动播放被拦截时由 error/超时兜底 */ });

      // 超时兜底：视频卡住也不能卡住启动
      window.setTimeout(() => {
        if (!finished) {
          if (!ok) { v.remove(); if (!tryImage()) finish(); }
          else finish();
        }
      }, 3000);

      // 进度条
      const tick = window.setInterval(() => {
        if (!v.duration || !Number.isFinite(v.duration)) return;
        barIn.style.width = `${Math.min(100, (v.currentTime / v.duration) * 100)}%`;
      }, 100);
      window.setTimeout(() => window.clearInterval(tick), (VIDEO_MAX + 1) * 1000);
      window.setTimeout(finish, VIDEO_MAX * 1000);
      return true;
    }
    return false;
  };

  const tryImage = (): boolean => {
    for (const src of IMG_SRC) {
      const img = el('img', { src, alt: '开屏' });
      img.addEventListener('error', () => {
        img.remove();
        finish();
      }, { once: true });
      img.addEventListener('load', () => {
        // 缓慢放大 + 淡入
        img.animate(
          [{ opacity: 0, transform: 'scale(1)' }, { opacity: 1, transform: 'scale(1.08)' }],
          { duration: IMG_TIME * 1000, fill: 'forwards' },
        );
        let t = 0;
        const tick = window.setInterval(() => {
          t += 0.05;
          barIn.style.width = `${Math.min(100, (t / IMG_TIME) * 100)}%`;
          if (t >= IMG_TIME) {
            window.clearInterval(tick);
            finish();
          }
        }, 50);
      }, { once: true });
      node.prepend(img);
      return true;
    }
    return false;
  };

  // 先探测视频是否可用，不可用再走图片
  fetch(VIDEO_SRC[0], { method: 'HEAD' })
    .then((r) => { if (r.ok) tryVideo(); else if (!tryImage()) finish(); })
    .catch(() => { if (!tryImage()) finish(); });

  return { node, done: done.then(() => { show(node, false); node.remove(); }) };
}

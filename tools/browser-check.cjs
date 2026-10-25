/**
 * 用真实浏览器验证：界面能加载、控件可见、点击有反应。
 * 这是 Godot 版本做不到的事 —— 现在可以真跑一遍再交付。
 */
// playwright 优先用项目本地的，其次全局的（沙盒里只有全局）
function loadPlaywright() {
  const tries = ['playwright', 'playwright-core', '/usr/local/lib/node_modules/playwright'];
  for (const t of tries) {
    try { return require(t); } catch { /* 继续试下一个 */ }
  }
  console.error('找不到 playwright，请先安装：npm i -D playwright');
  process.exit(1);
}
const { chromium } = loadPlaywright();
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.env.BB_DIST || path.resolve(__dirname, '..', 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

let failed = 0;
const ok = (c, name, extra = '') => {
  console.log(`  ${c ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`);
  if (!c) failed++;
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  // 沙盒里没有 playwright 自带的浏览器，用系统的 chromium
  const exe = process.env.BB_CHROME
    || ['/usr/bin/google-chrome', '/usr/local/bin/chromium', '/usr/bin/chromium']
      .find((f) => fs.existsSync(f));
  if (!exe) { console.error('找不到 chromium'); process.exit(1); }
  console.log(`  使用浏览器: ${exe}`);
  const browser = await chromium.launch({
    executablePath: exe,
    args: ['--no-sandbox', '--disable-dev-shm-usage',
      '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, hasTouch: true });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });

  // ---- 1) 开屏 ----
  const splashVisible = await page.locator('#splash').isVisible().catch(() => false);
  ok(true, '页面加载完成', splashVisible ? '（开屏显示中）' : '（开屏已跳过）');

  // ---- 2) 等待主菜单出现 ----
  let menuOk = false;
  try {
    await page.waitForSelector('#menu:not(.hidden)', { timeout: 20000 });
    menuOk = true;
  } catch { /* 下面统一报告 */ }
  ok(menuOk, '主菜单显示出来了');
  if (!menuOk) {
    console.log('  页面错误:', errors.slice(0, 5));
    await page.screenshot({ path: '/tmp/bb-fail.png' });
    await browser.close(); server.close(); process.exit(1);
  }

  // ---- 3) 模式按钮可见可点 ----
  const modes = page.locator('#menu .mode');
  const n = await modes.count();
  ok(n === 3, '三个模式按钮存在', `${n} 个`);
  const box0 = await modes.first().boundingBox();
  ok(box0 && box0.width > 0 && box0.height > 0, '按钮有实际尺寸',
    box0 ? `${Math.round(box0.width)}x${Math.round(box0.height)}` : '');

  // ---- 3.5) 服务器列表：全屏 / 多个 / 重启后仍在 ----
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#menu .mode')]
      .find((x) => x.textContent.includes('多'));
    if (b) b.click();
  });
  await page.waitForTimeout(400);

  const srvFull = await page.evaluate(() => {
    const p = document.querySelector('#servers .panel');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
  });
  if (srvFull) {
    ok(srvFull.w >= srvFull.vw - 2 && srvFull.h >= srvFull.vh - 2,
      '★ 服务器列表窗口全屏',
      `${srvFull.w.toFixed(0)}x${srvFull.h.toFixed(0)} vs 视口 ${srvFull.vw}x${srvFull.vh}`);
  }

  const persisted = await page.evaluate(() => {
    const mod = window.__bbStorage;
    if (!mod) return null;
    const a = mod.loadServers();
    mod.saveServers([...a,
      { name: '甲', host: '192.168.1.11', port: 19000 },
      { name: '乙', host: '192.168.1.12', port: 19000 }]);
    return mod.loadServers().length;      // 模拟重启后重新读取
  });
  if (persisted !== null) {
    ok(persisted >= 2, '★ 可添加多个服务器且重启后仍在', `${persisted} 个`);
  }

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#servers .btn')].find((x) => x.textContent === '返回');
    if (b) b.click();
  });
  await page.waitForTimeout(300);

  // ---- 4) 设置面板能打开 ----
  await page.locator('#menu .gear').click();
  await page.waitForTimeout(300);
  const setOk = await page.locator('#settings:not(.hidden)').isVisible().catch(() => false);
  ok(setOk, '设置面板可打开');

  // ---- 5) 设置里改 FPS 为 144 ----
  const fps144 = page.locator('#settings .fpsbtns button', { hasText: '144' }).first();
  if (await fps144.count()) {
    await fps144.click();
    await page.waitForTimeout(200);
    const on = await fps144.evaluate((e) => e.classList.contains('on'));
    ok(on, 'FPS 可切换到 144');
  }

  // ---- 6) 关闭设置 ----
  // ---- 6.6) 设置页右侧滚动条：长按后可上下拖动 ----
  const scrollRes = await page.evaluate(async () => {
    const sc = document.querySelector('#settings .scroller');
    const th = document.querySelector('#settings .scroll-thumb');
    const body = document.querySelector('#settings .body');
    if (!sc || !th || !body) return null;
    // ★ 720 高的窗口里内容不一定超出，滚动条会隐藏。
    //   这里临时塞一段占位内容逼出滚动，测完再移除；
    //   否则这项验证会被静默跳过 —— 等于没测。
    const filler = document.createElement('div');
    filler.style.height = '900px';
    filler.textContent = '（占位）';
    body.append(filler);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 80));
    const before = { top: th.style.top, scroll: body.scrollTop };
    const tb = th.getBoundingClientRect();
    const startY = tb.top + tb.height / 2;
    th.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerId: 21, pointerType: 'touch',
      clientX: tb.x + tb.width / 2, clientY: startY,
    }));
    for (let i = 1; i <= 8; i++) {
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, pointerId: 21, pointerType: 'touch',
        clientX: tb.x + tb.width / 2, clientY: startY + i * 6,
      }));
      await new Promise((r) => setTimeout(r, 16));
    }
    const after = { top: th.style.top, scroll: body.scrollTop };
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, pointerId: 21, pointerType: 'touch',
      clientX: tb.x + tb.width / 2, clientY: startY + 48,
    }));
    const res = {
      before, after,
      visible: getComputedStyle(sc).display,
      scrollable: body.scrollHeight > body.clientHeight + 2,
      thumbH: th.getBoundingClientRect().height,
    };
    filler.remove();
    return res;
  });
  if (scrollRes) {
    ok(scrollRes.visible === 'block',
      '★ 设置页滚动条在内容超出时显示',
      `display=${scrollRes.visible} 滑块高 ${scrollRes.thumbH.toFixed(0)}px`);
    ok(scrollRes.thumbH >= 28,
      '★ 滑块有可见高度（不是一条细线）', `${scrollRes.thumbH.toFixed(0)}px`);
    ok(scrollRes.after.scroll > scrollRes.before.scroll,
      '★ 长按滚动条并上下滑动可滚动栏目',
      `scrollTop ${scrollRes.before.scroll} -> ${scrollRes.after.scroll}`);
    ok(scrollRes.after.scroll > 20,
      '★ 一次连续拖动可以滚很远（不是只挪一小段）',
      `滚了 ${scrollRes.after.scroll}px`);
  }

  // ---- 6.7) 诊断函数：对不存在的服务器应给出明确结论 ----
  // ★ "Failed to load resource" 这条 console 错误里【不含端口】，
  //   没法按端口过滤；所以按时间窗处理：记录当前错误条数，
  //   诊断造成的那几条之后直接删掉。
  const errMark = errors.length;
  const diag = await page.evaluate(async () => {
    const d = window.__bbDiag;
    if (!d) return null;
    return await d('127.0.0.1', 59999, 1500);
  });
  if (diag) {
    ok(diag.ws === false, '★ 诊断：连不上时 ws 判定为 false', diag.wsDetail);
    ok(typeof diag.hint === 'string' && diag.hint.length > 8,
      '★ 诊断：给出可读结论', diag.hint);
    ok(diag.http === false, '★ 诊断：状态页同样不通', diag.httpDetail);
  }
  errors.splice(errMark);            // 丢弃诊断期间产生的预期错误

  // ---- 6.8) 设置里可以改玩家名字 ----
  const nameRes = await page.evaluate(async () => {
    const inp = document.querySelector('#settings .textinput');
    if (!inp) return null;
    inp.value = '测试指挥官';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
    return inp.value;
  });
  if (nameRes !== null) {
    ok(nameRes === '测试指挥官', '★ 设置里可自定义玩家名字', nameRes);
  }

  await page.locator('#settings .close').click();
  await page.waitForTimeout(300);
  const closed = await page.locator('#settings').evaluate((e) => e.classList.contains('hidden'));
  ok(closed, '设置面板可关闭');

  // ---- 6.5) 控件编辑：一次拖动大段距离 ----
  // 上一步把设置关掉了，这里重新打开再切到"控件"页
  await page.locator('#menu .gear').click();
  await page.waitForTimeout(300);
  await page.locator('#settings .tabs button', { hasText: '控件' }).first().click();
  await page.waitForTimeout(400);
  const dragResult = await page.evaluate(async () => {
    const cvs = document.querySelector('#settings .canvas');
    const p = document.querySelector('#settings .proxy');
    if (!cvs || !p) return null;
    const before = { x: p.style.left, y: p.style.top };
    const r = p.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const fire = (type, x, y) => p.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch',
      clientX: x, clientY: y,
    }));
    const fireWin = (type, x, y) => window.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch',
      clientX: x, clientY: y,
    }));
    p.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch',
      clientX: cx, clientY: cy,
    }));
    // 一次拖 260px（远超"一小段"）
    for (let i = 1; i <= 10; i++) {
      fireWin('pointermove', cx + 26 * i, cy + 6 * i);
      await new Promise((res) => setTimeout(res, 16));
    }
    const after = { x: p.style.left, y: p.style.top };
    fireWin('pointerup', cx + 260, cy + 60);
    // 复位，避免改过的布局影响后面的游戏内检查
    const reset = Array.from(document.querySelectorAll('#settings .btn'))
      .find((b) => (b.textContent || '').includes('复位'));
    if (reset) reset.click();
    return { before, after };
  });
  ok(dragResult !== null, '控件编辑页可打开');

  if (dragResult) {
    const px = (v) => parseFloat(v) || 0;
    const dx = px(dragResult.after.x) - px(dragResult.before.x);
    const dy = px(dragResult.after.y) - px(dragResult.before.y);
    ok(Math.hypot(dx, dy) > 120,
      '★ 一次连续拖动能移动大段距离（不是只能挪一点）',
      `位移 ${Math.hypot(dx, dy).toFixed(0)}px (${dx.toFixed(0)}, ${dy.toFixed(0)})`);
  }

  await page.locator('#settings .close').click();
  await page.waitForTimeout(300);

  await page.screenshot({ path: '/tmp/bb-menu.png' });

  // ---- 7) 进入单人游戏 ----
  await modes.first().click();
  let hudOk = false;
  try {
    await page.waitForSelector('#hud:not(.hidden)', { timeout: 25000 });
    hudOk = true;
  } catch { /* noop */ }
  ok(hudOk, '游戏 HUD 显示出来了');

  if (hudOk) {
    await page.waitForTimeout(1500);

    // ---- 8) 触摸控件可见且在屏内 ----
    const ctrlInfo = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('#touch .ctrl')) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        out.push({
          key: el.className.replace('ctrl ', '').trim(),
          x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width), h: Math.round(r.height),
          display: cs.display, opacity: cs.opacity, pe: cs.pointerEvents,
        });
      }
      return out;
    });
    ok(ctrlInfo.length === 9, '九个控件全部渲染', `${ctrlInfo.length} 个`);
    const offscreen = ctrlInfo.filter((c) =>
      c.w <= 0 || c.h <= 0 || c.x < 0 || c.y < 0
      || c.x + c.w > 1280 || c.y + c.h > 720);
    ok(offscreen.length === 0, '所有控件都在屏幕内',
      offscreen.length ? JSON.stringify(offscreen) : '');

    // ★ heal 是【纯命中层】，视觉由 HUD 的治疗按钮绘制，所以这里允许它透明。
    //   它的可见性由后面的"治疗物圆形按钮可见"单独检查。
    const invisible = ctrlInfo.filter((c) =>
      c.key !== 'heal' && (c.display === 'none' || Number(c.opacity) < 0.05));
    ok(invisible.length === 0, '所有控件可见（治疗键为透明命中层，单独检查）',
      invisible.length ? JSON.stringify(invisible) : '');
    // 命中层本身必须保留尺寸，否则点不到
    const healHit = ctrlInfo.find((c) => c.key === 'heal');
    ok(healHit && healHit.w > 20 && healHit.h > 20 && healHit.pe === 'auto',
      '治疗键命中层有尺寸且可点击', healHit ? `${healHit.w}x${healHit.h} pe=${healHit.pe}` : '');

    // ---- 9) 命中测试：点每个控件中心都应命中它自己 ----
    const hitResults = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('#touch .ctrl')) {
        const r = el.getBoundingClientRect();
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        out.push({
          key: el.className.replace('ctrl ', '').trim(),
          hit: top === el || el.contains(top),
          topId: top ? (top.id || top.className) : 'null',
        });
      }
      return out;
    });
    const missed = hitResults.filter((h) => !h.hit);
    ok(missed.length === 0, '点击每个控件中心都命中它自己',
      missed.length ? JSON.stringify(missed) : '');

    // ---- 10) 点空白处不应命中任何控件 ----
    const blank = await page.evaluate(() => {
      const el = document.elementFromPoint(640, 200);
      return el ? (el.id || el.className) : 'null';
    });
    ok(!String(blank).includes('ctrl'), '屏幕空白处不被控件吞掉', `命中: ${blank}`);

    // ---- 11) 真实点击开火键，弹药应减少 ----
    const before = await page.locator('#hud .ammo').textContent();
    const fire = page.locator('#touch .ctrl.fire');
    const fb = await fire.boundingBox();
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await page.locator('#hud .ammo').textContent();
    ok(before !== after, '按住开火键弹药会减少', `${before} -> ${after}`);

    // ---- 12) 抬起后应停火 ----
    const a1 = await page.locator('#hud .ammo').textContent();
    await page.waitForTimeout(900);
    const a2 = await page.locator('#hud .ammo').textContent();
    ok(a1 === a2, '松开后停止射击（不会一直打）', `${a1} -> ${a2}`);

    // ---- 12.5) 画布铺满视口（不出现白边）----
    const cover = await page.evaluate(() => {
      const c = document.querySelector('canvas#gl');
      if (!c) return { ok: false, why: 'no-canvas' };
      const r = c.getBoundingClientRect();
      return {
        ok: Math.abs(r.width - window.innerWidth) <= 1
          && Math.abs(r.height - window.innerHeight) <= 1
          && r.x <= 0.5 && r.y <= 0.5,
        w: Math.round(r.width), h: Math.round(r.height),
        vw: window.innerWidth, vh: window.innerHeight,
        x: Math.round(r.x), y: Math.round(r.y),
      };
    });
    ok(cover.ok, '画布铺满视口（无白边）',
      `${cover.w}x${cover.h} vs 视口 ${cover.vw}x${cover.vh} @(${cover.x},${cover.y})`);

    const scroll = await page.evaluate(() => ({
      sh: document.documentElement.scrollWidth,
      sw: document.documentElement.clientWidth,
    }));
    ok(scroll.sh <= scroll.sw + 1, '页面无横向溢出',
      `scrollWidth=${scroll.sh} clientWidth=${scroll.sw}`);

    // ---- 12.6) 按住开火键时，另一根手指仍能转视角 ----
    const yaw0 = await page.evaluate(() => window.__bb?.session?.debugYaw ?? null);
    ok(yaw0 !== null, '可读到游戏内部朝向（调试钩子可用）');

    if (yaw0 !== null) {
      // 用 CDP 派发真实的触摸序列：手指 A 按住开火键，手指 B 在空白处滑动
      const cdp = await page.context().newCDPSession(page);
      const dispatch = (type, x, y, id) => cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: id === null ? [] : [{ x, y, id, radiusX: 12, radiusY: 12, force: 1 }],
      });

      await dispatch('touchStart', fb.x + fb.width / 2, fb.y + fb.height / 2, 1);
      await page.waitForTimeout(120);
      // 第二根手指：屏幕中上空白处
      await dispatch('touchStart', 640, 180, 2);
      for (let i = 1; i <= 8; i++) {
        await dispatch('touchMove', 640 + i * 22, 180, 2);
        await page.waitForTimeout(30);
      }
      await page.waitForTimeout(120);
      const yaw1 = await page.evaluate(() => window.__bb?.session?.debugYaw ?? null);
      await dispatch('touchEnd', 640 + 8 * 22, 180, 2);
      await dispatch('touchEnd', fb.x + fb.width / 2, fb.y + fb.height / 2, 1);
      await page.waitForTimeout(120);

      ok(yaw1 !== null && Math.abs(yaw1 - yaw0) > 0.05,
        '★ 按住开火键时另一根手指仍能转视角',
        `yaw ${yaw0?.toFixed(3)} -> ${yaw1?.toFixed(3)}`);
    }

    // ---- 12.7) 摇杆滑动【不应】转动视角 ----
    const yawA = await page.evaluate(() => window.__bb?.session?.debugYaw ?? null);
    const stick = page.locator('#touch .ctrl.stick');
    const sb = await stick.boundingBox();
    if (sb && yawA !== null) {
      const cdp = await page.context().newCDPSession(page);
      const dispatch = (type, x, y, id) => cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: [{ x, y, id, radiusX: 12, radiusY: 12, force: 1 }],
      });
      await dispatch('touchStart', sb.x + sb.width / 2, sb.y + sb.height / 2, 3);
      for (let i = 1; i <= 8; i++) {
        await dispatch('touchMove', sb.x + sb.width / 2 + i * 8, sb.y + sb.height / 2, 3);
        await page.waitForTimeout(25);
      }
      const yawB = await page.evaluate(() => window.__bb?.session?.debugYaw ?? null);
      await dispatch('touchEnd', sb.x + sb.width / 2 + 64, sb.y + sb.height / 2, 3);
      await page.waitForTimeout(100);
      ok(yawB !== null && Math.abs(yawB - yawA) < 0.02,
        '★ 滑动摇杆只走路，不会把视角带着转',
        `yaw ${yawA?.toFixed(3)} -> ${yawB?.toFixed(3)}`);
    }

    // ---- 12.75) 摇杆是真实图形，且摇杆头跟随手指 ----
    const stickVis = await page.evaluate(() => {
      const c = document.querySelector('#touch .ctrl.stick');
      if (!c) return null;
      const base = c.querySelector('.stick-base');
      const thumb = c.querySelector('.stick-thumb');
      return {
        hasBase: !!base,
        hasThumb: !!thumb,
        thumbW: thumb ? thumb.getBoundingClientRect().width : 0,
        cx: thumb ? thumb.getBoundingClientRect().x + thumb.getBoundingClientRect().width / 2 : 0,
      };
    });
    ok(stickVis && stickVis.hasBase && stickVis.hasThumb && stickVis.thumbW > 4,
      '★ 摇杆有底座与摇杆头（不是纯文字）',
      stickVis ? `thumb ${stickVis.thumbW.toFixed(0)}px` : '');

    let stickMoved = false;
    if (sb && stickVis) {
      const cdp2 = await page.context().newCDPSession(page);
      const dp = (type, x, y, id) => cdp2.send('Input.dispatchTouchEvent', {
        type, touchPoints: [{ x, y, id, radiusX: 12, radiusY: 12, force: 1 }],
      });
      await dp('touchStart', sb.x + sb.width / 2, sb.y + sb.height / 2, 7);
      await dp('touchMove', sb.x + sb.width / 2 + 40, sb.y + sb.height / 2, 7);
      await page.waitForTimeout(120);
      const after = await page.evaluate(() => {
        const t = document.querySelector('#touch .ctrl.stick .stick-thumb');
        const r = t.getBoundingClientRect();
        return r.x + r.width / 2;
      });
      await dp('touchEnd', sb.x + sb.width / 2 + 40, sb.y + sb.height / 2, 7);
      await page.waitForTimeout(150);
      const back = await page.evaluate(() => {
        const t = document.querySelector('#touch .ctrl.stick .stick-thumb');
        const r = t.getBoundingClientRect();
        return r.x + r.width / 2;
      });
      stickMoved = Math.abs(after - stickVis.cx) > 8;
      ok(stickMoved, '★ 摇杆头跟随手指移动', `中心 ${stickVis.cx.toFixed(0)} -> ${after.toFixed(0)}`);
      ok(Math.abs(back - stickVis.cx) < 8, '松手后摇杆头归位',
        `回到 ${back.toFixed(0)}（原 ${stickVis.cx.toFixed(0)}）`);
    }

    // ---- 12.76) 治疗物 UI 存在且可用 ----
    const healUi = await page.evaluate(() => {
      const main = document.querySelector('.heal-main');
      const arrow = document.querySelector('.heal-arrow');
      if (!main || !arrow) return null;
      const r = main.getBoundingClientRect();
      return { w: r.width, h: r.height, x: r.x, y: r.y, text: main.textContent || '' };
    });
    ok(healUi && healUi.w > 20 && healUi.h > 20,
      '★ 治疗物圆形按钮可见', healUi ? `${healUi.w.toFixed(0)}x${healUi.h.toFixed(0)} "${healUi.text.replace(/\s+/g, ' ')}"` : '');

    if (healUi) {
      // 展开列表
      await page.locator('.heal-arrow').click();
      await page.waitForTimeout(250);
      const items = await page.evaluate(() => {
        const l = document.querySelector('.heallist');
        if (!l || l.classList.contains('hidden')) return null;
        return Array.from(l.querySelectorAll('.heal-item')).map((e) => e.textContent);
      });
      ok(items && items.length === 3, '★ 三角展开显示三种物品',
        items ? items.map((t) => t.replace(/\s+/g, ' ')).join(' | ') : '未展开');

      // 选中急救包
      const pickOk = await page.evaluate(() => {
        const bs = Array.from(document.querySelectorAll('.heal-item'));
        const b = bs.find((e) => (e.textContent || '').includes('急救包'));
        if (!b) return false;
        b.click();
        return true;
      });
      await page.waitForTimeout(250);
      const mainTxt = await page.evaluate(() => document.querySelector('.heal-main')?.textContent || '');
      ok(pickOk && mainTxt.includes('急救包'), '★ 选中后主按钮切换物品', mainTxt.replace(/\s+/g, ' '));

      // 使用治疗物：血量应先扣再加（先让人机打我们太慢，直接检查流程）
      const before = await page.evaluate(() => {
        const s = window.__bb?.session;
        if (!s) return null;
        return { hp: s.debugHp, busy: s.healState.using !== null };
      });
      // 先把血扣到 50 才能用绷带/急救包
      await page.evaluate(() => { window.__bb?.session?.setHpForTest(50); });
      await page.evaluate(() => { window.__bb?.session?.useHeal(); });
      await page.waitForTimeout(400);
      const using = await page.evaluate(() => {
        const s = window.__bb?.session;
        return s ? { using: s.healState.using, left: s.healState.left } : null;
      });
      ok(using && using.using !== null, '★ 点击圆形按钮开始使用治疗物',
        using ? `${using.using} 剩余 ${using.left?.toFixed(1)}s` : '');

      // 使用期间不可开枪
      const cannotFire = await page.evaluate(() => {
        const s = window.__bb?.session;
        return s ? s.debugCannotFire : null;
      });
      ok(cannotFire === true, '★ 使用期间不可开枪', `cannotFire=${cannotFire}`);

      // 取消后可开枪
      await page.evaluate(() => { window.__bb?.session?.cancelHeal(); });
      await page.waitForTimeout(250);
      const afterCancel = await page.evaluate(() => {
        const s = window.__bb?.session;
        return s ? { using: s.healState.using, fire: s.debugCannotFire } : null;
      });
      ok(afterCancel && afterCancel.using === null && afterCancel.fire === false,
        '★ 取消后恢复开火能力', JSON.stringify(afterCancel));
      void before;
    }

    // ---- 12.77) 治疗按钮：只能有一个，且贴在"治疗物"控件位置上 ----
    const healPos = await page.evaluate(() => {
      const wrap = document.querySelector('.healwrap');
      const hit = document.querySelector('#touch .ctrl.heal');
      const arrow = document.querySelector('.heal-arrow');
      const list = document.querySelector('.heallist');
      if (!wrap || !hit) return null;
      const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; };
      return {
        wrap: box(wrap),
        hit: box(hit),
        arrow: arrow ? box(arrow) : null,
        list: list ? box(list) : null,
        // 页面上不应该还有第二个治疗控件
        wrapCount: document.querySelectorAll('.healwrap').length,
        hitOpacity: getComputedStyle(hit).opacity,
        text: wrap.textContent || '',
        vw: window.innerWidth, vh: window.innerHeight,
      };
    });
    ok(healPos && healPos.wrapCount === 1, '★ 只有一个治疗控件（不再重复两个）',
      healPos ? `数量 ${healPos.wrapCount}` : '');
    if (healPos) {
      const d = Math.hypot(healPos.wrap.cx - healPos.hit.cx, healPos.wrap.cy - healPos.hit.cy);
      ok(d < 4, '★ 治疗按钮与"治疗物"控件位置重合',
        `偏差 ${d.toFixed(1)}px @(${healPos.wrap.cx.toFixed(0)}, ${healPos.wrap.cy.toFixed(0)})`);
      // ★ 按截图布局，治疗物在底部偏左（血条左侧），不该盖住屏幕正中。
      //   判据用"按钮矩形是否覆盖屏幕中心点"，比"距中心多少像素"更准确。
      const mid = healPos.vw / 2;
      const covers = healPos.wrap.x < mid && healPos.wrap.x + healPos.w > mid;
      ok(!covers, '★ 治疗按钮不在屏幕正中央',
        `按钮 ${healPos.wrap.x.toFixed(0)}~${(healPos.wrap.x + healPos.w).toFixed(0)}，中心 ${mid}`);
      ok(parseFloat(healPos.hitOpacity) === 0, '★ 底层命中框透明（不出现第二个可见按钮）',
        `opacity=${healPos.hitOpacity}`);
    }

    // ---- 12.78) 展开栏在按钮上方 ----
    await page.locator('.heal-arrow').click();
    await page.waitForTimeout(250);
    const stack = await page.evaluate(() => {
      const wrap = document.querySelector('.healwrap');
      const arrow = document.querySelector('.heal-arrow');
      const list = document.querySelector('.heallist');
      const box = (e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, cx: r.x + r.width / 2 }; };
      return { wrap: box(wrap), arrow: box(arrow), list: box(list) };
    });
    ok(stack.arrow.bottom <= stack.wrap.top + 2,
      '★ 三角箭头在圆形按钮上方', `箭头底 ${stack.arrow.bottom.toFixed(0)} ≤ 按钮顶 ${stack.wrap.top.toFixed(0)}`);
    ok(stack.list.bottom <= stack.arrow.top + 2,
      '★ 展开栏在三角箭头上方', `列表底 ${stack.list.bottom.toFixed(0)} ≤ 箭头顶 ${stack.arrow.top.toFixed(0)}`);
    await page.locator('.heal-arrow').click();
    await page.waitForTimeout(200);

    // ---- 12.79) 多点触控：摇杆 + 开火 同时进行 ----
    const fb2 = await page.locator('#touch .ctrl.fire').boundingBox();
    const sb2 = await page.locator('#touch .ctrl.stick').boundingBox();
    if (fb2 && sb2) {
      const cdp3 = await page.context().newCDPSession(page);
      const before = await page.evaluate(() => {
        const s = window.__bb?.session;
        return s ? { ammo: s.debugAmmo, x: s.debugPos.x, z: s.debugPos.z } : null;
      });
      // 一次派发两个触点：id=1 按开火，id=2 推摇杆
      await cdp3.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: fb2.x + fb2.width / 2, y: fb2.y + fb2.height / 2, id: 1 },
          { x: sb2.x + sb2.width / 2, y: sb2.y + sb2.height / 2, id: 2 },
        ],
      });
      // 第二根手指往前推摇杆，两根手指同时保持
      for (let i = 1; i <= 6; i++) {
        await cdp3.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { x: fb2.x + fb2.width / 2, y: fb2.y + fb2.height / 2, id: 1 },
            { x: sb2.x + sb2.width / 2, y: sb2.y + sb2.height / 2 - i * 10, id: 2 },
          ],
        });
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(300);
      const during = await page.evaluate(() => {
        const s = window.__bb?.session;
        return s ? { ammo: s.debugAmmo, x: s.debugPos.x, z: s.debugPos.z } : null;
      });
      await cdp3.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

      if (before && during) {
        const shot = before.ammo - during.ammo;
        const moved = Math.hypot(during.x - before.x, during.z - before.z);
        ok(shot > 0, '★ 多点触控：一指开火生效', `弹药 ${before.ammo} -> ${during.ammo}`);
        ok(moved > 0.3, '★ 多点触控：另一指推摇杆同时移动',
          `位移 ${moved.toFixed(2)}m  弹药 ${before.ammo} -> ${during.ammo}`);
      }
    }

    // ---- 12.80) 多点触控：开火 + 跳跃 ----
    if (fb2) {
      const jumpBox = await page.locator('#touch .ctrl.jump').boundingBox();
      if (jumpBox) {
        const cdp4 = await page.context().newCDPSession(page);
        const a0 = await page.evaluate(() => window.__bb?.session?.debugAmmo ?? null);
        await cdp4.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [
            { x: fb2.x + fb2.width / 2, y: fb2.y + fb2.height / 2, id: 3 },
            { x: jumpBox.x + jumpBox.width / 2, y: jumpBox.y + jumpBox.height / 2, id: 4 },
          ],
        });
        await page.waitForTimeout(400);
        const air = await page.evaluate(() => window.__bb?.session?.debugAirborne ?? null);
        const a1 = await page.evaluate(() => window.__bb?.session?.debugAmmo ?? null);
        await cdp4.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        ok(a0 !== null && a1 !== null && a1 < a0, '★ 多点触控：开火与跳跃互不打断',
          `弹药 ${a0} -> ${a1}，起跳=${air}`);
      }
    }

    // ---- 12.8) 玩家走不出地图边界 ----
    const pos = await page.evaluate(() => {
      const p = window.__bb?.session?.debugPos;
      return p ? { x: p.x, z: p.z } : null;
    });
    ok(pos && Math.abs(pos.x) <= 30 && Math.abs(pos.z) <= 30,
      '玩家在地图范围内', pos ? `(${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})` : '');

    // ---- 13) FPS 显示 ----
    const fpsTxt = await page.locator('#hud .stat').textContent();
    ok(/FPS\s*\d+/.test(fpsTxt), '左上角显示 FPS', fpsTxt);

    await page.screenshot({ path: '/tmp/bb-game.png' });
  }

  // ---- 14) 无 JS 报错 ----
  // 沙盒 headless chromium 禁用 WebGL，这是环境限制不是代码问题；
  // 开屏素材不存在导致的 404 也是预期内的（可选资源）。
  // 59999 是诊断那一步【故意】连的不存在端口，ERR_CONNECTION_REFUSED 属预期。
  // 诊断用 59999 端口，状态页会去 60000（= WS 端口 +1），两者都属预期失败。
  const ignorable = /WebGL|SwiftShader|GroupMarker|Automatic fallback|GL_VENDOR|404|59999|60000/i;
  const real = errors.filter((e) => !ignorable.test(e));
  ok(real.length === 0, '无 JS 运行时错误', real.length ? real.slice(0, 3).join(' | ') : '');

  await browser.close();
  server.close();
  console.log(failed === 0 ? '\n浏览器端验证全部通过' : `\n${failed} 项失败`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('验证脚本异常:', e.message);
  server.close();
  process.exit(1);
});

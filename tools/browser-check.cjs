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
  await page.locator('#settings .close').click();
  await page.waitForTimeout(300);
  const closed = await page.locator('#settings').evaluate((e) => e.classList.contains('hidden'));
  ok(closed, '设置面板可关闭');

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

    const invisible = ctrlInfo.filter((c) => c.display === 'none' || Number(c.opacity) < 0.05);
    ok(invisible.length === 0, '所有控件可见（非零尺寸、非透明）');

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

    // ---- 13) FPS 显示 ----
    const fpsTxt = await page.locator('#hud .stat').textContent();
    ok(/FPS\s*\d+/.test(fpsTxt), '左上角显示 FPS', fpsTxt);

    await page.screenshot({ path: '/tmp/bb-game.png' });
  }

  // ---- 14) 无 JS 报错 ----
  // 沙盒 headless chromium 禁用 WebGL，这是环境限制不是代码问题；
  // 开屏素材不存在导致的 404 也是预期内的（可选资源）。
  const ignorable = /WebGL|SwiftShader|GroupMarker|Automatic fallback|GL_VENDOR|404/i;
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

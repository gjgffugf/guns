/**
 * 调整 Android 工程：横屏锁定、沉浸全屏、硬件加速。
 * 用法：node tools/setup-android.mjs [android目录]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ANDROID = process.argv[2] || 'android';
const MANIFEST = path.join(ANDROID, 'app', 'src', 'main', 'AndroidManifest.xml');

if (!existsSync(MANIFEST)) {
  console.error(`找不到 ${MANIFEST}，请先执行 cap sync`);
  process.exit(1);
}

let m = readFileSync(MANIFEST, 'utf8');
let changed = false;

// ---- 1) 主 Activity 锁横屏 ----
// Capacitor 生成的 MainActivity 一般不指定 screenOrientation，这里补上。
const actRe = /<activity\b[^>]*android:name="\.MainActivity"[^>]*>/;
const am = m.match(actRe);
if (am) {
  if (!am[0].includes('screenOrientation')) {
    const patched = am[0].replace(
      /android:name="\.MainActivity"/,
      'android:name=".MainActivity"\n            android:screenOrientation="sensorLandscape"',
    );
    m = m.replace(actRe, patched);
    changed = true;
    console.log('已设置横屏 sensorLandscape');
  }
  // 键盘/屏幕方向变化时不重建 Activity，避免游戏中旋转导致重启
  if (!am[0].includes('configChanges')) {
    const patched = m.match(/<activity\b[^>]*android:name="\.MainActivity"[^>]*>/)[0]
      .replace(/(android:screenOrientation="[^"]*")/, '$1\n            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|smallestScreenSize|density|uiMode"');
    m = m.replace(/<activity\b[^>]*android:name="\.MainActivity"[^>]*>/, patched);
    changed = true;
    console.log('已设置 configChanges（防止旋转重启）');
  }
} else {
  console.warn('警告：没找到 .MainActivity，跳过横屏设置');
}

// ---- 2) 硬件加速 ----
if (!m.includes('android:hardwareAccelerated')) {
  const appRe = /<application\b[^>]*>/;
  const apm = m.match(appRe);
  if (apm) {
    m = m.replace(appRe, apm[0].replace(/>$/, ' android:hardwareAccelerated="true">'));
    changed = true;
    console.log('已开启硬件加速');
  }
}

// ---- 3) 网络权限（多人联机需要）----
if (!m.includes('android.permission.INTERNET')) {
  m = m.replace(
    /(<manifest[^>]*>)/,
    '$1\n    <uses-permission android:name="android.permission.INTERNET" />\n'
    + '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
  );
  changed = true;
  console.log('已添加网络权限');
}

if (changed) {
  writeFileSync(MANIFEST, m);
  console.log('AndroidManifest.xml 已更新');
} else {
  console.log('AndroidManifest.xml 无需改动');
}

// ---- 4) 主题：全屏 / 透明状态栏 / 延伸到刘海区 ----
const STYLES = path.join(ANDROID, 'app', 'src', 'main', 'res', 'values', 'styles.xml');
if (existsSync(STYLES)) {
  let st = readFileSync(STYLES, 'utf8');
  const items = [
    '        <item name="android:windowFullscreen">true</item>',
    '        <item name="android:windowTranslucentStatus">true</item>',
    '        <item name="android:windowTranslucentNavigation">true</item>',
    '        <item name="android:statusBarColor">@android:color/transparent</item>',
    '        <item name="android:navigationBarColor">@android:color/transparent</item>',
    '        <item name="android:windowBackground">@android:color/black</item>',
    // 让内容延伸到挖孔/刘海区域，否则那一侧会留出一条白边
    '        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>',
    '        <item name="android:windowActionBar">false</item>',
    '        <item name="android:windowNoTitle">true</item>',
  ];
  let added = 0;
  // 逐个 <style> 块补齐（Capacitor 有多个 AppTheme 变体）
  st = st.replace(/<style([^>]*)>([\s\S]*?)<\/style>/g, (full, attrs, inner) => {
    let body = inner;
    let local = 0;
    for (const it of items) {
      const name = it.match(/name="([^"]+)"/)[1];
      if (body.includes(name)) continue;
      body += `\n${it}`;
      local++;
    }
    added += local;
    return `<style${attrs}>${body}</style>`;
  });
  if (added > 0) {
    writeFileSync(STYLES, st);
    console.log(`主题已补齐全屏项（${added} 处）`);
  } else {
    console.log('主题已含全屏项，跳过');
  }
} else {
  console.warn('警告：没找到 styles.xml');
}

// ---- 5) MainActivity：运行时强制沉浸式（兼容新旧 API）----
const JAVA_DIR = path.join(ANDROID, 'app', 'src', 'main', 'java');
function findMainActivity(dir) {
  if (!existsSync(dir)) return null;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const f = findMainActivity(p);
      if (f) return f;
    } else if (e.name === 'MainActivity.java') return p;
  }
  return null;
}
const MAIN = findMainActivity(JAVA_DIR);
if (MAIN) {
  let j = readFileSync(MAIN, 'utf8');
  if (!j.includes('BB_FULLSCREEN')) {
    j = j.replace(
      /^(import [^;]+;\s*)$/m,
      '$1\nimport android.os.Build;\nimport android.os.Bundle;\nimport android.view.View;\nimport android.view.WindowManager;',
    );
    const inject = `
    // BB_FULLSCREEN: 强制沉浸式，隐藏状态栏与导航栏
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.view.WindowInsetsController ic = getWindow().getInsetsController();
                if (ic != null) {
                    ic.hide(android.view.WindowInsets.Type.statusBars()
                          | android.view.WindowInsets.Type.navigationBars());
                    ic.setSystemBarsBehavior(
                        android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                  | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                  | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                  | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
            }
        } catch (Exception ignored) { }
    }
`;
    // 插到类体第一个 { 之后
    const at = j.indexOf('{', j.indexOf('public class MainActivity'));
    if (at > 0) j = j.slice(0, at + 1) + inject + j.slice(at + 1);
    else j = j.replace(/\}\s*$/, inject + '}\n');
    writeFileSync(MAIN, j);
    console.log('MainActivity 已注入沉浸式代码');
  } else {
    console.log('MainActivity 已含沉浸式代码，跳过');
  }
} else {
  console.warn('警告：没找到 MainActivity.java');
}

// ---- 6) 再切回前台时重新隐藏（用户划出状态栏后回来）----
if (MAIN) {
  let j = readFileSync(MAIN, 'utf8');
  if (!j.includes('onWindowFocusChanged')) {
    j = j.replace(
      /\n\}\s*$/,
      `
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    android.view.WindowInsetsController ic = getWindow().getInsetsController();
                    if (ic != null) {
                        ic.hide(android.view.WindowInsets.Type.statusBars()
                              | android.view.WindowInsets.Type.navigationBars());
                    }
                } else {
                    getWindow().getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_FULLSCREEN
                      | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                      | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                      | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                      | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                      | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
                }
            } catch (Exception ignored) { }
        }
    }
}
`,
    );
    writeFileSync(MAIN, j);
    console.log('MainActivity 已加入焦点变化时重新隐藏');
  }
}

// ---- 自检 ----
const finalM = readFileSync(MANIFEST, 'utf8');
if (!finalM.includes('sensorLandscape')) {
  console.error('自检失败：未设置横屏');
  process.exit(1);
}
if (!finalM.includes('android.permission.INTERNET')) {
  console.error('自检失败：缺少网络权限');
  process.exit(1);
}
if (existsSync(STYLES)) {
  const st = readFileSync(STYLES, 'utf8');
  if (!st.includes('windowLayoutInDisplayCutoutMode')) {
    console.error('自检失败：未设置刘海区延伸（会留白边）');
    process.exit(1);
  }
}
if (MAIN) {
  const j = readFileSync(MAIN, 'utf8');
  if (!j.includes('BB_FULLSCREEN')) {
    console.error('自检失败：MainActivity 未注入沉浸式代码');
    process.exit(1);
  }
}
console.log('自检通过：横屏 + 全屏沉浸 + 刘海延伸 + 网络权限 + 硬件加速');

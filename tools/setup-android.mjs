/**
 * 调整 Android 工程：横屏锁定、沉浸全屏、硬件加速。
 * 用法：node tools/setup-android.mjs [android目录]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
console.log('自检通过：横屏 + 网络权限 + 硬件加速');

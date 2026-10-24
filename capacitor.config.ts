import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'xfan.games.gun',
  appName: '破绷战场',
  webDir: 'dist',
  // 横屏为主
  android: {
    allowMixedContent: true,
    // 隐藏式输入法兼容，避免输入框弹出时界面跳动
    webContentsDebuggingEnabled: false,
  },
  server: {
    // 纯本地资源，不使用远程 dev server
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: { launchAutoHide: false },
  },
};

export default config;

# 破绷战场 · BreakBind Battlefield

包名 `xfan.games.gun` · 横屏 · v0.2.0

**技术栈：TypeScript + Three.js + Vite + Capacitor。**
服务器是纯 Node.js（零第三方依赖）。

> 本项目从 Godot 迁移而来。迁移的根本原因：原方案无法在本地做真机验证，
> 每个 bug 都要靠"猜—改—你构建—再报错"的循环推进。换成 Web 技术栈后，
> **所有核心逻辑都能在本地真跑一遍再交付**。

---

## 一、为什么换成 Web 技术栈

| | Godot（旧） | Web + Capacitor（现） |
|---|---|---|
| 语法校验 | 靠自写的正则检查器，**查不出真实编译错误** | `tsc --noEmit`，严格模式，真实类型检查 |
| 逻辑验证 | 下载不到引擎，**无法运行** | 53 个单元测试在 node 里真跑 |
| 界面验证 | 只能靠你构建后反馈 | **Playwright + 真实 Chrome，18 项端到端验证** |
| 坐标系 | CanvasLayer 变换矩阵，布局与命中共 6 类坑 | DOM 布局与 `clientX/Y` 天然同坐标系，**架构上消除** |
| 视频格式 | 仅支持 Ogg Theora | 浏览器原生 mp4 / H.264 |
| 服务器 | Python 标准库 | Node.js，Termux 直接跑 |

---

## 二、本地开发

```bash
npm install
npm run dev        # 浏览器打开 http://localhost:5173
```

## 三、校验（提交前请跑一遍）

```bash
npm run verify
```

它会依次做 5 件事，**任何一步失败都会中断**：

| 步骤 | 命令 | 做什么 |
|---|---|---|
| 1 类型检查 | `npm run typecheck` | TypeScript 严格模式，23 个文件 |
| 2 单元测试 | `npm run test` | 53 个测试，覆盖坐标系 / 移动 / 武器 / 人机 / 命中 / FPS |
| 3 打包 | `npm run build` | 产出 `dist/` |
| 4 服务端 | `npm run verify:server` | 真起一个 UDP 服务器，验证 join/ping/state/info |
| 5 浏览器 | `npm run verify:browser` | 真实 Chrome，验证界面与控件 |

第 5 步会自动寻找系统 Chrome（`/usr/bin/google-chrome` 等），
找不到时可用 `BB_CHROME=/path/to/chrome` 指定。

---

## 四、构建 APK

推到 GitHub 即可，Actions 会自动出包。

```
.github/workflows/build.yml
  ├── verify    类型检查 + 单元测试
  ├── browser   真实浏览器端到端验证
  └── build     cap sync → 签名 → gradle → APK
```

产物名 `breakbind-battlefield.apk`。打 `v*` tag 会自动发 Release。

### 本地出包

```bash
npm install
npx cap sync android
node tools/setup-android.mjs android    # 横屏 / 全屏 / 网络权限
node tools/setup-signing.mjs android    # 生成签名并注入
cd android && ./gradlew assembleRelease
```

---

## 五、签名密钥

**当前配置**（环境变量注入，密码不进仓库）：

| 项 | 值 |
|---|---|
| 库密码 | `xfangames` |
| 别名 | `xfan` |
| 密钥密码 | `games2287681747` |
| 有效期 | 36500 天（≈100 年） |
| 算法 | RSA 2048 / JKS |

在仓库 **Settings → Secrets → Actions** 里可覆盖：

```
BB_KS_STOREPASS   BB_KS_ALIAS   BB_KS_KEYPASS   BB_KS_VALIDITY
```

`tools/setup-signing.mjs` 生成后会用 `keytool -list` 校验别名与密码，
并自检 `build.gradle` 确实注入了签名配置，任一步不对当场失败。

---

## 六、★ 我要改东西，改哪里

| 想改什么 | 改哪个文件 | 具体位置 |
|---|---|---|
| **云端更新 JSON 地址** | `src/core/settings.ts` | 顶部 `UPDATE_JSON_URL`（当前版本尚未接线，见第十节） |
| **关于页文案** | `src/core/settings.ts` | `ABOUT_INTRO` / `ABOUT_LINES` |
| 应用图标 | `assets/icon.png` | 512×512，未放置时用 Capacitor 默认图标 |
| 开屏视频 / 图片 | `assets/splash/` | 见 `assets/splash/README.md` |
| 大厅背景音乐 | `assets/music/` | 放入 mp3/ogg/wav 即可 |
| 移动手感 / 跳跃高度 | `src/game/player.ts` | `DEFAULT_TUNING` |
| 武器伤害 / 射速 / 弹匣 | `src/game/weapon.ts` | `RIFLE` / `KNIFE` |
| 人机行为 | `src/game/bot.ts` | `BOT_TUNING` |
| 控件默认位置 / 大小 | `src/core/layout.ts` | `DEFAULT_POS` / `BASE_SIZE` |
| 地图布局 | `src/game/world.ts` | `buildWorld()` / `ARENA` |
| 服务器端口 / 人数 | `server/server.js` | `PORT` / `MAX_PLAYERS` |
| 版本号 | `package.json` | `version` 字段 |

---

## 七、★ 坐标系是怎么彻底解决的

Godot 版本反复出现的"控件看不见 + 点了没反应"，根因是
**布局与命中测试用了两套坐标系**。现在：

- 控件是绝对定位的 DOM 元素，位置由 `src/core/layout.ts` 用 **CSS 像素**算出
- 触摸用 Pointer Events，坐标取 `clientX / clientY`，同样是 **CSS 像素**
- 中间**没有任何变换矩阵**，不需要换算

并且容器 `pointer-events: none`，只有控件本身 `pointer-events: auto`，
隐藏界面统一用 `display: none`（DOM 里它确实不参与命中）。

这三点由浏览器验证脚本的第 9/10/11 项守着：
**每个控件中心点下去必须命中它自己，空白处必须不被吞。**

---

## 八、单人模式已实现

移动 / 跳跃（含跳跃缓冲与土狼时间）/ 自动疾跑 / 蹲下 / 趴下 /
开火 / 换弹 / 开镜（点击切换，倍镜圆环）/ 准星 / 血条 / 弹药 /
击杀计分 / 3 秒复活倒计时 / 战术人机（巡逻-追击-交战-倒地-重生）/
先到 10 分获胜，10 分钟倒计时 /
近战切换（刀，伤害 10，攻速为枪的 40%）/ 左上角实时 FPS / 自定义准星 / 控件自定义。

**尚未实现**（下一批）：多人联机客户端、治疗物、应用内更新、小地图、
自定义贴图、受伤红闪、受伤/跑动动画的 3D 表现。

---

## 九、服务器

见 `server/README.md`。

```bash
cd server && node server.js
```

Termux：`pkg install nodejs && node server.js`

**免费部署**：用 UDP，而多数免费 PaaS 只放行 HTTP，
所以推荐 **Oracle Cloud 永久免费 ARM**（真 VPS，UDP 可用）。

---

## 十、当前版本的已知限制

1. **多人模式客户端未接线** —— 服务器已就绪并测试通过，客户端入口显示"即将开放"
2. **应用内更新未接线** —— `UPDATE_JSON_URL` 位置已预留，逻辑待补
3. **未做真机测试** —— 本地只有 headless Chrome（WebGL 被禁用），
   3D 画面本身没跑起来过；逻辑、界面、控件均已验证
4. **图标为默认** —— 你提到的「图二」未收到，`assets/icon.png` 未放置

WebGL 不可用时游戏会降级为"无画面但逻辑照跑"并给出提示，
不会像旧版那样卡死在加载页。

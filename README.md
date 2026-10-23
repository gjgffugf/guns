# 破绷战场 · BreakBind Battlefield

移动端 FPS 游戏 App，Godot 4.3 + GDScript 实现，GitHub Actions 自动构建 APK。

- **包名**：`xfan.games.gun`（写在 `export_presets.cfg` 的 `package/unique_name`）
- **横屏**：1280×720 设计基准，`window/handheld/orientation=0``
- **应用名**：破绷战场
- **平台**：Android（arm64-v8a）
- **构建**：推送代码到 GitHub 即自动出包

---

## 一、功能一览

| 模块 | 状态 | 说明 |
|---|---|---|
| 开屏动画 | ✅ | 优先播放视频/图片，**播完才显示真实加载动画**（多线程真实进度） |
| 大厅音乐 | ✅ | 随机播放 `assets/music/` 下的音频，换歌只需替换文件 |
| 单人模式 | ✅ | 1 名战术人机；比分制（先到 10 胜）+ 10 分钟倒计时，时间到比分高者胜，相同为平局 |
| 多人模式 | ✅ | 服务器列表：可添加/编辑/删除，显示延迟与在线/上限人数；不限时，显示全场总击杀 |
| 开房间 | 🚧 | 按钮为展示位，暂不实现 |
| 设置弹窗 | ✅ | 左栏竖排四页：通用 / 准星 / 控件 / 关于 |
| 帧率显示 | ✅ | 左上角实时 FPS 与帧耗时，支持 60/90/120/144 |
| 准星自定义 | ✅ | 标准 / 点 / 圆形 / 十字，可调长度、粗细、大小、中心点、颜色，**实时预览** |
| 控件自定义 | ✅ | 拖动摆放全部虚拟控件，顶栏有保存 / 大小 / 透明度 |
| 治疗物 | ✅ | 破损的绷带 / 布满灰的急救包 / 冰冰冰，使用有倒计时与取消 |
| 近战武器 | ✅ | 刀，伤害 10，攻速为枪的 40%，可一键切换 |
| 小地图 | ✅ | 仅联机显示，只画地形不画敌人，自机指针朝上、视角转地图跟着转 |
| 应用内更新 | ✅ | 启动比对云端 JSON，应用内下载 APK 并拉起安装器 |
| 过渡动画 + 音效 | ✅ | 模式按钮点击有转场黑幕 + whoosh 音效 |

### 已实现的战斗操作

移动、跳跃、疾跑、蹲下、趴下、开镜（FOV 收缩）、准星（散布动态扩散）、
血条、弹药量（30/150）、换弹、开枪、命中判定、扣血、死亡与重生、
后坐力、枪口火焰、曳光弹、命中标记、击杀播报、脚步/受伤/枪声音效。

> 角色与枪械模型**全部由代码生成**（`scripts/ModelFactory.gd` 里的几何体拼装），
> 属于临时测试资源，之后有正式模型时直接替换 `build_soldier()` / `build_gun()` 即可。

---

## 二、目录结构

```
.
├── project.godot              项目配置（包名/主场景/渲染器/输入映射）
├── export_presets.cfg         Android 导出预设（包名、签名、权限）
├── icon.png                   应用图标
├── android/build/AndroidManifest.xml   自定义清单（网络权限等）
├── assets/
│   ├── fonts/ui_font.ttf      中文子集字体（678KB，避免 APK 膨胀）
│   ├── splash/
│   │   ├── splash.ogv         开屏视频（Ogg Theora，Godot 原生支持）
│   │   ├── splash.mp4         同名 MP4，备用（Godot 4 核心暂不支持 H.264）
│   │   └── splash_fallback.png / .jpg   视频缺失时的静态背景
│   └── sfx/*.wav              全部音效用代码合成，无版权问题
├── scripts/
│   ├── GameSettings.gd        全局设置（FPS/服务器地址/昵称）持久化
│   ├── Sfx.gd                 音效管理
│   ├── Transition.gd          场景转场（autoload）
│   ├── NetworkManager.gd      UDP 联机网络层（autoload）
│   ├── ModelFactory.gd        代码生成模型与地图
│   ├── Player.gd              本地玩家控制器
│   ├── Bot.gd                 人机 AI
│   ├── RemotePlayer.gd        远端玩家渲染（插值 + 血条 + 姓名）
│   ├── Hud.gd                 准星/血条/弹药/FPS/虚拟摇杆与按钮
│   ├── Splash.gd              开屏
│   ├── MainMenu.gd            模式选择
│   ├── MultiplayerMenu.gd     服务器地址填写
│   ├── Game.gd                单人模式场景
│   ├── MultiplayerGame.gd     多人模式场景
│   └── SettingsPanel.gd       设置弹窗
├── scenes/*.tscn              5 个场景
├── server/server.py           联机服务器（纯 Python 标准库）
└── .github/workflows/build.yml  自动构建
```

---

## 三、本地开发与调试

1. 下载 [Godot 4.3-stable 标准版](https://godotengine.org/download/archive/)（非 .NET 版）
2. 下载对应的 **Export Templates**（编辑器内：编辑器 → 管理导出模板）
3. 用 Godot 打开本目录，`F5` 运行

电脑上可直接用键盘鼠标试玩：`WASD` 移动、`空格` 跳、`Shift` 疾跑、
`C` 蹲、`Z` 趴、`左键` 开火、`右键` 开镜、`R` 换弹、`Esc` 返回。

手机上是左侧虚拟摇杆移动 + 右侧拖动转视角 + 右侧按钮开火/开镜/跳/蹲/趴/换弹/疾跑。

---

## 四、GitHub Actions 自动构建

把整个目录推到 GitHub 仓库（默认分支 `main`/`master`），Actions 会自动：

1. 装 JDK 17 与 Android SDK（platform-34 / build-tools 34.0.0）
2. 下载 Godot 4.3 headless + 导出模板
3. 生成调试签名密钥
4. `godot --headless --import` 导入资源
5. `godot --headless --export-release "Android"` 导出 APK
6. 上传构建产物 `breakbind-battlefield-apk`

打 tag 会自动发布到 Release：

```bash
git tag v0.1.0 && git push origin v0.1.0
```

也可以在仓库页面 **Actions → 构建 Android APK → Run workflow** 手动触发。

> 首次 gradle 构建需要下载依赖，约 10~20 分钟，之后有缓存会快很多。

### 签名

签名密钥由 CI 现场生成，参数写在 `.github/workflows/build.yml` 的 env 段：

```
KS_STORE_PASS: xfangames        # 库密码
KS_ALIAS:      xfan             # 库名 / 别名
KS_KEY_PASS:   games2287681747  # 密钥密码
KS_VALIDITY:   "36500"          # 36500 天 ≈ 100 年
```

导出时通过环境变量注入 Godot：

```
GODOT_ANDROID_KEYSTORE_RELEASE_PATH / _USER / _PASSWORD
GODOT_ANDROID_KEYSTORE_DEBUG_PATH   / _USER / _PASSWORD
```

**要上架请换成你自己的密钥**：把 `.keystore` 做 base64 存进 Repository Secrets，
在「生成签名密钥」那一步解码并导出上面几个环境变量即可。
密钥丢失就无法再更新已上架的应用，务必备份。

## 五、替换开屏素材

开屏按以下优先级自动选择，**视频优先，找不到就退到图片**：

1. `assets/splash/splash.ogv` —— Godot 核心唯一原生支持的视频格式（Ogg Theora）
2. `assets/splash/splash.mp4` —— 预留位，等 Godot 支持 H.264 后自动生效
3. `assets/splash/splash_fallback.png`
4. `assets/splash/splash_fallback.jpg`

把自己的视频转成 ogv：

```bash
ffmpeg -i your.mp4 -c:v libtheora -q:v 7 -pix_fmt yuv420p assets/splash/splash.ogv
```

只想用一张图：把 `splash.ogv` 删掉，把自己的图命名为 `splash_fallback.png` 覆盖即可，
开屏会自动播放淡入 + 缓慢放大的动画，2.8 秒后进入主菜单。

---

## 六、联机说明

见 [`server/README.md`](server/README.md)。一句话版：

```bash
python3 server/server.py --port 19000
# 控制台会打印本机局域网 IP，客户端「多人模式」里填这个 IP 和端口
```

---

## 七、已知限制

- **开房间**按钮目前只是展示位，点击提示"暂未开放"。
- 多人模式由客户端上报命中、服务器做仲裁，属于轻量反作弊方案，
  正式项目建议改为服务器权威的命中校验。
- 模型、地图均为代码生成的临时测试资源，未做美术与动画。
- 帧率上限设为 144 时，实际帧率取决于屏幕刷新率（60Hz 屏最多跑 60）。

## 操作（横屏）

| 位置 | 控件 |
|---|---|
| 左下 | 虚拟摇杆 —— 移动，**推到顶自动疾跑** |
| 左下 | 治疗物（圆形按钮 + 上方三角箭头展开物品列表） |
| 右下 | 开火（长按可滑动）/ 开镜 / 换弹 / 跳 / 蹲 / 趴 / 切换武器 |
| 屏幕空白处拖动 | 转视角 |
| 底部中间 | 血条 / 弹药 / 姿态 / 比分或总击杀 |
| 左上 | FPS / 延迟 / 小地图（仅联机） |

**边移动边跳**：跳跃按钮在手指「按下」的瞬间就触发，不用等松手；同时加了
0.13s 跳跃缓冲与 0.1s 土狼时间。起跳不清空水平速度，空中仍可用摇杆控制方向。

**开镜**：点击切换（再点一下关镜），开镜时枪械模型隐藏，只显示倍镜圆圈与内部准星。

键盘：WASD 移动 / 空格跳 / Shift 疾跑 / C 蹲 / Z 趴 / R 换弹 / V 切换武器 / F 使用治疗物 / Q 切换物品 / 左键开火 / 右键开镜（点击切换）。

## 八、★ 我想改东西，改哪里

| 想改什么 | 改哪个文件 | 具体位置 |
|---|---|---|
| 云端版本 JSON 地址 | `scripts/GameSettings.gd` | `const UPDATE_JSON_URL` |
| 「关于」页介绍文案 | `scripts/GameSettings.gd` | `ABOUT_INTRO` / `ABOUT_LINES` |
| 当前版本号 | `scripts/GameSettings.gd` | `const CURRENT_VERSION` |
| 应用名 / 包名 | `scripts/GameSettings.gd` | `APP_NAME` / `PACKAGE_NAME`（包名以 `export_presets.cfg` 的 `package/unique_name` 为准） |
| 版本更新内容 | 仓库根目录 `update.json` | `version` / `url` / `force` / `notes` |
| 大厅背景音乐 | `assets/music/` | 直接放进 mp3 / ogg / wav，随机播放，不用改代码 |
| 应用图标 | `icon.png` | 512×512；生成脚本 `tools/gen_icon.py` |
| 开屏视频 / 图片 | `assets/splash/` | `splash.ogv` 优先，缺则回退 `splash_fallback.png` |
| 人物贴图 | 多人页「自定义人物贴图」按钮 | 任意比例图片，按人形比例自动居中裁剪 |

### update.json 字段说明

```json
{
  "version": "0.1.2",
  "code": 3,
  "force": false,
  "url": "https://.../breakbind-0.1.2.apk",
  "title": "更新公告标题",
  "notes": "1. xxx\n2. yyy",
  "size": "18.4MB"
}
```

- `version` 与 `GameSettings.CURRENT_VERSION` 比对，大于当前版本才会弹窗
- `force` 为 `true` 时不提供「以后再说」，必须更新才能继续
- `url` 必须是 APK 直链；应用内下载完成后自动拉起系统安装器

## 九、服务端能不能部署到免费平台

服务端是**纯 Python 标准库 + UDP**，不跑任何 AI / 陪练人机，也不编译二进制，
所以 Termux、电脑、服务器都能直接 `python3 server/server.py` 跑。

但要放到公网给别人连，难点在于**免费平台大多只放行 HTTP**，UDP 入站一般不开放：

| 方案 | UDP 入站 | 说明 |
|---|---|---|
| Oracle Cloud 永久免费 | ✅ | 最推荐。ARM 实例 4 核 24G 内存，长期免费，就是一台真 VPS |
| Fly.io 免费额度 | ✅ | 需要在 `fly.toml` 里显式声明 UDP 端口 |
| Koyeb / Railway / Render 免费档 | ❌ | 只做 HTTP/TCP 反向代理，UDP 用不了 |
| Serv00 等免费 VPS | ✅ | 可用，但名额与稳定性看运气 |
| Termux + 家里旧手机 | ✅ | 已有说明，配好路由器端口转发即可 |

**结论**：想长期稳定就申请 Oracle Cloud 永久免费 ARM 机；图省事用 Fly.io。
纯 HTTP 的免费平台放不了这个服务端。

## 十、CI 报「assets 缺失」怎么办

**先说结论：从 v0.1.1 起，assets 缺失不会再让构建失败。**
字体、音效、开屏视频全都做了运行时降级，并且 CI 会自动补全：

| 缺什么 | 会怎样 |
|---|---|
| 音效 wav | CI 用 `tools/gen_sfx.py`（纯标准库）现场合成 |
| 开屏 ogv | CI 用 ffmpeg 从回退图生成一段；都没有就直接进主菜单 |
| 中文字体 | 回退引擎默认字体，中文可能显示方块 |

构建唯一会失败的情况是 **APK 没生成出来**。

### 但如果你想要原版音效和视频开屏

`git add .` 看起来加了，实际没进仓库，一般是这几种原因。一条命令自查：

```bash
git check-ignore -v assets/splash/splash.ogv        # 是不是被忽略了
git ls-files assets/                                 # 到底哪些进了仓库
cat .git/info/exclude                                # 仓库级排除规则
git config --get core.excludesfile                   # 全局 gitignore
git lfs ls-files                                     # 是不是被 LFS 管了
```

对应处理：

- **被 .gitignore 忽略** → `git add -f assets && git commit && git push`
- **启用了 Git LFS** → `git lfs push --all origin`（LFS 对象没推上去时，
  别人 clone 下来只会拿到一个几十字节的指针文件，看起来像"文件在但打不开"）
- **用 GitHub 网页端拖拽上传** → 二进制文件偶尔会静默失败，改用命令行 push
- **本地文件本来就不在** → 重新解压一次完整源码包覆盖

确认真的进去了：

```bash
git add -f assets
git commit -m "add assets"
git push
git ls-files assets/            # 这里应该能看到 splash.ogv
```

## 十一、CI 报「Parse Error: 推断自 Variant」是什么

典型日志：

```
SCRIPT ERROR: Parse Error: The variable type is being inferred from a Variant value,
so it will be typed as Variant. (Warning treated as error.)
ERROR: Failed to create an autoload, script 'res://scripts/GameSettings.gd' is not compiling.
```

**原因**：Godot 4.3 把 `debug/gdscript/warnings/inference_on_variant` 默认设成了
**2（= 错误）**。只要出现 `var x := <Variant>`，整个脚本编译失败；
如果它还是 autoload，那么依赖它的 autoload 会连锁报 `Compile Error ...:-1`。

容易踩的几种 Variant 来源：

| 写法 | 为什么是 Variant |
|---|---|
| `var c := f.get_value(...)` | `ConfigFile.get_value()` 返回 Variant |
| `var i := e.get("index")` | `Object.get()` / `Dictionary.get()` 返回 Variant |
| `var a := to_map.call(...)` | `Callable.call()` 返回 Variant |
| `var i := x.get("i") if ok else 0` | 三元两边类型不一致，整体退化为 Variant |
| `var p := arr[0]`（arr 未写元素类型） | 未类型化 `Array` 取值返回 Variant |

**改法**：显式写类型，或用 `int()/str()/float()/bool()`、`as Type` 包一层。

```gdscript
var cc: Color = f.get_value("cross", "color", cross_color)   # 好
var idx: int = int(e.get("index", 0))                         # 好
var a: Vector2 = to_map.call(gx, -RANGE)                      # 好
```

本机自查（不用等 CI）：

```bash
python3 tools/check_gd.py
```

它已经内置了这条规则，会在提交前直接指出哪一行会触发。
另外 `project.godot` 的 `[debug]` 段已把这条降为「警告」，
万一有漏网的也不会再让构建中断。

## 十二、手机上「看不到控件 / 点哪都开火」的根因

这两个现象其实是两个独立的 Godot 默认行为叠加造成的。

### 1. 点屏幕任何地方都开火 —— 触摸被模拟成鼠标

Godot 的 `input_devices/pointing/emulate_mouse_from_touch` **默认为 true**。
手指点一下会**同时**发出：

- `InputEventScreenTouch`（HUD 用它做命中测试）
- `InputEventMouseButton`（左键）

而 `Player._unhandled_input()` 里监听了鼠标左键 -> `want_fire = true`。
HUD 处理完触摸后没有把事件标记为已消费，这个鼠标事件就继续流到了 Player，
于是**点哪里都变成开火**。

本项目已在 `project.godot` 关闭：

```ini
[input_devices]

pointing/emulate_mouse_from_touch=false
pointing/emulate_touch_from_mouse=false
```

并在 `Player._unhandled_input()` 里加了一道保险：触摸设备上直接忽略鼠标事件。

### 2. 看不到控件 —— CanvasLayer 不跟随视口

`CanvasLayer.follow_viewport_enabled` **默认为 false**。
在 `stretch = canvas_items` 下这会造成两套坐标系：

| | 坐标系 |
|---|---|
| 触摸事件 `e.position`、`Control` 布局 | stretch 之后的**逻辑**像素 |
| CanvasLayer 内部绘制 | 窗口**物理**像素 |

结果控件被画到了错误的位置。**数值示例**（2340x1080 手机，设计 1280x720）：

| | 开火键实际出现在屏幕 |
|---|---|
| 修复前 | 横向 62%、纵向 60%（挤在中间，尺寸还偏小） |
| 修复后 | 横向 93%、纵向 90%（右下角，正确） |

更糟的是，玩家点他**看到**的按钮，命中的其实是 31% 屏宽之外的另一个地方
——所以按控件没反应，按空白处反而触发。

修法：

- `Hud` / `SettingsPanel` 开启 `follow_viewport_enabled`，让两套坐标系统一
- 命中测试前用 `get_final_transform().affine_inverse()` 把触摸坐标换算到
  CanvasLayer 内部坐标系。**这一步是兜底**，即使上一项没生效也仍然正确

### 3. 附带修掉的：上层控件吞掉触摸

`Control` 默认的 `mouse_filter` 是 `STOP`。血条 `ProgressBar`、血量数字、
雷达、治疗倒计时这些都是纯显示控件，却会吞掉落在它们上面的触摸。
已统一改成 `MOUSE_FILTER_IGNORE`，只保留真正需要点击的按钮为 `STOP`。

同理，`SettingsPanel` 的暗背景 `ColorRect` 默认是 `IGNORE`，
导致"点面板外关不掉"且事件穿透到 HUD 变成开枪。已改为 `STOP`，
并把中间容器设为 `IGNORE` 让事件正确落到暗背景上。

### 排错日志

启动后日志会打印：

```
[Hud] vp=...  viewport=...  变换缩放=...
[Hud] 摇杆=...  开火=...
```

- `vp` 应接近 `1280x720` 量级（逻辑分辨率）。如果变成 `2340x1080` 这类物理值，
  说明没跟随视口
- 开火键矩形应落在右下方

## 十三、⚠️ 菜单按钮点不动的连锁 bug（不要关 emulate_mouse_from_touch）

**结论：`input_devices/pointing/emulate_mouse_from_touch` 必须保持 true。**

Godot 的 `Button` / `BaseButton` **只认 `InputEventMouseButton`**，
`InputEventScreenTouch` 不会触发它的 `pressed` 信号。
手指之所以能点动按钮，全靠这个选项把触摸「翻译」成鼠标事件。
Godot 官方 PR（#49215）的原话：

> Only InputEventMouseButton events (which are generated from InputEventScreenTouch
> events when "Emulate Mouse From Touch" is on -- the default) will trigger BaseButton
> button_down and button_up events; **and nothing when it's off**.

所以为了修「点哪都开火」而关掉它，会直接导致 **菜单里所有按钮失效**。

### 正确解法（两者都要）

1. **保留 `emulate_mouse_from_touch=true`**，让菜单按钮能点
2. **在 Player 侧挡掉模拟出来的鼠标事件**，这才是「点哪都开火」的根源

```gdscript
# scripts/Player.gd
func _unhandled_input(e: InputEvent) -> void:
	# 触摸设备上，鼠标事件是 Godot 模拟的产物，一律忽略
	if _is_touch_device() and (e is InputEventMouseButton or e is InputEventMouseMotion):
		return
```

配套的两点：

- `Hud._on_touch()` 在触摸设备上对鼠标事件直接 return（**且不消费**），
  把事件放行给上层的「退出」「取消」等 Button
- Button 走 `_press_button()` 统一入口，带 400ms 去重。
  因为一次点击会走「触摸兜底」+「鼠标模拟」两条路，不去重会触发两次

### 附带修掉的

- `MainMenu` 右侧 `VBoxContainer` 没设 `mouse_filter`，默认是 `STOP`，
  按钮之间的间隙会吞掉触摸。已改 `IGNORE`
- 「退出」「取消」这类 Button 补了触摸兜底：
  鼠标模拟只跟随**第一根手指**，多指操作时（左手摇杆、右手点取消）点不到，
  所以 `Hud._hit_button()` 在触摸分支里再做一次矩形检测

## 十四、⚠️ 菜单按钮点不动（其二）：隐藏的 CanvasLayer 仍在吞点击

这一条和上一节的 `emulate_mouse_from_touch` 是两个独立原因，都要修。

### 根因：CanvasLayer 的 visible=false 只管绘制，不管输入

`CanvasLayer` 继承自 **`Node`**，不是 `CanvasItem`。它的 `visible = false`
只保证「不绘制」，**不保证**阻止其下控件接收 GUI 输入 —— 因为输入拾取
判断的是 `CanvasItem.is_visible_in_tree()`，而 CanvasLayer 作为 Node
并不参与这条链。

项目里三个全屏遮罩层都靠 `CanvasLayer.visible = false` 关闭：

| 层 | layer | 全屏控件 | 默认过滤 |
|---|---|---|---|
| SettingsPanel | 60 | 暗背景 `dim` (ColorRect) | **STOP** |
| Loading | 150 | `_root` (Control) + `bg` (ColorRect) | **STOP** |
| Updater | 200 | 暗背景 `dim` + `center` | **STOP** |

而 **`ColorRect` / `Panel` / `Container` 的 `mouse_filter` 默认就是 `STOP`**
（只有 `Label` 默认是 `IGNORE`）。

三者都在主菜单之上，且都是全屏 —— 于是主菜单的所有点击都被它们吃掉。

### 修法：隐藏时显式关掉输入过滤

不能只依赖 `visible`，必须同时切换 `mouse_filter`：

```gdscript
# SettingsPanel / Updater：打开时才 STOP，关闭时立刻回到 IGNORE
func _set_visible(on: bool) -> void:
	_layer.visible = on
	_dim.mouse_filter = Control.MOUSE_FILTER_STOP if on \
			else Control.MOUSE_FILTER_IGNORE
```

`Loading` 永远不需要输入，整层直接 `IGNORE`。

### 兜底：主菜单不依赖引擎的按钮路由

即便还有别的遮罩吃掉 GUI 事件，`MainMenu._input()` 也会按矩形命中测试
直接触发按钮。之所以可行，是因为 Godot 的事件顺序是
**`_input()` → `Control._gui_input()` → `_unhandled_input()`**，
`_input()` 在 GUI 之前执行，不会被遮罩抢先。

两条路（引擎 `pressed` 与 `_input` 兜底）共用 300ms 去重，不会重复触发。

### 启动自检

`MainMenu` 启动时会打印：

```
[MainMenu] 视口 (1280, 720)，按钮 4 个
  按钮0 矩形=...
[隐藏层] /root/Loading (layer=150) —— visible=false ...
[MainMenu] 可疑全屏拦截控件: N 个
```

理想情况下 `可疑全屏拦截控件` 应为 **0**。


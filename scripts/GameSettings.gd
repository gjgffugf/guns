extends Node
## 全局设置：帧率、准星、控件布局、版本更新、灵敏度。
## 通过 user://settings.cfg 持久化。

signal fps_changed(value: int)
signal crosshair_changed()
signal controls_changed()

const CFG_PATH := "user://settings.cfg"
const FPS_OPTIONS: Array[int] = [60, 90, 120, 144]

const FONT_PATH := "res://assets/fonts/ui_font.ttf"

# ---------------------------------------------------------------- 准星
## 0 标准 / 1 点 / 2 圆形 / 3 十字
enum CrossStyle { STANDARD, DOT, CIRCLE, CROSS }
const CROSS_NAMES := ["标准", "点", "圆形", "十字"]

var cross_style: int = CrossStyle.STANDARD
var cross_length: float = 9.0     # 臂长（像素，基准 1280x720）
var cross_gap: float = 5.0        # 中心空隙
var cross_thick: float = 2.5      # 粗细
var cross_size: float = 1.0       # 整体缩放 0.5 ~ 2.0
var cross_color: Color = Color(0.35, 1.0, 0.45, 0.95)
var cross_dot: bool = true        # 中心点

# ---------------------------------------------------------------- 控件
## name -> {"x": 比例x, "y": 比例y, "s": 缩放, "a": 透明度}
## 比例以 1280x720 为基准，0~1
const CONTROL_KEYS := ["stick", "fire", "ads", "jump", "crouch", "prone",
		"reload", "melee", "heal"]
const CONTROL_NAMES := {
	"stick": "移动摇杆", "fire": "开火", "ads": "开镜", "jump": "跳跃",
	"crouch": "蹲下", "prone": "趴下", "reload": "换弹",
	"melee": "切换武器", "heal": "治疗物",
}
## 默认位置统一从 TouchLayout 取，避免两处不同步
static func default_ctrl() -> Dictionary:
	var d := {}
	for k in CONTROL_KEYS:
		var p: Vector2 = TouchLayout.DEFAULT_POS.get(k, Vector2(0.5, 0.5))
		d[k] = {"x": p.x, "y": p.y, "s": 1.0, "a": 0.92}
	d["stick"]["a"] = 0.85
	return d

var controls: Dictionary = {}

# ---------------------------------------------------------------- 常规
var target_fps: int = 60
var server_addr: String = "192.168.1.10"
var server_port: int = 19000
var player_name: String = "指挥官"
var sensitivity: float = 0.7
var invert_y: bool = false
var master_volume: float = 0.9
var auto_sprint: bool = true       # 摇杆推到顶自动疾跑
var show_minimap: bool = true
var skin_path: String = ""         # 自定义人物贴图（user:// 路径）
## 服务器列表：[{name, addr, port}]，在「多人 - 添加服务器」里维护
var servers: Array = []

# ---------------------------------------------------------------- 更新
## ★ 修改这里即可更换云端版本配置地址
const UPDATE_JSON_URL := "https://xfan-gun.ffurry.cc.cd/update.json"
const CURRENT_VERSION := "0.1.1"
const APP_NAME := "破绷战场"
const PACKAGE_NAME := "xfan.games.gun"
## ★ 修改这里即可更换「关于」页的介绍文字
const ABOUT_INTRO := "破绷战场 —— 一款阴间的不知道好不好玩的游戏。\n"
const ABOUT_LINES: Array[String] = [
	"代号 gugugaga",
	"支持不知道awa",
]

var _reapply_t: float = 0.0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_setup_font()
	load_cfg()
	apply_fps(target_fps)
	AudioServer.set_bus_volume_db(0, linear_to_db(master_volume))

func _process(delta: float) -> void:
	# Android 上切换前后台 / 部分系统省电策略会把帧率上限重置回 60，
	# 所以定期校验一次，发现被改回去就重新应用。
	_reapply_t += delta
	if _reapply_t < 1.5:
		return
	_reapply_t = 0.0
	# 两个条件都要查：max_fps 被改回去、或垂直同步被系统重新打开，
	# 任何一个都会把高刷锁回 60
	var vs := DisplayServer.window_get_vsync_mode()
	if Engine.max_fps != target_fps or vs != DisplayServer.VSYNC_DISABLED:
		apply_fps(target_fps)

## 挂中文字体。资源缺失时静默降级，不阻断启动。
func _setup_font() -> void:
	if ResourceLoader.exists(FONT_PATH):
		var f := load(FONT_PATH) as Font
		if f != null:
			ThemeDB.fallback_font = f
	else:
		push_warning("[Settings] 字体缺失，界面将回退到默认字体: %s" % FONT_PATH)

# ---------------------------------------------------------------- 存档
func load_cfg() -> void:
	controls = {}
	var defs := default_ctrl()
	for k in CONTROL_KEYS:
		var d: Dictionary = defs[k]
		controls[k] = {"x": d["x"], "y": d["y"], "s": d["s"], "a": d["a"]}

	var f := ConfigFile.new()
	if f.load(CFG_PATH) != OK:
		return
	target_fps = int(f.get_value("game", "fps", target_fps))
	server_addr = str(f.get_value("game", "server_addr", server_addr))
	server_port = int(f.get_value("game", "server_port", server_port))
	player_name = str(f.get_value("game", "player_name", player_name))
	sensitivity = float(f.get_value("game", "sensitivity", sensitivity))
	invert_y = bool(f.get_value("game", "invert_y", invert_y))
	master_volume = float(f.get_value("game", "volume", master_volume))
	auto_sprint = bool(f.get_value("game", "auto_sprint", auto_sprint))
	show_minimap = bool(f.get_value("game", "minimap", show_minimap))
	skin_path = str(f.get_value("game", "skin", skin_path))

	servers = []
	var n := int(f.get_value("servers", "count", 0))
	for i in n:
		var d = f.get_value("servers", "s%d" % i, null)
		if d is Dictionary:
			servers.append({
				"name": str(d.get("name", "服务器")),
				"addr": str(d.get("addr", "")),
				"port": int(d.get("port", 19000)),
			})

	cross_style = clampi(int(f.get_value("cross", "style", cross_style)), 0, 3)
	cross_length = float(f.get_value("cross", "len", cross_length))
	cross_gap = float(f.get_value("cross", "gap", cross_gap))
	cross_thick = float(f.get_value("cross", "thick", cross_thick))
	cross_size = float(f.get_value("cross", "size", cross_size))
	cross_dot = bool(f.get_value("cross", "dot", cross_dot))
	var cc := f.get_value("cross", "color", null)
	if cc is Color:
		cross_color = cc

	for k in CONTROL_KEYS:
		if not f.has_section_key("ctrl", k):
			continue
		var v = f.get_value("ctrl", k)
		if v is Dictionary:
			var dd: Dictionary = default_ctrl().get(k, {"x": 0.5, "y": 0.5})
			controls[k] = {
				"x": float(v.get("x", dd["x"])),
				"y": float(v.get("y", dd["y"])),
				"s": float(v.get("s", 1.0)),
				"a": float(v.get("a", 0.92)),
			}

	if not FPS_OPTIONS.has(target_fps):
		target_fps = 60

func save_cfg() -> void:
	var f := ConfigFile.new()
	f.set_value("game", "fps", target_fps)
	f.set_value("game", "server_addr", server_addr)
	f.set_value("game", "server_port", server_port)
	f.set_value("game", "player_name", player_name)
	f.set_value("game", "sensitivity", sensitivity)
	f.set_value("game", "invert_y", invert_y)
	f.set_value("game", "volume", master_volume)
	f.set_value("game", "auto_sprint", auto_sprint)
	f.set_value("game", "minimap", show_minimap)
	f.set_value("game", "skin", skin_path)

	f.set_value("servers", "count", servers.size())
	for i in servers.size():
		f.set_value("servers", "s%d" % i, servers[i])

	f.set_value("cross", "style", cross_style)
	f.set_value("cross", "len", cross_length)
	f.set_value("cross", "gap", cross_gap)
	f.set_value("cross", "thick", cross_thick)
	f.set_value("cross", "size", cross_size)
	f.set_value("cross", "dot", cross_dot)
	f.set_value("cross", "color", cross_color)

	for k in CONTROL_KEYS:
		if controls.has(k):
			f.set_value("ctrl", k, controls[k])
	f.save(CFG_PATH)

# ---------------------------------------------------------------- 帧率
## 应用帧率上限。要跑满 90/120/144 必须关掉垂直同步，
## 否则会被屏幕刷新率锁死在 60；同时把物理步进一并提上去，
## 不然 60Hz 物理会把高刷渲染拖成卡顿。
func apply_fps(value: int) -> void:
	target_fps = value
	Engine.max_fps = value
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	# 物理步进跟随，上限 120 防止低端机 CPU 打满
	Engine.physics_ticks_per_second = clampi(value, 60, 120)
	Engine.max_physics_steps_per_frame = 8
	fps_changed.emit(value)
	save_cfg()

# ---------------------------------------------------------------- 准星 / 控件
func set_cross(key: String, v) -> void:
	match key:
		"style": cross_style = int(v)
		"len": cross_length = float(v)
		"gap": cross_gap = float(v)
		"thick": cross_thick = float(v)
		"size": cross_size = float(v)
		"dot": cross_dot = bool(v)
		"color": cross_color = v
	crosshair_changed.emit()

func reset_cross() -> void:
	cross_style = CrossStyle.STANDARD
	cross_length = 9.0
	cross_gap = 5.0
	cross_thick = 2.5
	cross_size = 1.0
	cross_dot = true
	cross_color = Color(0.35, 1.0, 0.45, 0.95)
	crosshair_changed.emit()
	save_cfg()

func get_ctrl(key: String) -> Dictionary:
	if controls.has(key):
		return controls[key]
	return {"x": 0.5, "y": 0.5, "s": 1.0, "a": 0.92}

func set_ctrl(key: String, d: Dictionary) -> void:
	controls[key] = d
	controls_changed.emit()

func reset_controls() -> void:
	controls = {}
	var defs := default_ctrl()
	for k in CONTROL_KEYS:
		var d: Dictionary = defs[k]
		controls[k] = {"x": d["x"], "y": d["y"], "s": d["s"], "a": d["a"]}
	controls_changed.emit()
	save_cfg()

# ---------------------------------------------------------------- 其它
# ---------------------------------------------------------------- 服务器列表
func add_server(name_: String, addr: String, port: int) -> void:
	servers.append({"name": name_, "addr": addr, "port": port})
	save_cfg()

func set_server_at(i: int, name_: String, addr: String, port: int) -> void:
	if i < 0 or i >= servers.size():
		return
	servers[i] = {"name": name_, "addr": addr, "port": port}
	save_cfg()

func remove_server(i: int) -> void:
	if i < 0 or i >= servers.size():
		return
	servers.remove_at(i)
	save_cfg()

func set_server(addr: String, port: int) -> void:
	server_addr = addr
	server_port = port
	save_cfg()

func set_player_name(v: String) -> void:
	player_name = v
	save_cfg()

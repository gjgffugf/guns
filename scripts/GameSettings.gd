extends Node
## 全局设置：FPS 上限、服务器地址、玩家昵称、灵敏度。
## 通过 user://settings.cfg 持久化。

signal fps_changed(value: int)

const CFG_PATH := "user://settings.cfg"
const FPS_OPTIONS: Array[int] = [60, 90, 120, 144]

var target_fps: int = 60
var server_addr: String = "192.168.1.10"
var server_port: int = 19000
var player_name: String = "指挥官"
var sensitivity: float = 1.0
var invert_y: bool = false
var master_volume: float = 0.9

const FONT_PATH := "res://assets/fonts/ui_font.ttf"

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_setup_font()
	load_cfg()
	apply_fps(target_fps)
	AudioServer.set_bus_volume_db(0, linear_to_db(master_volume))

## 挂中文字体。资源缺失时静默降级，不阻断启动。
func _setup_font() -> void:
	if ResourceLoader.exists(FONT_PATH):
		var f := load(FONT_PATH) as Font
		if f != null:
			ThemeDB.fallback_font = f
	else:
		push_warning("[Settings] 字体缺失，界面将回退到默认字体: %s" % FONT_PATH)

func load_cfg() -> void:
	var f := ConfigFile.new()
	if f.load(CFG_PATH) != OK:
		return
	target_fps = int(f.get_value("game", "fps", 60))
	server_addr = str(f.get_value("game", "server_addr", server_addr))
	server_port = int(f.get_value("game", "server_port", server_port))
	player_name = str(f.get_value("game", "player_name", player_name))
	sensitivity = float(f.get_value("game", "sensitivity", 1.0))
	invert_y = bool(f.get_value("game", "invert_y", false))
	master_volume = float(f.get_value("game", "volume", 0.9))
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
	f.save(CFG_PATH)

## 应用帧率上限。要跑满 90/120/144 必须关掉垂直同步，否则会被屏幕刷新率锁死。
func apply_fps(value: int) -> void:
	target_fps = value
	Engine.max_fps = value
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	fps_changed.emit(value)
	save_cfg()

func set_server(addr: String, port: int) -> void:
	server_addr = addr
	server_port = port
	save_cfg()

func set_player_name(v: String) -> void:
	player_name = v
	save_cfg()

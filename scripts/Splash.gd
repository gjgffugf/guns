extends Control
## 开屏动画：优先播放视频（Ogg Theora .ogv，Godot 原生格式），
## 找不到视频时自动回退到 jpg / png 静态背景并播放淡入淡出动画，
## 播放结束后带转场跳到模式选择页。

const VIDEO_CANDIDATES := [
	"res://assets/splash/splash.ogv",
	"res://assets/splash/splash.mp4",
]
const IMG_CANDIDATES := [
	"res://assets/splash/splash_fallback.png",
	"res://assets/splash/splash_fallback.jpg",
]
const IMG_DURATION := 2.8
const MAX_WAIT := 12.0

var _vsp: VideoStreamPlayer
var _img: TextureRect
var _skip: Button
var _bar: ProgressBar
var _done: bool = false
var _t: float = 0.0
var _mode: String = ""
var _video_len: float = 0.0

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	if not _try_video():
		_try_image()
	_build_skip()
	if _mode == "":
		# 什么都没有，直接进主菜单
		_finish()

func _try_video() -> bool:
	for p in VIDEO_CANDIDATES:
		if not ResourceLoader.exists(p):
			continue
		var res := load(p)
		if res == null or not (res is VideoStream):
			continue
		_mode = "video"
		_vsp = VideoStreamPlayer.new()
		_vsp.set_anchors_preset(Control.PRESET_FULL_RECT)
		_vsp.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_vsp.expand = true
		_vsp.stream = res
		_vsp.autoplay = true
		_vsp.finished.connect(_finish)
		add_child(_vsp)
		move_child(_vsp, 0)
		print("[Splash] 播放视频: ", p)
		return true
	return false

func _try_image() -> bool:
	for p in IMG_CANDIDATES:
		if not ResourceLoader.exists(p):
			continue
		var tex := load(p)
		if tex == null or not (tex is Texture2D):
			continue
		_mode = "image"
		_img = TextureRect.new()
		_img.set_anchors_preset(Control.PRESET_FULL_RECT)
		_img.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_img.texture = tex
		_img.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		_img.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		add_child(_img)
		move_child(_img, 0)
		# 缓慢放大 + 淡入，模拟开屏动画
		_img.pivot_offset = size / 2.0 if size != Vector2.ZERO else Vector2(360, 640)
		_img.modulate.a = 0.0
		var tw := create_tween()
		tw.set_parallel(true)
		tw.tween_property(_img, "modulate:a", 1.0, 0.5)
		tw.tween_property(_img, "scale", Vector2(1.08, 1.08), IMG_DURATION + 0.6)
		print("[Splash] 使用静态背景: ", p)
		return true
	return false

func _build_skip() -> void:
	_bar = ProgressBar.new()
	_bar.anchor_left = 0.0
	_bar.anchor_right = 1.0
	_bar.anchor_top = 1.0
	_bar.anchor_bottom = 1.0
	_bar.offset_left = 70.0
	_bar.offset_right = -70.0
	_bar.offset_top = -76.0
	_bar.offset_bottom = -64.0
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bar.max_value = 100
	_bar.show_percentage = false
	var f := StyleBoxFlat.new()
	f.bg_color = Color(0.9, 0.2, 0.24)
	_bar.add_theme_stylebox_override("fill", f)
	var g := StyleBoxFlat.new()
	g.bg_color = Color(1, 1, 1, 0.12)
	_bar.add_theme_stylebox_override("background", g)
	add_child(_bar)

	_skip = Button.new()
	_skip.text = "跳过"
	_skip.anchor_left = 1.0
	_skip.anchor_top = 0.0
	_skip.anchor_right = 1.0
	_skip.anchor_bottom = 0.0
	_skip.offset_left = -160.0
	_skip.offset_top = 30.0
	_skip.offset_right = -40.0
	_skip.offset_bottom = 94.0
	_skip.add_theme_font_size_override("font_size", 24)
	var n := StyleBoxFlat.new()
	n.bg_color = Color(0.15, 0.16, 0.2, 0.85)
	n.set_corner_radius_all(999)
	n.border_width_left = 2
	n.border_width_right = 2
	n.border_width_top = 2
	n.border_width_bottom = 2
	n.border_color = Color(1, 1, 1, 0.3)
	_skip.add_theme_stylebox_override("normal", n)
	_skip.pressed.connect(func():
		Sfx.play("click")
		_finish()
	)
	add_child(_skip)

func _process(delta: float) -> void:
	if _done:
		return
	_t += delta
	if _mode == "video" and _vsp != null:
		var total := maxf(_vsp.get_stream_length(), 1.0)
		_bar.value = clampf(_vsp.get_stream_position() / total * 100.0, 0.0, 100.0)
		if _t > MAX_WAIT:
			_finish()
	elif _mode == "image":
		_bar.value = clampf(_t / IMG_DURATION * 100.0, 0.0, 100.0)
		if _t >= IMG_DURATION:
			_finish()

func _finish() -> void:
	if _done:
		return
	_done = true
	print("[Splash] 开屏结束 -> 真实加载动画")
	# 开屏视频 / 图片播完之后，才显示加载动画（进度为真实加载进度）
	Loading.goto("res://scenes/MainMenu.tscn")

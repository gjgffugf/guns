extends Node
## 真实加载动画：开屏视频 / 图片播完之后才出现，
## 进度由多线程真实加载进度驱动（不是假进度条）。
## 用法：Loading.goto("res://scenes/MainMenu.tscn")

var _layer: CanvasLayer
var _root: Control
var _spin: Control
var _bar: ProgressBar
var _pct: Label
var _tip: Label
var _t: float = 0.0
var _busy: bool = false

const TIPS: Array[String] = [
	"正在生成战场…", "正在校准准星…", "正在装填弹药…",
	"正在部署战术人机…", "正在同步服务器…", "正在擦拭绷带…",
]

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_layer = CanvasLayer.new()
	_layer.layer = 150
	_layer.visible = false
	add_child(_layer)
	_build()

func _build() -> void:
	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	# ★ 加载层永远不需要接收输入。
	#   它是 CanvasLayer（继承自 Node），visible=false 只保证不绘制，
	#   并不能保证阻止输入；默认 STOP 会吞掉后面场景的所有点击。
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_layer.add_child(_root)

	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = Color(0.035, 0.04, 0.055, 1.0)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(bg)

	# 背景网格
	var grid := Control.new()
	grid.set_anchors_preset(Control.PRESET_FULL_RECT)
	grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	grid.draw.connect(func():
		var s := grid.size
		var step := 64.0
		var x := 0.0
		while x < s.x:
			grid.draw_line(Vector2(x, 0), Vector2(x, s.y), Color(0.16, 0.20, 0.28, 0.30), 1.0)
			x += step
		var y := 0.0
		while y < s.y:
			grid.draw_line(Vector2(0, y), Vector2(s.x, y), Color(0.16, 0.20, 0.28, 0.30), 1.0)
			y += step
	)
	_root.add_child(grid)

	# 六边形旋转指示器
	_spin = Control.new()
	_spin.set_anchors_preset(Control.PRESET_FULL_RECT)
	_spin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_spin.draw.connect(_draw_spin)
	_root.add_child(_spin)

	_bar = ProgressBar.new()
	_bar.anchor_left = 0.5
	_bar.anchor_right = 0.5
	_bar.anchor_top = 0.62
	_bar.anchor_bottom = 0.62
	_bar.offset_left = -230.0
	_bar.offset_right = 230.0
	_bar.offset_top = 0.0
	_bar.offset_bottom = 12.0
	_bar.max_value = 100
	_bar.show_percentage = false
	var fs := StyleBoxFlat.new()
	fs.bg_color = Color(0.88, 0.22, 0.26)
	_bar.add_theme_stylebox_override("fill", fs)
	var gs := StyleBoxFlat.new()
	gs.bg_color = Color(1, 1, 1, 0.10)
	gs.set_corner_radius_all(3)
	_bar.add_theme_stylebox_override("background", gs)
	_root.add_child(_bar)

	_pct = Label.new()
	_pct.anchor_left = 0.5
	_pct.anchor_right = 0.5
	_pct.anchor_top = 0.62
	_pct.anchor_bottom = 0.62
	_pct.offset_left = -230.0
	_pct.offset_right = 230.0
	_pct.offset_top = 26.0
	_pct.offset_bottom = 60.0
	_pct.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_pct.add_theme_font_size_override("font_size", 26)
	_pct.add_theme_color_override("font_color", Color(0.72, 0.78, 0.88))
	_root.add_child(_pct)

	_tip = Label.new()
	_tip.anchor_left = 0.5
	_tip.anchor_right = 0.5
	_tip.anchor_top = 0.62
	_tip.anchor_bottom = 0.62
	_tip.offset_left = -400.0
	_tip.offset_right = 400.0
	_tip.offset_top = 66.0
	_tip.offset_bottom = 104.0
	_tip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_tip.add_theme_font_size_override("font_size", 24)
	_tip.add_theme_color_override("font_color", Color(0.55, 0.62, 0.72))
	_root.add_child(_tip)

func _draw_spin() -> void:
	var s := _spin.size
	var c := Vector2(s.x / 2.0, s.y * 0.40)
	var base := minf(s.x, s.y) * 0.09
	for ring in 2:
		var rad := base + ring * 26.0
		var dir := 1.0 if ring == 0 else -1.0
		var pts: PackedVector2Array = []
		for k in 6:
			var a := _t * 1.6 * dir + k * TAU / 6.0
			pts.append(c + Vector2(cos(a), sin(a)) * rad)
		var col := Color(0.88, 0.24, 0.28, 0.85) if ring == 0 \
				else Color(0.45, 0.60, 0.85, 0.55)
		for k in 6:
			_spin.draw_line(pts[k], pts[(k + 1) % 6], col, 3.0)
	_spin.draw_circle(c, 5.0, Color(1, 1, 1, 0.8))

# ------------------------------------------------------------------ 对外
func goto(path: String) -> void:
	if _busy:
		return
	_busy = true
	_layer.visible = true
	set_process(true)
	_bar.value = 0
	_pct.text = "0%"
	_tip.text = TIPS[randi() % TIPS.size()]
	# 超时保险：万一下面某一步卡住或出错，20 秒后强制收起加载层。
	# 加载层是全屏不透明的，不收起就是永久黑屏，必须有兜底。
	_hide_guard()

	ResourceLoader.load_threaded_request(path)
	var st := ResourceLoader.THREAD_LOAD_IN_PROGRESS
	var pr: Array = []
	var smooth := 0.0
	while st == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
		OS.delay_msec(16)
		st = ResourceLoader.load_threaded_get_status(path, pr)
		var target := 100.0
		if pr.size() > 0:
			target = float(pr[0]) * 100.0
		smooth = move_toward(smooth, target, 1.6)
		_bar.value = smooth
		_pct.text = "%d%%" % int(smooth)
		await get_tree().process_frame

	var scn: PackedScene = null
	if st == ResourceLoader.THREAD_LOAD_LOADED:
		# load_threaded_get 返回 Resource，需显式转成 PackedScene
		scn = ResourceLoader.load_threaded_get(path) as PackedScene
		_bar.value = 100
		_pct.text = "100%"
		await get_tree().create_timer(0.12).timeout

	# ★ 关键：场景切换一律用 call_deferred 延后到本帧末执行。
	#
	# 直接调用 change_scene_to_packed() 时，如果新场景的脚本有编译错误，
	# Godot 会打印错误并中止那次调用，本协程后面的
	# "_layer.visible = false" 就永远执行不到 —— 于是卡在全屏不透明的
	# 加载层上，看起来就是"界面加载不出来"。
	# 改成 deferred 之后，切换发生在帧末、与本协程无关，
	# 无论切换成功与否，下面的收起逻辑都会照常执行，
	# 出错时至少能看到报错日志而不是一片黑。
	if scn != null:
		get_tree().call_deferred("change_scene_to_packed", scn)
	else:
		push_error("[Loading] 场景加载失败: %s" % path)
		get_tree().call_deferred("change_scene_to_file", path)

	await get_tree().create_timer(0.25).timeout
	_layer.visible = false
	set_process(false)
	_busy = false
	print("[Loading] 已切换到 %s 并收起加载层" % path)

## 超时兜底：强制收起加载层，避免任何异常导致永久黑屏
func _hide_guard() -> void:
	await get_tree().create_timer(20.0).timeout
	if _layer != null and _layer.visible:
		push_warning("[Loading] 加载超时，强制收起加载层（请查看上面的报错）")
		_layer.visible = false
		set_process(false)
		_busy = false

func _process(delta: float) -> void:
	_t += delta
	_spin.queue_redraw()

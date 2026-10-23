extends Control
## 模式选择页：单人 / 多人 / 开房间（暂为展示），右上角设置按钮。

var _settings: SettingsPanel
var _bg: Control
var _toast_lbl: Label
## 按钮与回调登记表。触摸除了走 Button.pressed（引擎用鼠标模拟驱动），
## 这里再补一条兜底：直接按矩形命中测试，以防某个隐藏的全屏遮罩
## 把 GUI 事件吞掉时按钮彻底失灵。
const KEYS: Array[String] = ["solo", "multi", "room", "gear"]
var _btns: Array[Button] = []
var _cbs: Array[Callable] = []
var _lock: Dictionary = {}          # key -> 上次触发时刻，防止两条路重复触发
var _leaving: bool = false          # 已触发转场，避免连点

func _ready() -> void:
	print("[MainMenu] _ready 开始")
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_build_bg()
	_build_ui()
	_settings = SettingsPanel.new()
	add_child(_settings)
	# 大厅随机背景音乐（把音频文件放进 assets/music/ 即可，见 README）
	Music.play_lobby()
	# 每次启动比对云端版本，已是最新版则提示一次
	Updater.check(true)
	_audit_overlays.call_deferred()
	print("[MainMenu] _ready 完成，按钮 %d 个" % _btns.size())

func _build_bg() -> void:
	_bg = Control.new()
	_bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bg.draw.connect(_draw_bg)
	add_child(_bg)

func _draw_bg() -> void:
	var r := Rect2(Vector2.ZERO, _bg.size)
	_bg.draw_rect(r, Color(0.035, 0.04, 0.055))
	# 网格
	var step := 56.0
	var x := 0.0
	while x < _bg.size.x:
		_bg.draw_line(Vector2(x, 0), Vector2(x, _bg.size.y), Color(0.16, 0.20, 0.28, 0.35), 1.0)
		x += step
	var y := 0.0
	while y < _bg.size.y:
		_bg.draw_line(Vector2(0, y), Vector2(_bg.size.x, y), Color(0.16, 0.20, 0.28, 0.35), 1.0)
		y += step
	# 顶部红色光晕
	var c := Vector2(_bg.size.x / 2.0, _bg.size.y * 0.28)
	for i in 26:
		var rad := 330.0 - i * 12.0
		var a := 0.012 * (1.0 - i / 26.0)
		_bg.draw_circle(c, rad, Color(0.95, 0.15, 0.18, a))
	# 底部渐变压暗
	for i in 40:
		var yy := _bg.size.y - i * 8.0
		_bg.draw_rect(Rect2(0, yy, _bg.size.x, 8.0), Color(0, 0, 0, 0.02 * (1 - i / 40.0)))

func _build_ui() -> void:
	# 横屏左文右按钮的双栏布局，纵向空间（720）比竖屏紧张得多
	var root := HBoxContainer.new()
	root.anchor_left = 0.05
	root.anchor_top = 0.10
	root.anchor_right = 0.95
	root.anchor_bottom = 0.90
	root.add_theme_constant_override("separation", 44)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 14)
	left.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(left)

	var right := VBoxContainer.new()
	# 必须 IGNORE：容器默认是 STOP，按钮之间的间隙会吞掉触摸，
	# 看起来就像"点了没反应"
	right.mouse_filter = Control.MOUSE_FILTER_IGNORE
	right.custom_minimum_size = Vector2(500, 0)
	right.add_theme_constant_override("separation", 18)
	right.alignment = BoxContainer.ALIGNMENT_CENTER
	root.add_child(right)

	# ---- 左侧：标题 ----
	var title := Label.new()
	title.text = "破绷战场"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 54)
	title.add_theme_color_override("font_color", Color(1.0, 0.95, 0.92))
	title.add_theme_color_override("font_outline_color", Color(0.75, 0.1, 0.12))
	title.add_theme_constant_override("outline_size", 10)
	left.add_child(title)

	var sub := Label.new()
	sub.text = "B R E A K B I N D   B A T T L E F I E L D"
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_font_size_override("font_size", 20)
	sub.add_theme_color_override("font_color", Color(0.55, 0.65, 0.78))
	left.add_child(sub)

	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left.add_child(spacer)

	var foot := Label.new()
	foot.text = "xfan.games.gun   v0.1.1"
	foot.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	foot.add_theme_font_size_override("font_size", 20)
	foot.add_theme_color_override("font_color", Color(0.42, 0.46, 0.54))
	left.add_child(foot)

	# ---- 右侧：模式按钮 ----
	right.add_child(_mode_button("solo", "单 人 模 式", "离线训练场 · 含 1 名战术人机",
			Color(0.72, 0.16, 0.18), func():
		Trans.goto("res://scenes/Game.tscn", "正在载入训练场")
	))
	right.add_child(_mode_button("multi", "多 人 模 式", "连接自建服务器 · 联机对战",
			Color(0.16, 0.38, 0.62), func():
		Trans.goto("res://scenes/MultiplayerMenu.tscn", "正在连接配置")
	))
	right.add_child(_mode_button("room", "开 房 间", "功能开发中 · 敬请期待",
			Color(0.24, 0.26, 0.30), func():
		_toast("开房间功能暂未开放")
	))

	# ---- 右上角设置按钮 ----
	var gear := Button.new()
	gear.text = "设置"
	gear.anchor_left = 1.0
	gear.anchor_top = 0.0
	gear.anchor_right = 1.0
	gear.anchor_bottom = 0.0
	gear.offset_left = -150.0
	gear.offset_top = 24.0
	gear.offset_right = -24.0
	gear.offset_bottom = 92.0
	gear.add_theme_font_size_override("font_size", 26)
	var n := StyleBoxFlat.new()
	n.bg_color = Color(0.14, 0.16, 0.22, 0.92)
	n.set_corner_radius_all(14)
	n.border_width_left = 2
	n.border_width_right = 2
	n.border_width_top = 2
	n.border_width_bottom = 2
	n.border_color = Color(0.9, 0.3, 0.32, 0.75)
	gear.add_theme_stylebox_override("normal", n)
	var p := n.duplicate() as StyleBoxFlat
	p.bg_color = Color(0.32, 0.14, 0.16, 0.95)
	gear.add_theme_stylebox_override("pressed", p)
	gear.pressed.connect(func(): _activate("gear"))
	add_child(gear)
	_btns.append(gear)
	_cbs.append(func(): _settings.open_panel())

func _mode_button(key: String, title: String, desc: String, col: Color,
		cb: Callable) -> Button:
	var b := Button.new()
	b.custom_minimum_size = Vector2(0, 104)
	var sb := StyleBoxFlat.new()
	sb.bg_color = col
	sb.set_corner_radius_all(14)
	sb.border_width_left = 2
	sb.border_width_right = 2
	sb.border_width_top = 2
	sb.border_width_bottom = 2
	sb.border_color = Color(1, 1, 1, 0.22)
	b.add_theme_stylebox_override("normal", sb)
	var pb := sb.duplicate() as StyleBoxFlat
	pb.bg_color = col.lightened(0.22)
	b.add_theme_stylebox_override("pressed", pb)
	var hb := sb.duplicate() as StyleBoxFlat
	hb.bg_color = col.lightened(0.12)
	b.add_theme_stylebox_override("hover", hb)
	b.add_theme_font_size_override("font_size", 38)

	var v := VBoxContainer.new()
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.set_anchors_preset(Control.PRESET_FULL_RECT)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	b.add_child(v)
	var t := Label.new()
	t.text = title
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", 40)
	t.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.6))
	t.add_theme_constant_override("outline_size", 6)
	v.add_child(t)
	var d := Label.new()
	d.text = desc
	d.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	d.add_theme_font_size_override("font_size", 21)
	d.add_theme_color_override("font_color", Color(0.88, 0.90, 0.94))
	v.add_child(d)

	# 登记到兜底表，并让 pressed 走同一个去重入口
	_btns.append(b)
	_cbs.append(cb)
	b.pressed.connect(func(): _activate_by(b))
	return b

# ------------------------------------------------------------------ 输入兜底
## 统一的按钮触发入口：300ms 去重。
## 触摸设备上一次点击会走两条路 —— 引擎的鼠标模拟（触发 pressed）
## 和下面 _input 的矩形兜底 —— 去重保证只生效一次。
func _activate(key: String) -> void:
	var now := Time.get_ticks_msec()
	if now - int(_lock.get(key, 0)) < 300:
		return
	_lock[key] = now
	Sfx.play("click", 2.0)
	if key == "solo" or key == "multi":
		_leaving = true
	var i := KEYS.find(key)
	if i >= 0 and i < _cbs.size():
		_cbs[i].call()

func _activate_by(b: Button) -> void:
	var i := _btns.find(b)
	if i < 0:
		return
	_activate(KEYS[i] if i < KEYS.size() else "gear")

## 兜底：直接在 MainMenu 这一层按矩形命中测试。
## 万一某个隐藏的全屏遮罩把 GUI 事件吞了，Button.pressed 收不到，
## 这条路径仍然能保证按钮可用。
func _input(event: InputEvent) -> void:
	# 设置面板打开时，点击归面板，主菜单一律不响应
	if _settings != null and _settings.visible:
		return
	if _leaving:
		return
	# ★ 必须用 as 转换后再取属性。
	#   形参静态类型是 InputEvent，而 position / pressed / button_index
	#   是子类（ScreenTouch / MouseButton）才有的属性。Godot 的类型窄化
	#   只在 `if x is Type:` 块内有效，一旦走到块外的合并点就会失效，
	#   直接写 event.position 会编译失败 —— 整个场景加载不出来。
	var pos := Vector2.ZERO
	var t := event as InputEventScreenTouch
	if t != null:
		if not t.pressed:
			return
		pos = t.position
	else:
		var mb := event as InputEventMouseButton
		if mb == null:
			return
		if mb.button_index != MOUSE_BUTTON_LEFT or not mb.pressed:
			return
		pos = mb.position
	for i in _btns.size():
		var b := _btns[i]
		if b == null or not b.visible:
			continue
		if b.get_global_rect().has_point(pos):
			_activate(KEYS[i] if i < KEYS.size() else "gear")
			return

## 启动自检：找出可能吞掉点击的全屏控件，打印出来便于排错
func _audit_overlays() -> void:
	# 纯诊断代码，绝不能因为排错逻辑本身出错而影响主流程
	if not is_instance_valid(self):
		return
	var vp := get_viewport().get_visible_rect().size
	print("[MainMenu] 视口 %s，按钮 %d 个" % [vp, _btns.size()])
	for i in _btns.size():
		print("  按钮%d 矩形=%s" % [i, _btns[i].get_global_rect()])
	var found := 0
	for n in get_tree().root.get_children():
		found += _scan_blockers(n, "", vp)
	print("[MainMenu] 可疑全屏拦截控件: %d 个" % found)

## 返回本子树里"全屏且 STOP"的控件数量。
## 这类控件会吞掉它下面所有控件的点击。
func _scan_blockers(n: Node, path: String, vp: Vector2) -> int:
	# n.name 是 StringName，直接和 String 相加在部分版本下会有类型问题
	var p := path + "/" + str(n.name)
	var found := 0
	if n is CanvasLayer:
		var cl := n as CanvasLayer
		if not cl.visible:
			print("  [隐藏层] %s (layer=%d) —— CanvasLayer 继承自 Node，"
					% [p, cl.layer]
					+ "visible=false 只保证不绘制，其下 STOP 控件仍可能吞事件")
	if n is Control:
		var c := n as Control
		var is_btn := false
		for b in _btns:
			if b == c:
				is_btn = true
				break
		if c.mouse_filter == Control.MOUSE_FILTER_STOP and not is_btn \
				and c.get_global_rect().size.x >= vp.x * 0.6:
			var vis := "可见" if c.is_visible_in_tree() else "不可见"
			print("  [拦截?] %s (%s) 矩形=%s" % [p, vis, c.get_global_rect()])
			found += 1
	for ch in n.get_children():
		found += _scan_blockers(ch, p, vp)
	return found

func _toast(msg: String) -> void:
	if _toast_lbl == null or not is_instance_valid(_toast_lbl):
		_toast_lbl = Label.new()
		_toast_lbl.set_anchors_preset(Control.PRESET_CENTER)
		_toast_lbl.position = Vector2(-260, 240)
		_toast_lbl.size = Vector2(520, 80)
		_toast_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_toast_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_toast_lbl.add_theme_font_size_override("font_size", 28)
		_toast_lbl.add_theme_color_override("font_color", Color(1, 0.9, 0.5))
		_toast_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
		_toast_lbl.add_theme_constant_override("outline_size", 8)
		_toast_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(_toast_lbl)
	_toast_lbl.text = msg
	_toast_lbl.modulate.a = 1.0
	var tw := create_tween()
	tw.tween_interval(1.4)
	tw.tween_property(_toast_lbl, "modulate:a", 0.0, 0.4)

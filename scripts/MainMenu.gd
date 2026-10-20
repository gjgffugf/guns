extends Control
## 模式选择页：单人 / 多人 / 开房间（暂为展示），右上角设置按钮。

var _settings: SettingsPanel
var _bg: Control
var _toast_lbl: Label

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_build_bg()
	_build_ui()
	_settings = SettingsPanel.new()
	add_child(_settings)

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
	foot.text = "xfan.games.gun   v0.1.0"
	foot.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	foot.add_theme_font_size_override("font_size", 20)
	foot.add_theme_color_override("font_color", Color(0.42, 0.46, 0.54))
	left.add_child(foot)

	# ---- 右侧：模式按钮 ----
	right.add_child(_mode_button("单 人 模 式", "离线训练场 · 含 1 名战术人机",
			Color(0.72, 0.16, 0.18), func():
		Trans.goto("res://scenes/Game.tscn", "正在载入训练场")
	))
	right.add_child(_mode_button("多 人 模 式", "连接自建服务器 · 联机对战",
			Color(0.16, 0.38, 0.62), func():
		Trans.goto("res://scenes/MultiplayerMenu.tscn", "正在连接配置")
	))
	right.add_child(_mode_button("开 房 间", "功能开发中 · 敬请期待",
			Color(0.24, 0.26, 0.30), func():
		Sfx.play("click")
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
	gear.pressed.connect(func(): _settings.open_panel())
	add_child(gear)

func _mode_button(title: String, desc: String, col: Color, cb: Callable) -> Button:
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

	b.pressed.connect(func():
		Sfx.play("click", 2.0)
		cb.call()
	)
	return b

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

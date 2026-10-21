class_name SettingsPanel
extends CanvasLayer
## 设置弹窗：左侧竖排栏目（通用 / 准星 / 控件 / 关于），右侧内容页。
## 所有可点击按钮统一带白色描边，触控目标也放大过。

const FPS_OPTIONS: Array[int] = [60, 90, 120, 144]

const TABS: Array[String] = ["通用", "准星", "控件", "关于"]

const CROSS_COLORS := [
	Color(0.35, 1.0, 0.45, 0.95), Color(1.0, 1.0, 1.0, 0.95),
	Color(1.0, 0.85, 0.25, 0.95), Color(1.0, 0.30, 0.32, 0.95),
	Color(0.35, 0.72, 1.0, 0.95), Color(0.85, 0.45, 1.0, 0.95),
]

var _panel: PanelContainer
var _pages: Array[Control] = []
var _tab_btns: Array[Button] = []
var _note: Label
var _fps_btns: Array[Button] = []
var _sens: HSlider
var _sens_val: Label
var _vol: HSlider
var _vol_val: Label
var _opening: bool = false

# 准星页
var _cross_preview: Control
var _style_btns: Array[Button] = []
var _len_s: HSlider
var _len_v: Label
var _size_s: HSlider
var _size_v: Label
var _thick_s: HSlider
var _thick_v: Label
var _dot_btn: Button
var _color_btns: Array[Button] = []

# 控件页
var _ed_canvas: Control
var _ed_bar: HBoxContainer
var _ed_size: HSlider
var _ed_alpha: HSlider
var _ed_tip: Label
var _ed_sel: String = ""
var _ed_drag: bool = false
var _ed_off: Vector2 = Vector2.ZERO
var _proxies: Dictionary = {}


func _ready() -> void:
	layer = 60
	visible = false
	_build()

# ------------------------------------------------------------------ 通用样式
## 统一按钮样式：填色 + 白色描边，让可点击区域一眼可辨
func _mk_btn(text: String, col: Color, fs: int = 24) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", fs)
	var n := _sb(col)
	b.add_theme_stylebox_override("normal", n)
	var p := _sb(col.lightened(0.22))
	p.border_color = Color(1, 1, 1, 0.95)
	b.add_theme_stylebox_override("pressed", p)
	var h := _sb(col.lightened(0.12))
	h.border_color = Color(1, 1, 1, 0.9)
	b.add_theme_stylebox_override("hover", h)
	return b

func _sb(col: Color) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = col
	s.set_corner_radius_all(12)
	s.border_width_left = 2
	s.border_width_right = 2
	s.border_width_top = 2
	s.border_width_bottom = 2
	s.border_color = Color(1, 1, 1, 0.55)
	return s

## 圆形控件按钮（准星预设、颜色块）
func _circle_btn(text: String, col: Color, fs: int = 22) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", fs)
	var n := StyleBoxFlat.new()
	n.bg_color = col
	n.set_corner_radius_all(999)
	n.border_width_left = 2
	n.border_width_right = 2
	n.border_width_top = 2
	n.border_width_bottom = 2
	n.border_color = Color(1, 1, 1, 0.6)
	b.add_theme_stylebox_override("normal", n)
	var p := n.duplicate() as StyleBoxFlat
	p.bg_color = col.lightened(0.3)
	p.border_color = Color(1, 1, 1, 1.0)
	b.add_theme_stylebox_override("pressed", p)
	return b

func _lbl(text: String, fs: int = 24, col: Color = Color(0.86, 0.89, 0.94)) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", col)
	return l

func _toggle_btn(text: String, on: bool) -> Button:
	var b := _mk_btn(text, Color(0.18, 0.46, 0.30) if on else Color(0.26, 0.28, 0.33), 22)
	b.set_pressed_no_signal(on)
	return b

# ------------------------------------------------------------------ 构建
func _build() -> void:
	var dim := ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0, 0, 0, 0.62)
	dim.gui_input.connect(func(e):
		if e is InputEventScreenTouch and e.pressed:
			close()
	)
	add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	_panel = PanelContainer.new()
	_panel.custom_minimum_size = Vector2(1040, 640)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.09, 0.10, 0.13, 0.98)
	sb.set_corner_radius_all(18)
	sb.border_width_left = 2
	sb.border_width_right = 2
	sb.border_width_top = 2
	sb.border_width_bottom = 2
	sb.border_color = Color(0.85, 0.25, 0.28, 0.7)
	_panel.add_theme_stylebox_override("panel", sb)
	center.add_child(_panel)

	# ---- 主体：左栏目 + 右内容 ----
	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 14)
	_panel.add_child(body)

	var col := VBoxContainer.new()
	col.custom_minimum_size = Vector2(196, 0)
	col.add_theme_constant_override("separation", 10)
	body.add_child(col)

	var title := _lbl("设置", 30)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(title)
	for i in TABS.size():
		var b := _mk_btn(TABS[i], Color(0.16, 0.18, 0.24), 24)
		b.custom_minimum_size = Vector2(0, 74)
		b.toggle_mode = true
		b.pressed.connect(func(): _select_tab(i))
		col.add_child(b)
		_tab_btns.append(b)
	var sp := Control.new()
	sp.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(sp)
	var close_btn := _mk_btn("关闭", Color(0.30, 0.16, 0.17), 26)
	close_btn.custom_minimum_size = Vector2(0, 68)
	close_btn.pressed.connect(func():
		Sfx.play("click")
		close_panel()
	)
	col.add_child(close_btn)

	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 10)
	body.add_child(right)
	for i in TABS.size():
		var pg := _build_page(i)
		pg.visible = false
		right.add_child(pg)
		_pages.append(pg)
	_select_tab(0)

func _build_page(i: int) -> Control:
	match i:
		1:
			return _build_cross_page()
		2:
			return _build_ctrl_page()
		3:
			return _build_about_page()
	return _build_general_page()

func _select_tab(i: int) -> void:
	for k in _pages.size():
		_pages[k].visible = (k == i)
		_tab_btns[k].set_pressed_no_signal(k == i)
	Sfx.play("click", -8.0)
	if i == 2:
		_rebuild_proxies.call_deferred()

# ------------------------------------------------------------------ 通用页
func _build_general_page() -> Control:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	v.add_child(_lbl("帧率上限", 26))
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 10)
	for f in FPS_OPTIONS:
		var b := _mk_btn(str(f), Color(0.16, 0.18, 0.24), 26)
		b.custom_minimum_size = Vector2(0, 64)
		b.toggle_mode = true
		b.pressed.connect(func(): _set_fps(f))
		grid.add_child(b)
		_fps_btns.append(b)
	v.add_child(grid)

	_note = _lbl("已关闭垂直同步；实际帧率还受屏幕刷新率限制", 18, Color(0.62, 0.68, 0.78))
	_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_note.custom_minimum_size = Vector2(560, 0)
	v.add_child(_note)

	# 灵敏度
	var s_row := HBoxContainer.new()
	s_row.add_theme_constant_override("separation", 12)
	v.add_child(s_row)
	s_row.add_child(_lbl("视角灵敏度", 24))
	_sens_val = _lbl("%.2f" % GameSettings.sensitivity, 22)
	_sens_val.custom_minimum_size = Vector2(90, 0)
	_sens_val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	s_row.add_child(_sens_val)
	_sens = HSlider.new()
	_sens.min_value = 0.2
	_sens.max_value = 2.0
	_sens.step = 0.05
	_sens.custom_minimum_size = Vector2(0, 38)
	_sens.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_sens.value_changed.connect(func(x):
		GameSettings.sensitivity = x
		_sens_val.text = "%.2f" % x
		GameSettings.save_cfg()
	)
	v.add_child(_sens)

	# 音量
	var v_row := HBoxContainer.new()
	v_row.add_theme_constant_override("separation", 12)
	v.add_child(v_row)
	v_row.add_child(_lbl("音量", 24))
	_vol_val = _lbl("%d%%" % int(GameSettings.master_volume * 100), 22)
	_vol_val.custom_minimum_size = Vector2(90, 0)
	_vol_val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	v_row.add_child(_vol_val)
	_vol = HSlider.new()
	_vol.min_value = 0.0
	_vol.max_value = 1.0
	_vol.step = 0.05
	_vol.custom_minimum_size = Vector2(0, 38)
	_vol.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_vol.value_changed.connect(func(x):
		GameSettings.master_volume = x
		_vol_val.text = "%d%%" % int(x * 100)
		AudioServer.set_bus_volume_db(0, linear_to_db(x))
		GameSettings.save_cfg()
	)
	v.add_child(_vol)

	# 开关行
	var tg := HBoxContainer.new()
	tg.add_theme_constant_override("separation", 12)
	v.add_child(tg)
	var b_auto := _mk_btn("摇杆推满自动疾跑", Color(0.18, 0.42, 0.30), 21)
	b_auto.toggle_mode = true
	b_auto.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b_auto.custom_minimum_size = Vector2(0, 62)
	b_auto.set_pressed_no_signal(GameSettings.auto_sprint)
	b_auto.toggled.connect(func(on):
		GameSettings.auto_sprint = on
		GameSettings.save_cfg()
	)
	tg.add_child(b_auto)

	var b_map := _mk_btn("显示小地图", Color(0.18, 0.42, 0.30), 21)
	b_map.toggle_mode = true
	b_map.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b_map.custom_minimum_size = Vector2(0, 62)
	b_map.set_pressed_no_signal(GameSettings.show_minimap)
	b_map.toggled.connect(func(on):
		GameSettings.show_minimap = on
		GameSettings.save_cfg()
	)
	tg.add_child(b_map)

	var b_inv := _mk_btn("反转 Y 轴", Color(0.18, 0.42, 0.30), 21)
	b_inv.toggle_mode = true
	b_inv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b_inv.custom_minimum_size = Vector2(0, 62)
	b_inv.set_pressed_no_signal(GameSettings.invert_y)
	b_inv.toggled.connect(func(on):
		GameSettings.invert_y = on
		GameSettings.save_cfg()
	)
	tg.add_child(b_inv)
	return v

# ------------------------------------------------------------------ 准星页
func _build_cross_page() -> Control:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	# 实时预览
	var pv := PanelContainer.new()
	pv.custom_minimum_size = Vector2(0, 190)
	var psb := StyleBoxFlat.new()
	psb.bg_color = Color(0.16, 0.19, 0.24)
	psb.set_corner_radius_all(12)
	psb.border_width_left = 2
	psb.border_width_right = 2
	psb.border_width_top = 2
	psb.border_width_bottom = 2
	psb.border_color = Color(1, 1, 1, 0.35)
	pv.add_theme_stylebox_override("panel", psb)
	v.add_child(pv)
	_cross_preview = Control.new()
	_cross_preview.custom_minimum_size = Vector2(0, 178)
	_cross_preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cross_preview.draw.connect(_draw_preview)
	pv.add_child(_cross_preview)

	v.add_child(_lbl("预设", 24))
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 10)
	for i in GameSettings.CROSS_NAMES.size():
		var b := _mk_btn(GameSettings.CROSS_NAMES[i], Color(0.16, 0.18, 0.24), 22)
		b.custom_minimum_size = Vector2(0, 62)
		b.toggle_mode = true
		b.pressed.connect(func(): _set_cross_style(i))
		grid.add_child(b)
		_style_btns.append(b)
	v.add_child(grid)

	var a := HBoxContainer.new()
	a.add_theme_constant_override("separation", 12)
	v.add_child(a)
	a.add_child(_lbl("长度", 22))
	_len_s = _slider(2.0, 26.0, 0.5, GameSettings.cross_length, func(x):
		GameSettings.set_cross("len", x)
		_len_v.text = "%.1f" % x
	)
	a.add_child(_len_s)
	_len_v = _lbl("%.1f" % GameSettings.cross_length, 22)
	_len_v.custom_minimum_size = Vector2(70, 0)
	a.add_child(_len_v)

	var b2 := HBoxContainer.new()
	b2.add_theme_constant_override("separation", 12)
	v.add_child(b2)
	b2.add_child(_lbl("大小", 22))
	_size_s = _slider(0.5, 2.0, 0.05, GameSettings.cross_size, func(x):
		GameSettings.set_cross("size", x)
		_size_v.text = "%.2f" % x
	)
	b2.add_child(_size_s)
	_size_v = _lbl("%.2f" % GameSettings.cross_size, 22)
	_size_v.custom_minimum_size = Vector2(70, 0)
	b2.add_child(_size_v)

	var c := HBoxContainer.new()
	c.add_theme_constant_override("separation", 12)
	v.add_child(c)
	c.add_child(_lbl("粗细", 22))
	_thick_s = _slider(1.0, 6.0, 0.25, GameSettings.cross_thick, func(x):
		GameSettings.set_cross("thick", x)
		_thick_v.text = "%.2f" % x
	)
	c.add_child(_thick_s)
	_thick_v = _lbl("%.2f" % GameSettings.cross_thick, 22)
	_thick_v.custom_minimum_size = Vector2(70, 0)
	c.add_child(_thick_v)

	v.add_child(_lbl("颜色", 24))
	var cgrid := GridContainer.new()
	cgrid.columns = 6
	cgrid.add_theme_constant_override("h_separation", 8)
	for col in CROSS_COLORS:
		var b := Button.new()
		b.custom_minimum_size = Vector2(0, 54)
		var n := StyleBoxFlat.new()
		n.bg_color = col
		n.set_corner_radius_all(10)
		n.border_width_left = 3
		n.border_width_right = 3
		n.border_width_top = 3
		n.border_width_bottom = 3
		n.border_color = Color(1, 1, 1, 0.7)
		b.add_theme_stylebox_override("normal", n)
		b.pressed.connect(func(): _set_cross_color(col))
		cgrid.add_child(b)
		_color_btns.append(b)
	v.add_child(cgrid)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	v.add_child(row)
	_dot_btn = _mk_btn("中心点", Color(0.18, 0.42, 0.30), 22)
	_dot_btn.toggle_mode = true
	_dot_btn.custom_minimum_size = Vector2(0, 60)
	_dot_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_dot_btn.set_pressed_no_signal(GameSettings.cross_dot)
	_dot_btn.toggled.connect(func(on):
		GameSettings.set_cross("dot", on)
	)
	row.add_child(_dot_btn)
	var rst := _mk_btn("恢复默认", Color(0.30, 0.20, 0.16), 22)
	rst.custom_minimum_size = Vector2(0, 60)
	rst.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rst.pressed.connect(func():
		GameSettings.reset_cross()
		_sync_cross()
	)
	row.add_child(rst)
	return v

func _slider(mn: float, mx: float, st: float, val: float, cb: Callable) -> HSlider:
	var s := HSlider.new()
	s.min_value = mn
	s.max_value = mx
	s.step = st
	s.value = val
	s.custom_minimum_size = Vector2(0, 34)
	s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	s.value_changed.connect(cb)
	return s

func _set_cross_style(i: int) -> void:
	GameSettings.set_cross("style", i)
	for k in _style_btns.size():
		_style_btns[k].set_pressed_no_signal(k == i)
	_cross_preview.queue_redraw()

func _set_cross_color(c: Color) -> void:
	GameSettings.set_cross("color", c)
	_cross_preview.queue_redraw()

func _sync_cross() -> void:
	_len_s.value = GameSettings.cross_length
	_size_s.value = GameSettings.cross_size
	_thick_s.value = GameSettings.cross_thick
	_len_v.text = "%.1f" % GameSettings.cross_length
	_size_v.text = "%.2f" % GameSettings.cross_size
	_thick_v.text = "%.2f" % GameSettings.cross_thick
	_dot_btn.set_pressed_no_signal(GameSettings.cross_dot)
	for k in _style_btns.size():
		_style_btns[k].set_pressed_no_signal(k == GameSettings.cross_style)
	_cross_preview.queue_redraw()

## 预览绘制逻辑与 HUD 完全一致（散布为 0），所见即所得
func _draw_preview() -> void:
	var c := _cross_preview.size / 2.0
	var s := GameSettings.cross_size
	var gap := GameSettings.cross_gap * s
	var ln := GameSettings.cross_length * s
	var th := GameSettings.cross_thick * s
	var col := GameSettings.cross_color
	match GameSettings.cross_style:
		GameSettings.CrossStyle.DOT:
			_cross_preview.draw_circle(c, maxf(1.5, th), col)
		GameSettings.CrossStyle.CIRCLE:
			_cross_preview.draw_arc(c, maxf(4.0, ln), 0, TAU, 40, col, th)
			if GameSettings.cross_dot:
				_cross_preview.draw_circle(c, maxf(1.2, th * 0.6), col)
		GameSettings.CrossStyle.CROSS:
			_cross_preview.draw_line(c + Vector2(-gap - ln, 0), c + Vector2(gap + ln, 0), col, th)
			_cross_preview.draw_line(c + Vector2(0, -gap - ln), c + Vector2(0, gap + ln), col, th)
			if GameSettings.cross_dot:
				_cross_preview.draw_circle(c, maxf(1.2, th * 0.6), col)
		_:
			var dirs: Array[Vector2] = [Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1)]
			for d: Vector2 in dirs:
				_cross_preview.draw_line(c + d * gap, c + d * (gap + ln), col, th)
			if GameSettings.cross_dot:
				_cross_preview.draw_circle(c, maxf(1.2, th * 0.6), col)

# ------------------------------------------------------------------ 控件页
func _build_ctrl_page() -> Control:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.size_flags_vertical = Control.SIZE_EXPAND_FILL

	# 顶部控制栏
	_ed_bar = HBoxContainer.new()
	_ed_bar.add_theme_constant_override("separation", 10)
	v.add_child(_ed_bar)

	var save_btn := _mk_btn("保存", Color(0.16, 0.44, 0.28), 22)
	save_btn.custom_minimum_size = Vector2(120, 58)
	save_btn.pressed.connect(func():
		GameSettings.save_cfg()
		Sfx.play("click")
		_ed_tip.text = "已保存"
	)
	_ed_bar.add_child(save_btn)

	var rst_btn := _mk_btn("复位", Color(0.30, 0.20, 0.16), 22)
	rst_btn.custom_minimum_size = Vector2(110, 58)
	rst_btn.pressed.connect(func():
		TouchLayout.reset_all()
		_rebuild_proxies()
		_ed_tip.text = "已复位，记得点保存"
	)
	_ed_bar.add_child(rst_btn)

	_ed_bar.add_child(_lbl("大小", 20))
	_ed_size = HSlider.new()
	_ed_size.min_value = 0.6
	_ed_size.max_value = 1.8
	_ed_size.step = 0.05
	_ed_size.value = 1.0
	_ed_size.custom_minimum_size = Vector2(200, 34)
	_ed_size.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ed_size.value_changed.connect(func(x):
		if _ed_sel == "":
			return
		var d := GameSettings.get_ctrl(_ed_sel)
		d["s"] = x
		GameSettings.set_ctrl(_ed_sel, d)
		_place_proxy(_ed_sel)
	)
	_ed_bar.add_child(_ed_size)

	_ed_bar.add_child(_lbl("透明度", 20))
	_ed_alpha = HSlider.new()
	_ed_alpha.min_value = 0.25
	_ed_alpha.max_value = 1.0
	_ed_alpha.step = 0.05
	_ed_alpha.value = 0.92
	_ed_alpha.custom_minimum_size = Vector2(200, 34)
	_ed_alpha.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ed_alpha.value_changed.connect(func(x):
		if _ed_sel == "":
			return
		var d := GameSettings.get_ctrl(_ed_sel)
		d["a"] = x
		GameSettings.set_ctrl(_ed_sel, d)
		_place_proxy(_ed_sel)
	)
	_ed_bar.add_child(_ed_alpha)

	_ed_tip = _lbl("拖动摆放，点击选中后可调大小与透明度", 19, Color(0.75, 0.80, 0.88))
	_ed_tip.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(_ed_tip)

	# 预览画布：比例就是屏幕，拖出来的位置与实战一致
	var holder := PanelContainer.new()
	holder.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var hsb := StyleBoxFlat.new()
	hsb.bg_color = Color(0.13, 0.15, 0.19)
	hsb.set_corner_radius_all(12)
	hsb.border_width_left = 2
	hsb.border_width_right = 2
	hsb.border_width_top = 2
	hsb.border_width_bottom = 2
	hsb.border_color = Color(1, 1, 1, 0.3)
	holder.add_theme_stylebox_override("panel", hsb)
	v.add_child(holder)

	_ed_canvas = Control.new()
	_ed_canvas.custom_minimum_size = Vector2(0, 330)
	_ed_canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	holder.add_child(_ed_canvas)
	return v

func _rebuild_proxies() -> void:
	if _ed_canvas == null:
		return
	for c in _ed_canvas.get_children():
		c.queue_free()
	_proxies.clear()
	for k in GameSettings.CONTROL_KEYS:
		var b := Button.new()
		b.text = str(GameSettings.CONTROL_NAMES.get(k, k))
		b.add_theme_font_size_override("font_size", 20)
		var n := StyleBoxFlat.new()
		n.bg_color = Color(0.22, 0.34, 0.48, 0.95)
		n.set_corner_radius_all(14)
		n.border_width_left = 2
		n.border_width_right = 2
		n.border_width_top = 2
		n.border_width_bottom = 2
		n.border_color = Color(1, 1, 1, 0.55)
		b.add_theme_stylebox_override("normal", n)
		var sel := n.duplicate() as StyleBoxFlat
		sel.bg_color = Color(0.90, 0.30, 0.28, 0.95)
		sel.border_color = Color(1, 1, 1, 1.0)
		b.add_theme_stylebox_override("pressed", sel)
		b.gui_input.connect(func(e): _proxy_input(k, e))
		_ed_canvas.add_child(b)
		_proxies[k] = b
		_place_proxy(k)

func _proxy_input(k: String, e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		if e.pressed:
			_ed_sel = k
			_ed_drag = true
			_ed_off = e.position
			var d := GameSettings.get_ctrl(k)
			_ed_size.value = float(d["s"])
			_ed_alpha.value = float(d["a"])
			_ed_tip.text = "已选中：%s" % str(GameSettings.CONTROL_NAMES.get(k, k))
			_highlight()
		else:
			_ed_drag = false
	elif e is InputEventScreenDrag and _ed_drag and _ed_sel == k:
		var sz := _ed_canvas.size
		if sz.x <= 0.0 or sz.y <= 0.0:
			return
		var d := GameSettings.get_ctrl(k)
		d["x"] = clampf(float(d["x"]) + (e.position.x - _ed_off.x) / sz.x, 0.03, 0.97)
		d["y"] = clampf(float(d["y"]) + (e.position.y - _ed_off.y) / sz.y, 0.04, 0.96)
		_ed_off = e.position
		GameSettings.set_ctrl(k, d)
		_place_proxy(k)
	elif e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
		if e.pressed:
			_ed_sel = k
			_ed_drag = true
			_ed_off = e.position
			var d := GameSettings.get_ctrl(k)
			_ed_size.value = float(d["s"])
			_ed_alpha.value = float(d["a"])
			_ed_tip.text = "已选中：%s" % str(GameSettings.CONTROL_NAMES.get(k, k))
			_highlight()
		else:
			_ed_drag = false
	elif e is InputEventMouseMotion and _ed_drag and _ed_sel == k:
		var sz := _ed_canvas.size
		if sz.x <= 0.0 or sz.y <= 0.0:
			return
		var d := GameSettings.get_ctrl(k)
		d["x"] = clampf(float(d["x"]) + (e.position.x - _ed_off.x) / sz.x, 0.03, 0.97)
		d["y"] = clampf(float(d["y"]) + (e.position.y - _ed_off.y) / sz.y, 0.04, 0.96)
		_ed_off = e.position
		GameSettings.set_ctrl(k, d)
		_place_proxy(k)

## 把代理按钮摆到存档位置（画布坐标 = 屏幕比例）
func _place_proxy(k: String) -> void:
	if not _proxies.has(k):
		return
	var b: Button = _proxies[k]
	var sz := _ed_canvas.size
	if sz.x <= 0.0:
		return
	var u := minf(sz.x / 1280.0, sz.y / 720.0)
	var d := GameSettings.get_ctrl(k)
	var base: Vector2 = TouchLayout.BASE_SIZE.get(k, Vector2(96, 96))
	var s := base * u * float(d["s"])
	b.size = s
	b.position = Vector2(float(d["x"]) * sz.x, float(d["y"]) * sz.y) - s / 2.0
	b.modulate.a = clampf(float(d["a"]), 0.25, 1.0)

func _highlight() -> void:
	for k in _proxies:
		var b: Button = _proxies[k]
		var n := StyleBoxFlat.new()
		n.set_corner_radius_all(14)
		n.border_width_left = 2
		n.border_width_right = 2
		n.border_width_top = 2
		n.border_width_bottom = 2
		if k == _ed_sel:
			n.bg_color = Color(0.90, 0.30, 0.28, 0.95)
			n.border_color = Color(1, 1, 1, 1.0)
		else:
			n.bg_color = Color(0.22, 0.34, 0.48, 0.95)
			n.border_color = Color(1, 1, 1, 0.55)
		b.add_theme_stylebox_override("normal", n)

# ------------------------------------------------------------------ 关于页
func _build_about_page() -> Control:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(112, 112)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	if ResourceLoader.exists("res://icon.png"):
		icon.texture = load("res://icon.png") as Texture2D
	var ibox := CenterContainer.new()
	ibox.add_child(icon)
	v.add_child(ibox)

	var nm := _lbl(GameSettings.APP_NAME, 34)
	nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(nm)

	var ver := _lbl("版本 v%s" % GameSettings.CURRENT_VERSION, 24, Color(0.75, 0.82, 0.92))
	ver.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(ver)

	var pkg := _lbl("包名 %s" % GameSettings.PACKAGE_NAME, 20, Color(0.58, 0.63, 0.72))
	pkg.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(pkg)

	var intro := _lbl(GameSettings.ABOUT_INTRO, 21, Color(0.80, 0.84, 0.90))
	intro.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	intro.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	intro.custom_minimum_size = Vector2(720, 0)
	v.add_child(intro)
	for line in GameSettings.ABOUT_LINES:
		var l := _lbl(str(line), 20, Color(0.66, 0.71, 0.80))
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.custom_minimum_size = Vector2(720, 0)
		v.add_child(l)

	var sp := Control.new()
	sp.custom_minimum_size = Vector2(0, 8)
	v.add_child(sp)

	var btn := _mk_btn("检查更新", Color(0.16, 0.40, 0.62), 26)
	btn.custom_minimum_size = Vector2(0, 66)
	btn.pressed.connect(func():
		Sfx.play("click")
		Updater.check(false)
	)
	v.add_child(btn)

	var hint := _lbl("云端版本地址在 scripts/GameSettings.gd 的 UPDATE_JSON_URL", 18,
			Color(0.58, 0.63, 0.72))
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(hint)
	return v

# ------------------------------------------------------------------ 开合
func open_panel() -> void:
	if _opening:
		return
	_opening = true
	Sfx.play("click")
	for i in _fps_btns.size():
		_fps_btns[i].set_pressed_no_signal(FPS_OPTIONS[i] == GameSettings.target_fps)
	_sens.value = GameSettings.sensitivity
	_sens_val.text = "%.2f" % GameSettings.sensitivity
	_vol.value = GameSettings.master_volume
	_vol_val.text = "%d%%" % int(GameSettings.master_volume * 100)
	_sync_cross()
	visible = true
	_panel.scale = Vector2(0.9, 0.9)
	_panel.modulate.a = 0.0
	_panel.pivot_offset = _panel.size / 2.0
	var tw := create_tween()
	tw.set_parallel(true)
	tw.tween_property(_panel, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(_panel, "modulate:a", 1.0, 0.18)
	_opening = false

func close() -> void:
	close_panel()

func close_panel() -> void:
	if not visible:
		return
	GameSettings.save_cfg()
	var tw := create_tween()
	tw.set_parallel(true)
	tw.tween_property(_panel, "scale", Vector2(0.92, 0.92), 0.16)
	tw.tween_property(_panel, "modulate:a", 0.0, 0.16)
	tw.tween_callback(func(): visible = false)

func _set_fps(f: int) -> void:
	GameSettings.apply_fps(f)
	for i in _fps_btns.size():
		_fps_btns[i].set_pressed_no_signal(FPS_OPTIONS[i] == f)
	if _note != null:
		var hz := DisplayServer.screen_get_refresh_rate()
		if hz > 0.0:
			_note.text = "已关闭垂直同步；当前屏幕刷新率 %.0fHz，实际帧率不会超过它" % hz
		else:
			_note.text = "已关闭垂直同步"
	Sfx.play("click", -8.0)

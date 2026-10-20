class_name SettingsPanel
extends CanvasLayer
## 设置弹窗：帧率上限（60/90/120/144）、视角灵敏度、音量。带弹出动画。

const FPS_OPTIONS: Array[int] = [60, 90, 120, 144]

var _panel: PanelContainer
var _fps_btns: Array[Button] = []
var _sens: HSlider
var _vol: HSlider
var _sens_val: Label
var _vol_val: Label
var _note: Label
var _opening: bool = false

func _ready() -> void:
	layer = 60
	visible = false
	_build()

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
	_panel.custom_minimum_size = Vector2(600, 0)
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

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 16)
	_panel.add_child(v)

	var title := Label.new()
	title.text = "设置"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 36)
	v.add_child(title)

	# ---- 帧率 ----
	var f_lbl := Label.new()
	f_lbl.text = "帧率上限"
	f_lbl.add_theme_font_size_override("font_size", 26)
	v.add_child(f_lbl)

	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 10)
	v.add_child(grid)
	for f in FPS_OPTIONS:
		var b := Button.new()
		b.text = str(f)
		b.custom_minimum_size = Vector2(0, 74)
		b.add_theme_font_size_override("font_size", 26)
		b.pressed.connect(func(): _set_fps(f))
		b.toggle_mode = true
		grid.add_child(b)
		_fps_btns.append(b)

	_note = Label.new()
	_note.text = "已关闭垂直同步，帧率上限由屏幕刷新率决定"
	_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_note.add_theme_font_size_override("font_size", 19)
	_note.add_theme_color_override("font_color", Color(0.65, 0.7, 0.8))
	_note.custom_minimum_size = Vector2(560, 0)
	v.add_child(_note)

	# ---- 灵敏度 ----
	var s_row := HBoxContainer.new()
	v.add_child(s_row)
	var s_lbl := Label.new()
	s_lbl.text = "视角灵敏度"
	s_lbl.add_theme_font_size_override("font_size", 26)
	s_row.add_child(s_lbl)
	_sens_val = Label.new()
	_sens_val.add_theme_font_size_override("font_size", 24)
	_sens_val.custom_minimum_size = Vector2(90, 0)
	_sens_val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	s_row.add_child(_sens_val)
	_sens = HSlider.new()
	_sens.min_value = 0.3
	_sens.max_value = 3.0
	_sens.step = 0.05
	_sens.custom_minimum_size = Vector2(0, 40)
	_sens.value_changed.connect(func(v_):
		GameSettings.sensitivity = v_
		_sens_val.text = "%.2f" % v_
		GameSettings.save_cfg()
	)
	v.add_child(_sens)

	# ---- 音量 ----
	var v_row := HBoxContainer.new()
	v.add_child(v_row)
	var v_lbl := Label.new()
	v_lbl.text = "音量"
	v_lbl.add_theme_font_size_override("font_size", 26)
	v_row.add_child(v_lbl)
	_vol_val = Label.new()
	_vol_val.add_theme_font_size_override("font_size", 24)
	_vol_val.custom_minimum_size = Vector2(90, 0)
	_vol_val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	v_row.add_child(_vol_val)
	_vol = HSlider.new()
	_vol.min_value = 0.0
	_vol.max_value = 1.0
	_vol.step = 0.05
	_vol.custom_minimum_size = Vector2(0, 40)
	_vol.value_changed.connect(func(v_):
		GameSettings.master_volume = v_
		_vol_val.text = "%d%%" % int(v_ * 100)
		AudioServer.set_bus_volume_db(0, linear_to_db(v_))
		GameSettings.save_cfg()
	)
	v.add_child(_vol)

	var close := Button.new()
	close.text = "关闭"
	close.custom_minimum_size = Vector2(0, 76)
	close.add_theme_font_size_override("font_size", 28)
	close.pressed.connect(func():
		Sfx.play("click")
		close_panel()
	)
	v.add_child(close)

func open_panel() -> void:
	if _opening:
		return
	_opening = true
	Sfx.play("click")
	for i in _fps_btns.size():
		_fps_btns[i].button_pressed = (FPS_OPTIONS[i] == GameSettings.target_fps)
	_sens.value = GameSettings.sensitivity
	_sens_val.text = "%.2f" % GameSettings.sensitivity
	_vol.value = GameSettings.master_volume
	_vol_val.text = "%d%%" % int(GameSettings.master_volume * 100)
	visible = true
	_panel.scale = Vector2(0.86, 0.86)
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
	var tw := create_tween()
	tw.set_parallel(true)
	tw.tween_property(_panel, "scale", Vector2(0.9, 0.9), 0.16)
	tw.tween_property(_panel, "modulate:a", 0.0, 0.16)
	tw.tween_callback(func(): visible = false)

func _set_fps(f: int) -> void:
	Sfx.play("click", 2.0)
	GameSettings.apply_fps(f)
	for i in _fps_btns.size():
		_fps_btns[i].button_pressed = (FPS_OPTIONS[i] == f)
	_note.text = "已设为 %d FPS · 若屏幕仅 %dHz，实际帧率以屏幕为准" % [f, _screen_hz()]

func _screen_hz() -> int:
	var hz := int(DisplayServer.screen_get_refresh_rate())
	if hz <= 0:
		hz = 60
	return hz

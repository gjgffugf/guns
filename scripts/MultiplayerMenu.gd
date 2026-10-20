extends Control
## 多人模式入口：填写服务器地址 / 端口 / 昵称，连接成功后进入联机战场。

var _host: LineEdit
var _port: LineEdit
var _name: LineEdit
var _status: Label
var _btn: Button
var _settings: SettingsPanel

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_build_bg()
	_build_ui()
	_settings = SettingsPanel.new()
	add_child(_settings)
	Net.connected_ok.connect(_on_ok)
	Net.connect_failed.connect(_on_fail)

func _exit_tree() -> void:
	if Net.connected_ok.is_connected(_on_ok):
		Net.connected_ok.disconnect(_on_ok)
	if Net.connect_failed.is_connected(_on_fail):
		Net.connect_failed.disconnect(_on_fail)

func _build_bg() -> void:
	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = Color(0.04, 0.05, 0.07)
	add_child(bg)
	var g := Control.new()
	g.set_anchors_preset(Control.PRESET_FULL_RECT)
	g.mouse_filter = Control.MOUSE_FILTER_IGNORE
	g.draw.connect(func():
		var step := 56.0
		var x := 0.0
		while x < g.size.x:
			g.draw_line(Vector2(x, 0), Vector2(x, g.size.y), Color(0.14, 0.2, 0.3, 0.4))
			x += step
		var y := 0.0
		while y < g.size.y:
			g.draw_line(Vector2(0, y), Vector2(g.size.x, y), Color(0.14, 0.2, 0.3, 0.4))
			y += step
	)
	add_child(g)

func _field(label: String, value: String, hint: String) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	var l := Label.new()
	l.text = label
	l.add_theme_font_size_override("font_size", 24)
	l.add_theme_color_override("font_color", Color(0.7, 0.78, 0.9))
	v.add_child(l)
	var e := LineEdit.new()
	e.text = value
	e.placeholder_text = hint
	e.custom_minimum_size = Vector2(0, 82)
	e.add_theme_font_size_override("font_size", 28)
	v.add_child(e)
	return v

func _build_ui() -> void:
	var root := VBoxContainer.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.offset_left = 44
	root.offset_right = -44
	root.offset_top = 110
	root.offset_bottom = -60
	root.add_theme_constant_override("separation", 22)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	var title := Label.new()
	title.text = "多人联机"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 56)
	title.add_theme_color_override("font_outline_color", Color(0.1, 0.4, 0.7))
	title.add_theme_constant_override("outline_size", 10)
	root.add_child(title)

	var tip := Label.new()
	tip.text = "服务器由 server/server.py 启动，支持电脑与 Termux"
	tip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tip.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tip.add_theme_font_size_override("font_size", 21)
	tip.add_theme_color_override("font_color", Color(0.6, 0.66, 0.76))
	root.add_child(tip)

	var sp := Control.new()
	sp.custom_minimum_size = Vector2(0, 34)
	root.add_child(sp)

	var host_box := _field("服务器地址", GameSettings.server_addr, "例如 192.168.1.10")
	root.add_child(host_box)
	_host = host_box.get_child(1) as LineEdit

	var port_box := _field("端口", str(GameSettings.server_port), "19000")
	root.add_child(port_box)
	_port = port_box.get_child(1) as LineEdit

	var name_box := _field("昵称", GameSettings.player_name, "战场代号")
	root.add_child(name_box)
	_name = name_box.get_child(1) as LineEdit

	_status = Label.new()
	_status.text = ""
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.add_theme_font_size_override("font_size", 23)
	_status.add_theme_color_override("font_color", Color(1.0, 0.8, 0.4))
	_status.custom_minimum_size = Vector2(0, 60)
	root.add_child(_status)

	_btn = Button.new()
	_btn.text = "连 接 服 务 器"
	_btn.custom_minimum_size = Vector2(0, 118)
	_btn.add_theme_font_size_override("font_size", 36)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.15, 0.42, 0.28)
	sb.set_corner_radius_all(14)
	_btn.add_theme_stylebox_override("normal", sb)
	var pb := sb.duplicate() as StyleBoxFlat
	pb.bg_color = Color(0.22, 0.58, 0.38)
	_btn.add_theme_stylebox_override("pressed", pb)
	_btn.pressed.connect(_do_connect)
	root.add_child(_btn)

	var back := Button.new()
	back.text = "返回"
	back.custom_minimum_size = Vector2(0, 92)
	back.add_theme_font_size_override("font_size", 28)
	var bsb := StyleBoxFlat.new()
	bsb.bg_color = Color(0.22, 0.24, 0.28)
	bsb.set_corner_radius_all(14)
	back.add_theme_stylebox_override("normal", bsb)
	back.pressed.connect(func():
		Sfx.play("click")
		Trans.goto("res://scenes/MainMenu.tscn")
	)
	root.add_child(back)

	# 右上角设置
	var gear := Button.new()
	gear.text = "设置"
	gear.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	gear.position = Vector2(-150, 24)
	gear.size = Vector2(126, 68)
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
	gear.pressed.connect(func(): _settings.open_panel())
	add_child(gear)

func _do_connect() -> void:
	var host := _host.text.strip_edges()
	var port := int(_port.text.strip_edges())
	var nm := _name.text.strip_edges()
	if nm == "":
		nm = "无名氏"
	if host == "" or port <= 0 or port > 65535:
		_status.text = "地址或端口不合法"
		return
	GameSettings.set_server(host, port)
	GameSettings.set_player_name(nm)
	_btn.disabled = true
	_status.text = "正在连接 %s:%d ..." % [host, port]
	Sfx.play("click")
	Net.connect_to_server(host, port, nm)

func _on_ok() -> void:
	_status.text = "连接成功，进入战场"
	Trans.goto("res://scenes/MultiplayerGame.tscn", "正在同步战场")

func _on_fail(reason: String) -> void:
	_btn.disabled = false
	_status.text = "连接失败：" + reason

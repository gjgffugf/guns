extends Control
## 多人联机：服务器列表。
## 不再直连，先把服务器加进列表；列表每行显示延迟与在线 / 上限人数，
## 选中后下方出现该服务器的可用操作（连接 / 刷新 / 编辑 / 删除 / 设为默认）。

var _settings: SettingsPanel
var _name_edit: LineEdit
var _host_edit: LineEdit
var _port_edit: LineEdit
var _srv_name_edit: LineEdit
var _add_btn: Button
var _list_box: VBoxContainer
var _scroll: ScrollContainer
var _status: Label
var _btn_connect: Button

var _sel: int = -1
var _editing: int = -1
var _rows: Array[Control] = []
var _busy: bool = false

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_build_bg()
	_build_ui()
	_settings = SettingsPanel.new()
	add_child(_settings)
	_rebuild_list()

func _build_bg() -> void:
	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = Color(0.035, 0.04, 0.055)
	add_child(bg)
	var g := Control.new()
	g.set_anchors_preset(Control.PRESET_FULL_RECT)
	g.mouse_filter = Control.MOUSE_FILTER_IGNORE
	g.draw.connect(func():
		var s := g.size
		var x := 0.0
		while x < s.x:
			g.draw_line(Vector2(x, 0), Vector2(x, s.y), Color(0.16, 0.20, 0.28, 0.32), 1.0)
			x += 56.0
		var y := 0.0
		while y < s.y:
			g.draw_line(Vector2(0, y), Vector2(s.x, y), Color(0.16, 0.20, 0.28, 0.32), 1.0)
			y += 56.0
	)
	add_child(g)

# ------------------------------------------------------------------ 样式
func _mk_btn(text: String, col: Color, fs: int = 24) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", fs)
	var n := StyleBoxFlat.new()
	n.bg_color = col
	n.set_corner_radius_all(12)
	n.border_width_left = 2
	n.border_width_right = 2
	n.border_width_top = 2
	n.border_width_bottom = 2
	n.border_color = Color(1, 1, 1, 0.55)
	b.add_theme_stylebox_override("normal", n)
	var p := n.duplicate() as StyleBoxFlat
	p.bg_color = col.lightened(0.25)
	p.border_color = Color(1, 1, 1, 0.95)
	b.add_theme_stylebox_override("pressed", p)
	return b

func _lbl(t: String, fs: int = 22, c: Color = Color(0.78, 0.83, 0.90)) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", c)
	return l

func _field(label: String, value: String, hint: String) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_child(_lbl(label, 20, Color(0.62, 0.68, 0.78)))
	var e := LineEdit.new()
	e.text = value
	e.placeholder_text = hint
	e.custom_minimum_size = Vector2(0, 62)
	e.add_theme_font_size_override("font_size", 24)
	e.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_child(e)
	return v

# ------------------------------------------------------------------ 界面
func _build_ui() -> void:
	var root := VBoxContainer.new()
	root.anchor_left = 0.04
	root.anchor_top = 0.08
	root.anchor_right = 0.96
	root.anchor_bottom = 0.94
	root.add_theme_constant_override("separation", 14)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	var title := _lbl("多人联机", 44, Color(0.92, 0.94, 0.98))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(title)

	# 第一行：昵称 + 添加服务器
	var row1 := HBoxContainer.new()
	row1.add_theme_constant_override("separation", 14)
	root.add_child(row1)
	var nb := _field("昵称", GameSettings.player_name, "战场代号")
	row1.add_child(nb)
	_name_edit = nb.get_child(1) as LineEdit
	var sb := _field("服务器名称", "我的服务器", "便于辨认")
	row1.add_child(sb)
	_srv_name_edit = sb.get_child(1) as LineEdit
	var hb := _field("地址", "192.168.1.10", "域名或 IP")
	row1.add_child(hb)
	_host_edit = hb.get_child(1) as LineEdit
	var pb := _field("端口", str(GameSettings.server_port), "19000")
	pb.custom_minimum_size = Vector2(180, 0)
	row1.add_child(pb)
	_port_edit = pb.get_child(1) as LineEdit

	var row1b := HBoxContainer.new()
	row1b.add_theme_constant_override("separation", 14)
	root.add_child(row1b)
	_add_btn = _mk_btn("添加服务器", Color(0.16, 0.42, 0.62), 24)
	_add_btn.custom_minimum_size = Vector2(0, 62)
	_add_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_add_btn.pressed.connect(_on_add)
	row1b.add_child(_add_btn)

	# 服务器列表
	_scroll = ScrollContainer.new()
	_scroll.custom_minimum_size = Vector2(0, 236)
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(_scroll)
	_list_box = VBoxContainer.new()
	_list_box.add_theme_constant_override("separation", 8)
	_list_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_list_box)

	# 选中后的操作按钮
	var acts := HBoxContainer.new()
	acts.add_theme_constant_override("separation", 10)
	root.add_child(acts)
	_btn_connect = _mk_btn("连接", Color(0.15, 0.46, 0.28), 24)
	_btn_connect.custom_minimum_size = Vector2(0, 64)
	_btn_connect.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_btn_connect.pressed.connect(_do_connect)
	acts.add_child(_btn_connect)
	var b_ref := _mk_btn("刷新延迟", Color(0.18, 0.34, 0.48), 22)
	b_ref.custom_minimum_size = Vector2(0, 64)
	b_ref.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b_ref.pressed.connect(func():
		Sfx.play("click")
		_refresh_all())
	acts.add_child(b_ref)
	var b_ed := _mk_btn("编辑", Color(0.30, 0.30, 0.36), 22)
	b_ed.custom_minimum_size = Vector2(0, 64)
	b_ed.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b_ed.pressed.connect(_on_edit)
	acts.add_child(b_ed)
	var b_del := _mk_btn("删除", Color(0.44, 0.18, 0.18), 22)
	b_del.custom_minimum_size = Vector2(0, 64)
	b_del.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b_del.pressed.connect(_on_del)
	acts.add_child(b_del)

	# 自定义人物贴图：在服务器操作区下方
	var skin_row := HBoxContainer.new()
	skin_row.add_theme_constant_override("separation", 10)
	root.add_child(skin_row)
	var b_skin := _mk_btn("自定义人物贴图", Color(0.26, 0.24, 0.40), 22)
	b_skin.custom_minimum_size = Vector2(0, 62)
	b_skin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b_skin.pressed.connect(_open_skin_picker)
	skin_row.add_child(b_skin)
	var b_skin_rst := _mk_btn("还原白模", Color(0.30, 0.24, 0.22), 22)
	b_skin_rst.custom_minimum_size = Vector2(0, 62)
	b_skin_rst.pressed.connect(func():
		GameSettings.skin_path = ""
		GameSettings.save_cfg()
		ModelFactory.reload_skin()
		_status.text = "已还原为白色火柴人"
		Sfx.play("click")
	)
	skin_row.add_child(b_skin_rst)

	_status = _lbl("", 21, Color(1.0, 0.82, 0.42))
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.custom_minimum_size = Vector2(0, 40)
	root.add_child(_status)

	var back := _mk_btn("返回", Color(0.24, 0.26, 0.30), 26)
	back.custom_minimum_size = Vector2(0, 62)
	back.pressed.connect(func():
		Sfx.play("click")
		Trans.goto("res://scenes/MainMenu.tscn")
	)
	root.add_child(back)

	# 右上角设置
	var gear := _mk_btn("设置", Color(0.14, 0.16, 0.22), 24)
	gear.anchor_left = 1.0
	gear.anchor_top = 0.0
	gear.anchor_right = 1.0
	gear.anchor_bottom = 0.0
	gear.offset_left = -150.0
	gear.offset_top = 22.0
	gear.offset_right = -22.0
	gear.offset_bottom = 88.0
	gear.pressed.connect(func(): _settings.open_panel())
	add_child(gear)

# ------------------------------------------------------------------ 列表
func _rebuild_list() -> void:
	if _list_box == null:
		return
	for c in _list_box.get_children():
		c.queue_free()
	_rows.clear()
	if GameSettings.servers.is_empty():
		var tip := _lbl("还没有服务器，用上面的表单添加一个", 22, Color(0.6, 0.65, 0.74))
		tip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		tip.custom_minimum_size = Vector2(0, 120)
		_list_box.add_child(tip)
		return
	for i in GameSettings.servers.size():
		_list_box.add_child(_make_row(i))
	_highlight()

func _make_row(i: int) -> Control:
	var d: Dictionary = GameSettings.servers[i]
	var row := Button.new()
	row.custom_minimum_size = Vector2(0, 68)
	row.add_theme_font_size_override("font_size", 22)
	var n := StyleBoxFlat.new()
	n.bg_color = Color(0.15, 0.17, 0.22)
	n.set_corner_radius_all(10)
	n.border_width_left = 2
	n.border_width_right = 2
	n.border_width_top = 2
	n.border_width_bottom = 2
	n.border_color = Color(1, 1, 1, 0.35)
	row.add_theme_stylebox_override("normal", n)
	row.text = "%s   %s:%d" % [str(d.get("name", "服务器")), str(d.get("addr", "")),
			int(d.get("port", 19000))]
	row.pressed.connect(func(): _select(i))
	_rows.append(row)
	return row

## 每行右侧的延迟 / 人数靠一个覆盖层画出来，避免文字被按钮吞掉
func _paint_rows() -> void:
	for i in _rows.size():
		var b: Button = _rows[i]
		var info: Dictionary = _info_of(i)
		var ping := int(info.get("ping", -1))
		var online := int(info.get("online", -1))
		var mx := int(info.get("max", -1))
		var tail := ""
		if ping >= 0:
			tail += "  %dms" % ping
		if online >= 0:
			tail += "  %d/%d人" % [online, mx if mx > 0 else 0]
		if tail == "":
			tail = "  未检测"
		var d: Dictionary = GameSettings.servers[i]
		b.text = "%s   %s:%d%s" % [str(d.get("name", "服务器")), str(d.get("addr", "")),
				int(d.get("port", 19000)), tail]

func _info_of(i: int) -> Dictionary:
	if i < _rows.size() and _rows[i].has_meta("info"):
		return _rows[i].get_meta("info") as Dictionary
	return {}

func _select(i: int) -> void:
	_sel = i
	Sfx.play("click", -8.0)
	_highlight()

func _highlight() -> void:
	for i in _rows.size():
		var b: Button = _rows[i]
		var n := StyleBoxFlat.new()
		n.set_corner_radius_all(10)
		n.border_width_left = 2
		n.border_width_right = 2
		n.border_width_top = 2
		n.border_width_bottom = 2
		if i == _sel:
			n.bg_color = Color(0.20, 0.36, 0.30)
			n.border_color = Color(1, 1, 1, 0.95)
		else:
			n.bg_color = Color(0.15, 0.17, 0.22)
			n.border_color = Color(1, 1, 1, 0.35)
		b.add_theme_stylebox_override("normal", n)
	_btn_connect.disabled = (_sel < 0)

# ------------------------------------------------------------------ 增删改
func _on_add() -> void:
	var nm := _srv_name_edit.text.strip_edges()
	var host := _host_edit.text.strip_edges()
	var port := int(_port_edit.text.strip_edges())
	if host == "" or port <= 0 or port > 65535:
		_status.text = "地址或端口不合法"
		return
	if nm == "":
		nm = host
	Sfx.play("click")
	if _editing >= 0:
		GameSettings.set_server_at(_editing, nm, host, port)
		_status.text = "已保存修改"
		_editing = -1
		_add_btn.text = "添加服务器"
	else:
		GameSettings.add_server(nm, host, port)
		_sel = GameSettings.servers.size() - 1
		_status.text = "已添加，点「刷新延迟」可测速"
	_rebuild_list()
	_refresh_all()

func _on_edit() -> void:
	if _sel < 0:
		_status.text = "先选中一个服务器"
		return
	var d: Dictionary = GameSettings.servers[_sel]
	_srv_name_edit.text = str(d.get("name", ""))
	_host_edit.text = str(d.get("addr", ""))
	_port_edit.text = str(int(d.get("port", 19000)))
	_editing = _sel
	_add_btn.text = "保存修改"
	_status.text = "修改后点「保存修改」"
	Sfx.play("click")

func _on_del() -> void:
	if _sel < 0:
		_status.text = "先选中一个服务器"
		return
	GameSettings.remove_server(_sel)
	_sel = -1
	_editing = -1
	_add_btn.text = "添加服务器"
	Sfx.play("click")
	_rebuild_list()
	_status.text = "已删除"

# ------------------------------------------------------------------ 延迟 / 人数
func _refresh_all() -> void:
	if _busy:
		return
	_busy = true
	_status.text = "正在检测…"
	for i in GameSettings.servers.size():
		var r := await _query(i)
		if i < _rows.size():
			_rows[i].set_meta("info", r)
	_paint_rows()
	_status.text = "检测完成"
	_busy = false

## 向服务器发一个 query 包，拿到在线人数与往返延迟
func _query(i: int) -> Dictionary:
	var d: Dictionary = GameSettings.servers[i]
	var host := str(d.get("addr", ""))
	var port := int(d.get("port", 19000))
	if host == "":
		return {"ping": -1, "online": -1, "max": -1}
	var ip := host
	if not _is_ip(host):
		ip = IP.resolve_hostname(host, IP.TYPE_IPV4)
	if ip == "":
		return {"ping": -1, "online": -1, "max": -1}

	var u := PacketPeerUDP.new()
	var err := u.bind(0, "*")
	if err != OK:
		u.close()
		return {"ping": -1, "online": -1, "max": -1}
	u.set_dest_address(ip, port)
	u.put_packet(JSON.stringify({"t": "query", "ts": 1}).to_utf8_buffer())

	var t0 := Time.get_ticks_msec()
	var deadline := 1500
	while Time.get_ticks_msec() - t0 < deadline:
		await get_tree().process_frame
		if u.get_available_packet_count() > 0:
			var txt := u.get_packet().get_string_from_utf8()
			u.close()
			var o = JSON.parse_string(txt)
			if o is Dictionary:
				return {
					"ping": Time.get_ticks_msec() - t0,
					"online": int(o.get("online", 0)),
					"max": int(o.get("max", 0)),
				}
			return {"ping": Time.get_ticks_msec() - t0, "online": -1, "max": -1}
	u.close()
	return {"ping": -1, "online": -1, "max": -1}

func _is_ip(s: String) -> bool:
	var parts := s.split(".")
	if parts.size() != 4:
		return false
	for p in parts:
		if not p.is_valid_int():
			return false
	return true

# ------------------------------------------------------------------ 人物贴图
func _open_skin_picker() -> void:
	var fd := FileDialog.new()
	fd.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	fd.access = FileDialog.ACCESS_FILESYSTEM
	fd.title = "选择人物贴图"
	fd.filters = PackedStringArray(["*.png", "*.jpg", "*.jpeg", "*.webp"])
	fd.file_selected.connect(_on_skin_picked)
	add_child(fd)
	fd.popup_centered_ratio(0.7)

func _on_skin_picked(path: String) -> void:
	var im := Image.load_from_file(path)
	if im == null:
		_status.text = "读取图片失败：%s" % path
		return
	# 落到 user:// 才能持久读取
	var dst := "user://skin.png"
	if im.save_png(ProjectSettings.globalize_path(dst)) != OK:
		_status.text = "保存贴图失败"
		return
	GameSettings.skin_path = dst
	GameSettings.save_cfg()
	ModelFactory.reload_skin()
	_status.text = "贴图已应用（自动按人形比例裁剪）"
	Sfx.play("click")

# ------------------------------------------------------------------ 连接
func _do_connect() -> void:
	if _sel < 0:
		_status.text = "先选中一个服务器"
		return
	var d: Dictionary = GameSettings.servers[_sel]
	var host := str(d.get("addr", ""))
	var port := int(d.get("port", 19000))
	var nm := _name_edit.text.strip_edges()
	if nm == "":
		nm = "无名氏"
	if host == "" or port <= 0 or port > 65535:
		_status.text = "地址或端口不合法"
		return
	GameSettings.set_server(host, port)
	GameSettings.set_player_name(nm)
	_btn_connect.disabled = true
	_status.text = "正在连接 %s:%d ..." % [host, port]
	Sfx.play("click")
	Net.connect_to_server(host, port, nm)

func _exit_tree() -> void:
	Net.connected_ok.disconnect(_on_ok)
	Net.connect_failed.disconnect(_on_fail)

func _enter_tree() -> void:
	Net.connected_ok.connect(_on_ok)
	Net.connect_failed.connect(_on_fail)

func _on_ok() -> void:
	_status.text = "连接成功，进入战场"
	Trans.goto("res://scenes/MultiplayerGame.tscn", "正在同步战场")

func _on_fail(reason: String) -> void:
	_btn_connect.disabled = false
	_status.text = "连接失败：%s" % reason

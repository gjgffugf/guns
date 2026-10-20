class_name Hud
extends CanvasLayer
## 战斗 HUD：准星 / 血条 / 弹药 / FPS / 命中标记 + 移动端虚拟摇杆与动作按钮。

signal back_pressed()

const BTN := 92.0
const STICK_R := 82.0

var player: Player
var fps_label: Label
var hp_bar: ProgressBar
var hp_text: Label
var ammo_label: Label
var crosshair: Control
var hitmark: Control
var notice: Label
var kill_feed: VBoxContainer
var stance_label: Label
var ping_label: Label

var _spread_px: float = 12.0
var _hit_t: float = 0.0
var _hit_lethal: bool = false
var _fps_acc: float = 0.0
var _fps_val: float = 60.0

# 触摸状态
var _stick_idx: int = -1
var _stick_vec: Vector2 = Vector2.ZERO
var _stick_base: Vector2 = Vector2.ZERO
var _stick_knob: Control
var _stick_area: Control
var _look_idx: int = -1

var _btn_fire: Button
var _btn_ads: Button
var _btn_jump: Button
var _btn_crouch: Button
var _btn_prone: Button
var _btn_sprint: Button
var _btn_reload: Button

var _sprint_on: bool = false
var _ads_held: bool = false

# ------------------------------------------------------------------ 布局
## 直接写锚点与偏移，不用 set_anchors_preset —— 后者在不同屏幕比例下
## 对 size/position 的处理有歧义，横屏切换后容易算错位置。
static func _rect(c: Control, ax0: float, ay0: float, ax1: float, ay1: float,
		l: float, t: float, r: float, b: float) -> void:
	c.anchor_left = ax0
	c.anchor_top = ay0
	c.anchor_right = ax1
	c.anchor_bottom = ay1
	c.offset_left = l
	c.offset_top = t
	c.offset_right = r
	c.offset_bottom = b

## 左上
static func _tl(c: Control, x: float, y: float, w: float, h: float) -> void:
	_rect(c, 0.0, 0.0, 0.0, 0.0, x, y, x + w, y + h)

## 右上（mx/my 为距右边/顶边的边距）
static func _tr(c: Control, mx: float, my: float, w: float, h: float) -> void:
	_rect(c, 1.0, 0.0, 1.0, 0.0, -mx - w, my, -mx, my + h)

## 左下（mx/my 为距左边/底边的边距）
static func _bl(c: Control, mx: float, my: float, w: float, h: float) -> void:
	_rect(c, 0.0, 1.0, 0.0, 1.0, mx, -my - h, mx + w, -my)

## 右下
static func _br(c: Control, mx: float, my: float, w: float, h: float) -> void:
	_rect(c, 1.0, 1.0, 1.0, 1.0, -mx - w, -my - h, -mx, -my)

## 水平居中 + 贴底（w 为宽度，my 为距底边距离）
static func _bc(c: Control, w: float, my: float, h: float) -> void:
	_rect(c, 0.5, 1.0, 0.5, 1.0, -w * 0.5, -my - h, w * 0.5, -my)

## 正中
static func _center(c: Control, w: float, h: float) -> void:
	_rect(c, 0.5, 0.5, 0.5, 0.5, -w * 0.5, -h * 0.5, w * 0.5, h * 0.5)

func _ready() -> void:
	layer = 10
	_build()

# ------------------------------------------------------------------ 构建
func _build() -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	# ---- FPS（左上角）----
	fps_label = Label.new()
	_tl(fps_label, 18, 14, 240, 36)
	fps_label.text = "FPS 60"
	fps_label.add_theme_font_size_override("font_size", 26)
	fps_label.add_theme_color_override("font_color", Color(0.5, 1.0, 0.6))
	fps_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	fps_label.add_theme_constant_override("outline_size", 6)
	fps_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(fps_label)

	ping_label = Label.new()
	_tl(ping_label, 18, 54, 240, 30)
	ping_label.text = ""
	ping_label.add_theme_font_size_override("font_size", 20)
	ping_label.add_theme_color_override("font_color", Color(0.7, 0.85, 1.0))
	ping_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	ping_label.add_theme_constant_override("outline_size", 5)
	ping_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(ping_label)

	# ---- 击杀信息（右上角）----
	kill_feed = VBoxContainer.new()
	_tr(kill_feed, 18, 86, 330, 250)
	kill_feed.alignment = BoxContainer.ALIGNMENT_BEGIN
	kill_feed.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(kill_feed)

	# ---- 底部：血条 + 弹药 ----
	var bottom := HBoxContainer.new()
	_bc(bottom, 640, 20, 52)
	bottom.add_theme_constant_override("separation", 12)
	bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(bottom)

	hp_bar = ProgressBar.new()
	hp_bar.min_value = 0
	hp_bar.max_value = 100
	hp_bar.value = 100
	hp_bar.show_percentage = false
	hp_bar.custom_minimum_size = Vector2(360, 26)
	bottom.add_child(hp_bar)
	_style_bar(hp_bar, Color(0.85, 0.16, 0.18), Color(0.10, 0.11, 0.13))

	hp_text = Label.new()
	hp_text.text = "100"
	hp_text.add_theme_font_size_override("font_size", 24)
	hp_text.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	hp_text.add_theme_constant_override("outline_size", 5)
	hp_text.custom_minimum_size = Vector2(56, 0)
	bottom.add_child(hp_text)

	ammo_label = Label.new()
	ammo_label.text = "30 / 150"
	ammo_label.add_theme_font_size_override("font_size", 30)
	ammo_label.add_theme_color_override("font_color", Color(1.0, 0.92, 0.55))
	ammo_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	ammo_label.add_theme_constant_override("outline_size", 6)
	ammo_label.custom_minimum_size = Vector2(180, 0)
	ammo_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	bottom.add_child(ammo_label)

	stance_label = Label.new()
	_bc(stance_label, 640, 76, 32)
	stance_label.text = "站立"
	stance_label.add_theme_font_size_override("font_size", 22)
	stance_label.add_theme_color_override("font_color", Color(0.75, 0.85, 1.0))
	stance_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	stance_label.add_theme_constant_override("outline_size", 5)
	stance_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(stance_label)

	# ---- 准星 / 命中标记 ----
	crosshair = Control.new()
	crosshair.set_anchors_preset(Control.PRESET_FULL_RECT)
	crosshair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	crosshair.draw.connect(_draw_crosshair)
	root.add_child(crosshair)

	hitmark = Control.new()
	hitmark.set_anchors_preset(Control.PRESET_FULL_RECT)
	hitmark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hitmark.draw.connect(_draw_hitmark)
	root.add_child(hitmark)

	# ---- 中央提示 ----
	notice = Label.new()
	_center(notice, 760, 130)
	notice.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	notice.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	notice.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	notice.add_theme_font_size_override("font_size", 34)
	notice.add_theme_color_override("font_color", Color(1.0, 0.35, 0.32))
	notice.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	notice.add_theme_constant_override("outline_size", 8)
	notice.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(notice)

	# ---- 退出按钮 ----
	var back := _mk_button("退出", Color(0.35, 0.12, 0.14), 20)
	_tr(back, 18, 14, 110, 58)
	back.pressed.connect(func(): back_pressed.emit())
	root.add_child(back)

	# ---- 虚拟摇杆 ----
	_build_stick(root)
	# ---- 动作按钮 ----
	_build_action_buttons(root)
	# ---- 视角拖拽区（放在按钮之下，按钮会优先吃掉事件）----
	_build_look_area(root)

func _style_bar(b: ProgressBar, fg: Color, bg: Color) -> void:
	var s := StyleBoxFlat.new()
	s.bg_color = fg
	b.add_theme_stylebox_override("fill", s)
	var g := StyleBoxFlat.new()
	g.bg_color = bg
	g.set_corner_radius_all(4)
	b.add_theme_stylebox_override("background", g)

func _mk_button(text: String, col: Color, fs: int = 24) -> Button:
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
	n.border_color = Color(1, 1, 1, 0.28)
	b.add_theme_stylebox_override("normal", n)
	var p := StyleBoxFlat.new()
	p.bg_color = col.lightened(0.25)
	p.set_corner_radius_all(999)
	b.add_theme_stylebox_override("pressed", p)
	return b

func _circle_button(text: String, col: Color, fs: int = 24) -> Button:
	var b := _mk_button(text, col, fs)
	b.size = Vector2(BTN, BTN)
	return b

func _build_stick(root: Control) -> void:
	_stick_area = Control.new()
	_bl(_stick_area, 28, 46, 272, 260)
	_stick_area.mouse_filter = Control.MOUSE_FILTER_STOP
	_stick_area.gui_input.connect(_on_stick_input)
	root.add_child(_stick_area)

	_stick_base = Vector2(136, 130)
	var base := Control.new()
	base.set_anchors_preset(Control.PRESET_FULL_RECT)
	base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	base.draw.connect(func():
		base.draw_circle(_stick_base, STICK_R, Color(1, 1, 1, 0.07))
		base.draw_arc(_stick_base, STICK_R, 0, TAU, 48, Color(1, 1, 1, 0.18), 3.0)
		base.draw_circle(_stick_base + _stick_vec * STICK_R, 38.0, Color(1, 1, 1, 0.22))
	)
	_stick_area.add_child(base)
	_stick_knob = base

func _build_look_area(root: Control) -> void:
	var a := Control.new()
	a.set_anchors_preset(Control.PRESET_FULL_RECT)
	a.mouse_filter = Control.MOUSE_FILTER_STOP
	a.gui_input.connect(_on_look_input)
	root.add_child(a)
	root.move_child(a, 0)   # 置于最底，保证按钮优先响应

func _build_action_buttons(root: Control) -> void:
	_btn_fire = _circle_button("开火", Color(0.68, 0.14, 0.16), 26)
	_br(_btn_fire, 28, 28, BTN, BTN)
	_btn_fire.gui_input.connect(func(e):
		if player == null:
			return
		if e is InputEventScreenTouch:
			player.want_fire = e.pressed
		elif e is InputEventMouseButton:
			player.want_fire = e.pressed
	)
	root.add_child(_btn_fire)

	_btn_ads = _circle_button("开镜", Color(0.16, 0.34, 0.55), 22)
	_br(_btn_ads, 28, 140, BTN, BTN)
	_btn_ads.gui_input.connect(func(e):
		if e is InputEventScreenTouch or e is InputEventMouseButton:
			_ads_held = e.pressed
	)
	root.add_child(_btn_ads)

	_btn_reload = _circle_button("换弹", Color(0.30, 0.30, 0.34), 22)
	_br(_btn_reload, 28, 252, BTN, BTN)
	_btn_reload.pressed.connect(func():
		if player != null:
			player.start_reload())
	root.add_child(_btn_reload)

	# 跳跃：在“按下”瞬间就触发，等松手再跳会明显迟滞，
	# 也做不到边跑边跳（按住摇杆的同时必须能立刻起跳）
	_btn_jump = _circle_button("跳", Color(0.20, 0.42, 0.30), 24)
	_br(_btn_jump, 140, 28, BTN, BTN)
	_btn_jump.gui_input.connect(func(e):
		if player == null:
			return
		if e is InputEventScreenTouch:
			if e.pressed:
				player.request_jump()
		elif e is InputEventMouseButton and e.pressed \
				and e.button_index == MOUSE_BUTTON_LEFT:
			player.request_jump()
	)
	root.add_child(_btn_jump)

	_btn_crouch = _circle_button("蹲", Color(0.28, 0.34, 0.42), 22)
	_br(_btn_crouch, 140, 140, BTN, BTN)
	_btn_crouch.pressed.connect(func():
		if player == null:
			return
		player.set_stance(Player.Stance.CROUCH if player.stance != Player.Stance.CROUCH \
				else Player.Stance.STAND))
	root.add_child(_btn_crouch)

	_btn_prone = _circle_button("趴", Color(0.28, 0.34, 0.42), 22)
	_br(_btn_prone, 140, 252, BTN, BTN)
	_btn_prone.pressed.connect(func():
		if player == null:
			return
		player.set_stance(Player.Stance.PRONE if player.stance != Player.Stance.PRONE \
				else Player.Stance.STAND))
	root.add_child(_btn_prone)

	# 疾跑改成点一下切换：左手拇指要同时按住摇杆和疾跑键根本按不过来
	_btn_sprint = _circle_button("疾跑", Color(0.45, 0.36, 0.14), 22)
	_bl(_btn_sprint, 324, 100, 104, 104)
	_btn_sprint.toggle_mode = true
	_btn_sprint.toggled.connect(func(on: bool):
		_sprint_on = on
		Sfx.play("click")
	)
	root.add_child(_btn_sprint)

# ------------------------------------------------------------------ 输入
func _on_stick_input(e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		if e.pressed and _stick_idx == -1:
			_stick_idx = e.index
			_update_stick(e.position)
		elif not e.pressed and e.index == _stick_idx:
			_stick_idx = -1
			_stick_vec = Vector2.ZERO
			_stick_knob.queue_redraw()
			if player:
				player.move_axis = Vector2.ZERO
	elif e is InputEventScreenDrag and e.index == _stick_idx:
		_update_stick(e.position)
	elif e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
		if e.pressed:
			_stick_idx = 0
			_update_stick(e.position)
		else:
			_stick_idx = -1
			_stick_vec = Vector2.ZERO
			_stick_knob.queue_redraw()
			if player:
				player.move_axis = Vector2.ZERO
	elif e is InputEventMouseMotion and _stick_idx == 0:
		_update_stick(e.position)

func _update_stick(p: Vector2) -> void:
	var d := p - _stick_base
	var r := d.length()
	if r > STICK_R:
		d = d.normalized() * STICK_R
	_stick_vec = d / STICK_R
	_stick_knob.queue_redraw()
	if player:
		# 摇杆上推 -> move_axis.y = -1，与键盘 W 一致（前进方向为 -Z）
		player.move_axis = Vector2(_stick_vec.x, _stick_vec.y)

func _on_look_input(e: InputEvent) -> void:
	if player == null:
		return
	if e is InputEventScreenTouch:
		if e.pressed and _look_idx == -1:
			_look_idx = e.index
		elif not e.pressed and e.index == _look_idx:
			_look_idx = -1
	elif e is InputEventScreenDrag and e.index == _look_idx:
		player.add_look(e.relative * 0.0055 * GameSettings.sensitivity)
	elif e is InputEventMouseMotion and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		player.add_look(e.relative * 0.0055 * GameSettings.sensitivity)

# ------------------------------------------------------------------ 绑定
func bind_player(p: Player) -> void:
	player = p
	p.hp_changed.connect(_on_hp)
	p.ammo_changed.connect(_on_ammo)
	p.stance_changed.connect(_on_stance)
	p.hit_confirmed.connect(_on_hit)
	p.died.connect(_on_died)
	p.respawned.connect(func(): notice.text = "")
	_on_hp(p.hp, 100.0)
	_on_ammo(p.mag, p.reserve)
	_on_stance(p.stance)

func _on_hp(h: float, _m: float) -> void:
	hp_bar.value = h
	hp_text.text = str(int(h))
	var col := Color(0.85, 0.16, 0.18)
	if h > 60:
		col = Color(0.2, 0.75, 0.35)
	elif h > 30:
		col = Color(0.95, 0.7, 0.15)
	_style_bar(hp_bar, col, Color(0.10, 0.11, 0.13))

func _on_ammo(mag: int, reserve: int) -> void:
	ammo_label.text = "%d / %d" % [mag, reserve]
	if mag == 0:
		ammo_label.add_theme_color_override("font_color", Color(1.0, 0.35, 0.3))
	else:
		ammo_label.add_theme_color_override("font_color", Color(1.0, 0.92, 0.55))

func _on_stance(s: int) -> void:
	stance_label.text = ["站立", "蹲下", "趴下"][s] if s < 3 else "站立"

func _on_hit(lethal: bool) -> void:
	_hit_t = 0.22
	_hit_lethal = lethal
	hitmark.queue_redraw()
	Sfx.play("hitmark", -8.0)

func _on_died(killer: String) -> void:
	notice.text = "你被 %s 击杀\n3 秒后重新部署" % killer

func push_kill(text: String) -> void:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", 22)
	l.add_theme_color_override("font_color", Color(1.0, 0.85, 0.5))
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	l.add_theme_constant_override("outline_size", 5)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	kill_feed.add_child(l)
	await get_tree().create_timer(3.5).timeout
	if is_instance_valid(l):
		l.queue_free()

func set_ping(ms: float, online: bool) -> void:
	if online:
		ping_label.text = "PING %dms" % int(ms)
	else:
		ping_label.text = ""

# ------------------------------------------------------------------ 绘制
func _process(delta: float) -> void:
	# FPS：0.35s 刷新一次，避免数字乱跳
	_fps_acc += delta
	if _fps_acc >= 0.35:
		_fps_acc = 0.0
		_fps_val = Engine.get_frames_per_second()
		var ms := 1000.0 / maxf(_fps_val, 1.0)
		fps_label.text = "FPS %d  (%.1fms)" % [int(_fps_val), ms]
		fps_label.add_theme_color_override("font_color",
				Color(0.45, 1.0, 0.55) if _fps_val >= 55 else
				Color(1.0, 0.85, 0.35) if _fps_val >= 30 else Color(1.0, 0.4, 0.35))

	if player != null:
		var s := player._spread
		_spread_px = clampf(s * 900.0, 4.0, 90.0)
		crosshair.queue_redraw()
		player.touch_ads = _ads_held
		player.touch_sprint = _sprint_on

	if _hit_t > 0.0:
		_hit_t -= delta
		hitmark.queue_redraw()

func _draw_crosshair() -> void:
	var c := Vector2(360, 640)
	var cw := get_viewport().get_visible_rect()
	c = cw.size / 2.0
	var gap := _spread_px
	var len := 9.0
	var col := Color(0.25, 1.0, 0.45, 0.95) if (player != null and player.ads) \
			else Color(1, 1, 1, 0.95)
	if player != null and player.ads:
		crosshair.draw_circle(c, 2.0, col)
		crosshair.draw_arc(c, 7.0, 0, TAU, 32, Color(0.2, 0.9, 0.4, 0.7), 2.0)
		return
	var dirs: Array[Vector2] = [Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1)]
	for d: Vector2 in dirs:
		var a: Vector2 = c + d * gap
		var b: Vector2 = c + d * (gap + len)
		crosshair.draw_line(a, b, col, 2.5)
	crosshair.draw_circle(c, 1.6, col)

func _draw_hitmark() -> void:
	if _hit_t <= 0.0:
		return
	var c := get_viewport().get_visible_rect().size / 2.0
	var a := lerpf(0.0, 1.0, _hit_t / 0.22) * 0.6 + 0.4
	var col := Color(1.0, 0.25, 0.2, a) if _hit_lethal else Color(1, 1, 1, a)
	var r := 12.0
	var dirs: Array[Vector2] = [Vector2(1, 1), Vector2(1, -1), Vector2(-1, 1), Vector2(-1, -1)]
	for d: Vector2 in dirs:
		hitmark.draw_line(c + d * r * 0.5, c + d * (r + 10), col, 3.0)

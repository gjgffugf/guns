class_name Hud
extends CanvasLayer
## 战斗 HUD（横屏 1280x720 基准）：
## 准星 / 倍镜 / 血条 / 弹药 / FPS / 命中标记 / 受伤闪烁 / 雷达
## + 虚拟摇杆、动作按钮、治疗物、武器切换。
## 所有触摸控件的位置 / 大小 / 透明度由 GameSettings 驱动，可在设置里自定义。

signal back_pressed()

var player: Player
var fps_label: Label
var ping_label: Label
var hp_bar: ProgressBar
var hp_text: Label
var ammo_label: Label
var crosshair: Control
var hitmark: Control
var notice: Label
var kill_feed: VBoxContainer
var stance_label: Label
var score_label: Label
var reload_tip: Label
var minimap: Minimap

# ---- 状态 ----
var _spread_px: float = 12.0
var _hit_t: float = 0.0
var _hit_lethal: bool = false
var _fps_acc: float = 0.0
var _flash_t: float = 0.0          # 受伤时屏幕边框红闪
var _hp_flash_t: float = 0.0       # 血条红闪
var _ads_on: bool = false          # 开镜为「点击切换」
var _edit_preview: bool = false    # 控件编辑器预览模式（不响应游戏输入）

# ---- 触摸 ----
var _touch: Control
var _stick_idx: int = -1
var _stick_vec: Vector2 = Vector2.ZERO
var _stick_base: Vector2 = Vector2.ZERO
var _stick_area: Control
var _stick_knob: Control
var _look_idx: int = -1
var _fire_idx: int = -1
var _btns: Dictionary = {}

# ---- 治疗物 ----
var _heal_root: Control
var _heal_circle: Button
var _heal_arrow: Button
var _heal_list: PanelContainer
var _heal_open: bool = false
var _use_lbl: Label
var _use_bar: ProgressBar
var _cancel_btn: Button

# ---- 倍镜 ----
var _scope: Control
var _scope_tex: ImageTexture
var _damage_layer: Control
var _root: Control                 # FULL_RECT 根节点，它的 size 就是本层真实坐标系
var _back_btn: Button              # 退出按钮（Button 只认鼠标事件，触摸需额外兜底）
var _btn_lock: Dictionary = {}     # 按钮名 -> 上次触发时间戳，防止触摸+鼠标双触发
var _last_vp := Vector2.ZERO

func _ready() -> void:
	layer = 10
	# 关键：CanvasLayer 默认 follow_viewport_enabled=false，不跟随 viewport 的
	# stretch 变换，于是它内部用的是「窗口物理像素」，而触摸事件坐标和
	# Control 布局用的是「stretch 之后的逻辑像素」。两套坐标系不一致，
	# 控件就会被摆到错误位置（挤在左上区域、尺寸偏小，看起来像"没有控件"）。
	# 打开跟随后，三者统一，控件位置和命中测试才对得上。
	#
	# 属性名在 4.x 是 follow_viewport_enabled（3.x 才是 ..._enable），
	# 这里用属性表探测，避免版本差异写错名字导致运行时报错。
	for _pn in ["follow_viewport_enabled", "follow_viewport_enable"]:
		if _has_prop(_pn):
			set(_pn, true)
			break
	_build()
	# _ready 时视口尺寸在 Android 上常常还没稳定（甚至为 0），
	# 只在这里摆一次会让所有控件 size=0 而彻底看不见。
	# 这里补一次，并持续监听尺寸变化。
	_ensure_layout.call_deferred()
	if _root != null:
		_root.resized.connect(func(): _ensure_layout())

# ------------------------------------------------------------------ 布局助手
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

static func _tl(c: Control, x: float, y: float, w: float, h: float) -> void:
	_rect(c, 0.0, 0.0, 0.0, 0.0, x, y, x + w, y + h)

static func _tr(c: Control, mx: float, my: float, w: float, h: float) -> void:
	_rect(c, 1.0, 0.0, 1.0, 0.0, -mx - w, my, -mx, my + h)

## 水平居中 + 贴底
static func _bc(c: Control, w: float, my: float, h: float) -> void:
	_rect(c, 0.5, 1.0, 0.5, 1.0, -w * 0.5, -my - h, w * 0.5, -my)

## 水平居中 + 贴顶
static func _tc(c: Control, w: float, my: float, h: float) -> void:
	_rect(c, 0.5, 0.0, 0.5, 0.0, -w * 0.5, my, w * 0.5, my + h)

static func _center(c: Control, w: float, h: float) -> void:
	_rect(c, 0.5, 0.5, 0.5, 0.5, -w * 0.5, -h * 0.5, w * 0.5, h * 0.5)

# ------------------------------------------------------------------ 构建
func _build() -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	_root = root

	# ---- 雷达（左上角）----
	minimap = Minimap.new()
	minimap.setup(60.0)
	minimap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tl(minimap, 14, 14, 150, 150)
	minimap.visible = false          # 默认关，由具体模式决定是否开启
	root.add_child(minimap)

	# ---- FPS / PING ----
	fps_label = Label.new()
	_tl(fps_label, 16, 172, 300, 34)
	fps_label.text = "FPS 60"
	fps_label.add_theme_font_size_override("font_size", 26)
	fps_label.add_theme_color_override("font_color", Color(0.5, 1.0, 0.6))
	fps_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	fps_label.add_theme_constant_override("outline_size", 6)
	fps_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(fps_label)

	ping_label = Label.new()
	_tl(ping_label, 16, 208, 300, 28)
	ping_label.text = ""
	ping_label.add_theme_font_size_override("font_size", 20)
	ping_label.add_theme_color_override("font_color", Color(0.7, 0.85, 1.0))
	ping_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	ping_label.add_theme_constant_override("outline_size", 5)
	ping_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(ping_label)

	# ---- 顶部中间：比分 / 倒计时 ----
	score_label = Label.new()
	_tc(score_label, 520, 12, 44)
	score_label.text = ""
	score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	score_label.add_theme_font_size_override("font_size", 32)
	score_label.add_theme_color_override("font_color", Color(1.0, 0.95, 0.9))
	score_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.92))
	score_label.add_theme_constant_override("outline_size", 7)
	score_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(score_label)

	# ---- 击杀播报 ----
	kill_feed = VBoxContainer.new()
	_tr(kill_feed, 16, 76, 320, 240)
	kill_feed.alignment = BoxContainer.ALIGNMENT_BEGIN
	kill_feed.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(kill_feed)

	# ---- 退出 ----
	var back := _mk_button("退出", Color(0.35, 0.12, 0.14), 20)
	_tr(back, 16, 12, 110, 56)
	# 不直接 emit：走统一入口，方便和触摸兜底共用一个去重锁
	back.pressed.connect(func(): _press_button("back"))
	root.add_child(back)
	_back_btn = back

	# ---- 底部：姿态 / 弹药 / 血条 ----
	stance_label = Label.new()
	_bc(stance_label, 420, 116, 32)
	stance_label.text = "站立"
	stance_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stance_label.add_theme_font_size_override("font_size", 22)
	stance_label.add_theme_color_override("font_color", Color(0.75, 0.85, 1.0))
	stance_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	stance_label.add_theme_constant_override("outline_size", 5)
	stance_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(stance_label)

	var hp_row := HBoxContainer.new()
	_bc(hp_row, 520, 62, 40)
	hp_row.add_theme_constant_override("separation", 10)
	hp_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hp_row)

	hp_bar = ProgressBar.new()
	hp_bar.min_value = 0
	hp_bar.max_value = 100
	hp_bar.value = 100
	hp_bar.show_percentage = false
	hp_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hp_bar.custom_minimum_size = Vector2(420, 30)
	hp_row.add_child(hp_bar)
	_style_bar(hp_bar, Color(0.2, 0.75, 0.35), Color(0.10, 0.11, 0.13))

	hp_text = Label.new()
	hp_text.text = "100"
	hp_text.add_theme_font_size_override("font_size", 26)
	hp_text.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	hp_text.add_theme_constant_override("outline_size", 5)
	hp_text.custom_minimum_size = Vector2(60, 0)
	hp_text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hp_row.add_child(hp_text)

	# 弹药量：屏幕底部正中
	ammo_label = Label.new()
	_bc(ammo_label, 460, 16, 44)
	ammo_label.text = "30 / 150"
	ammo_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ammo_label.add_theme_font_size_override("font_size", 36)
	ammo_label.add_theme_color_override("font_color", Color(1.0, 0.92, 0.55))
	ammo_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.92))
	ammo_label.add_theme_constant_override("outline_size", 7)
	ammo_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(ammo_label)

	# 换弹提示
	reload_tip = Label.new()
	_bc(reload_tip, 460, 168, 32)
	reload_tip.text = ""
	reload_tip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	reload_tip.add_theme_font_size_override("font_size", 24)
	reload_tip.add_theme_color_override("font_color", Color(1.0, 0.55, 0.35))
	reload_tip.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.92))
	reload_tip.add_theme_constant_override("outline_size", 6)
	reload_tip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(reload_tip)

	# ---- 准星 / 命中标记 / 倍镜 / 受伤闪烁 ----
	crosshair = Control.new()
	crosshair.set_anchors_preset(Control.PRESET_FULL_RECT)
	crosshair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	crosshair.draw.connect(_draw_crosshair)
	root.add_child(crosshair)

	_scope = Control.new()
	_scope.set_anchors_preset(Control.PRESET_FULL_RECT)
	_scope.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_scope.visible = false
	_scope.draw.connect(_draw_scope)
	root.add_child(_scope)
	_make_scope_tex()

	hitmark = Control.new()
	hitmark.set_anchors_preset(Control.PRESET_FULL_RECT)
	hitmark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hitmark.draw.connect(_draw_hitmark)
	root.add_child(hitmark)

	# 受伤时屏幕四边红闪
	var dmg := Control.new()
	dmg.set_anchors_preset(Control.PRESET_FULL_RECT)
	dmg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dmg.draw.connect(_draw_damage)
	root.add_child(dmg)
	_damage_layer = dmg

	# ---- 中央提示 ----
	notice = Label.new()
	_center(notice, 820, 150)
	notice.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	notice.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	notice.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	notice.add_theme_font_size_override("font_size", 34)
	notice.add_theme_color_override("font_color", Color(1.0, 0.35, 0.32))
	notice.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	notice.add_theme_constant_override("outline_size", 8)
	notice.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(notice)

	# ---- 使用治疗物：倒计时 + 取消 ----
	_use_lbl = Label.new()
	_tc(_use_lbl, 520, 210, 40)
	_use_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_use_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_use_lbl.add_theme_font_size_override("font_size", 34)
	_use_lbl.add_theme_color_override("font_color", Color(0.6, 1.0, 0.7))
	_use_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	_use_lbl.add_theme_constant_override("outline_size", 7)
	root.add_child(_use_lbl)

	_use_bar = ProgressBar.new()
	_tc(_use_bar, 420, 258, 18)
	_use_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_use_bar.max_value = 100
	_use_bar.show_percentage = false
	var fs := StyleBoxFlat.new()
	fs.bg_color = Color(0.35, 0.9, 0.45)
	_use_bar.add_theme_stylebox_override("fill", fs)
	var gs := StyleBoxFlat.new()
	gs.bg_color = Color(0, 0, 0, 0.45)
	gs.set_corner_radius_all(4)
	_use_bar.add_theme_stylebox_override("background", gs)
	_use_bar.visible = false
	root.add_child(_use_bar)

	_cancel_btn = _mk_button("取消", Color(0.45, 0.18, 0.16), 24)
	_tc(_cancel_btn, 200, 288, 66)
	_cancel_btn.visible = false
	_cancel_btn.pressed.connect(func(): _press_button("cancel"))
	root.add_child(_cancel_btn)

	# ---- 触摸控件 ----
	_build_stick(root)
	_build_buttons(root)
	_build_heal(root)
	_touch = Control.new()
	_touch.set_anchors_preset(Control.PRESET_FULL_RECT)
	_touch.mouse_filter = Control.MOUSE_FILTER_STOP
	_touch.gui_input.connect(_on_touch)
	root.add_child(_touch)
	root.move_child(_touch, 0)
	relayout()

# ------------------------------------------------------------------ 控件构建
func _build_stick(root: Control) -> void:
	_stick_area = Control.new()
	_stick_area.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_stick_area)
	var base := Control.new()
	base.set_anchors_preset(Control.PRESET_FULL_RECT)
	base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	base.draw.connect(_draw_stick)
	_stick_area.add_child(base)
	_stick_knob = base
	_btns["stick"] = _stick_area

func _build_buttons(root: Control) -> void:
	var defs := [
		["fire", "开火", Color(0.68, 0.14, 0.16), 26],
		["ads", "开镜", Color(0.16, 0.34, 0.55), 22],
		["jump", "跳", Color(0.20, 0.42, 0.30), 24],
		["crouch", "蹲", Color(0.28, 0.34, 0.42), 22],
		["prone", "趴", Color(0.28, 0.34, 0.42), 22],
		["reload", "换弹", Color(0.30, 0.30, 0.34), 22],
		["melee", "刀", Color(0.52, 0.42, 0.16), 22],
	]
	for d in defs:
		var b := _mk_button(str(d[1]), d[2] as Color, int(d[3]))
		b.mouse_filter = Control.MOUSE_FILTER_IGNORE
		root.add_child(b)
		_btns[str(d[0])] = b

func _build_heal(root: Control) -> void:
	_heal_root = Control.new()
	_heal_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_heal_root)
	_btns["heal"] = _heal_root

	_heal_arrow = Button.new()
	_heal_arrow.text = "▲"
	_heal_arrow.add_theme_font_size_override("font_size", 20)
	_heal_arrow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var asb := StyleBoxFlat.new()
	asb.bg_color = Color(0.16, 0.18, 0.24, 0.92)
	asb.set_corner_radius_all(8)
	asb.border_width_left = 2
	asb.border_width_right = 2
	asb.border_width_top = 2
	asb.border_width_bottom = 2
	asb.border_color = Color(1, 1, 1, 0.35)
	_heal_arrow.add_theme_stylebox_override("normal", asb)
	_heal_root.add_child(_heal_arrow)

	_heal_circle = Button.new()
	_heal_circle.text = "绷带\n3"
	_heal_circle.add_theme_font_size_override("font_size", 22)
	_heal_circle.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.18, 0.46, 0.30, 0.94)
	sb.set_corner_radius_all(999)
	sb.border_width_left = 3
	sb.border_width_right = 3
	sb.border_width_top = 3
	sb.border_width_bottom = 3
	sb.border_color = Color(1, 1, 1, 0.45)
	_heal_circle.add_theme_stylebox_override("normal", sb)
	_heal_root.add_child(_heal_circle)

	_heal_list = PanelContainer.new()
	_heal_list.visible = false
	var lsb := StyleBoxFlat.new()
	lsb.bg_color = Color(0.08, 0.10, 0.14, 0.96)
	lsb.set_corner_radius_all(12)
	lsb.border_width_left = 2
	lsb.border_width_right = 2
	lsb.border_width_top = 2
	lsb.border_width_bottom = 2
	lsb.border_color = Color(1, 1, 1, 0.28)
	_heal_list.add_theme_stylebox_override("panel", lsb)
	root.add_child(_heal_list)
	_rebuild_heal_list()

## 把存档里的位置 / 大小 / 透明度应用到所有触摸控件
func relayout() -> void:
	var vp := _vp()
	for k in _btns:
		var c := _btns[k] as Control
		TouchLayout.apply(c, k, vp)
	_stick_base = _stick_area.size / 2.0
	# 治疗物：圆形在下、三角箭头在上
	var hr := TouchLayout.size_of("heal", vp)
	_heal_circle.size = Vector2(hr.x, hr.x)
	_heal_circle.position = Vector2(0, hr.y - hr.x)
	_heal_arrow.size = Vector2(hr.x * 0.52, hr.y - hr.x - 4)
	_heal_arrow.position = Vector2(hr.x * 0.24, 0)
	_heal_root.modulate.a = TouchLayout.alpha_of("heal")
	var lp := _heal_root.position + Vector2(hr.x * 0.5 - 150, -6)
	_heal_list.position = Vector2(lp.x, maxf(lp.y - _heal_list.size.y, 8))
	if _stick_knob != null:
		_stick_knob.queue_redraw()

# ------------------------------------------------------------------ 输入
## 本层控件与触摸事件所处的真实坐标系尺寸。
##
## 不能直接用 get_viewport().get_visible_rect()：
## Hud 是 CanvasLayer，而 Godot 4 里 CanvasLayer 默认不跟随 viewport 的
## stretch 变换，它用的是「窗口物理像素」；而 get_visible_rect() 返回的是
## 除以 stretch_scale 之后的逻辑尺寸。两者不一致时，所有控件都会被摆到
## 错误的位置 —— 表现就是控件挤在一角/看不见，或者开火键跑到屏幕中间，
## 点哪都在开枪、找不到空白区转视角。
## 根节点是 FULL_RECT，它的 size 与触摸事件坐标天然同一坐标系，最可靠。
## 属性探测（兼容不同 Godot 版本的命名差异）
func _has_prop(name: String) -> bool:
	for d in get_property_list():
		if str(d["name"]) == name:
			return true
	return false

## 把「触摸事件坐标」转换到 CanvasLayer 内部坐标系。
##
## InputEventScreenTouch/Drag 的 position 是 viewport 坐标系，
## 而控件摆在 CanvasLayer 的内部坐标系里。get_final_transform() 正是
## 「CanvasLayer -> Viewport」的变换，取逆即可反推回来。
## 有了这一步，无论 follow_viewport 是否生效、stretch 怎么配，
## 命中测试都能对得上。
func _to_local(p: Vector2) -> Vector2:
	var xf := get_final_transform()
	if xf == null:
		return p
	return xf.affine_inverse() * p

func _vp() -> Vector2:
	# 优先级：根节点实际尺寸 > 视口逻辑尺寸 > 窗口物理尺寸 > 设计分辨率。
	# CanvasLayer 跟随视口后，前两者应当一致；后面几级只是防止极端情况
	# 拿到 0 导致控件尺寸为 0 而"消失"。
	if _root != null and _root.size.x > 1.0 and _root.size.y > 1.0:
		return _root.size
	var vr := get_viewport().get_visible_rect().size
	if vr.x > 1.0 and vr.y > 1.0:
		return vr
	var w := DisplayServer.window_get_size()
	if w.x > 1.0 and w.y > 1.0:
		return Vector2(w)
	return Vector2(1280.0, 720.0)

## 尺寸变了就重新摆一次；每帧检测，成本可以忽略
func _ensure_layout() -> void:
	var vp := _vp()
	if vp.x < 2.0 or vp.y < 2.0:
		return
	if vp.is_equal_approx(_last_vp):
		return
	_last_vp = vp
	relayout()
	# 排错用：把坐标系和关键控件的实际矩形打出来。
	# 如果还出现"控件不显示 / 点哪都开火"，看这几行就能定位：
	#   - vp 应该接近 1280x720（逻辑分辨率），若变成 2340x1080 之类说明没跟随视口
	#   - 开火键矩形应落在 vp 右下角
	print("[Hud] vp=%s  viewport=%s  变换缩放=%s" % [
			vp, get_viewport().get_visible_rect().size, get_final_transform().get_scale()])
	print("[Hud] 摇杆=%s  开火=%s" % [
			TouchLayout.rect_of("stick", vp), TouchLayout.rect_of("fire", vp)])

## 触摸设备上，鼠标事件是 Godot 模拟出来的（emulate_mouse_from_touch）。
## 这类事件必须放行给上层的 Button —— 因为 BaseButton 只认
## InputEventMouseButton，如果在这层被消费掉，游戏里的「退出」「取消」
## 就点不动了（上一轮主菜单按钮失效也是同一个原因）。
static func _touch_dev() -> bool:
	return DisplayServer.is_touchscreen_available() \
			or OS.get_name() in ["Android", "iOS"]

## 安全取事件坐标。
## 形参是 InputEvent，position 属于子类；在没进 `is` 块之前直接访问
## 会因类型窄化失效而编译失败，这里统一用 as 转换。
static func _ev_pos(e: InputEvent) -> Vector2:
	var t := e as InputEventScreenTouch
	if t != null:
		return t.position
	var d := e as InputEventScreenDrag
	if d != null:
		return d.position
	var mb := e as InputEventMouseButton
	if mb != null:
		return mb.position
	var mm := e as InputEventMouseMotion
	if mm != null:
		return mm.position
	return Vector2.ZERO

func _on_touch(e: InputEvent) -> void:
	if _edit_preview:
		return
	# 触摸设备：鼠标事件一律放行，交给真正的 Button 处理，本层不碰
	if _touch_dev() and (e is InputEventMouseButton or e is InputEventMouseMotion):
		return
	var vp := _vp()
	# 触摸事件坐标是 viewport 坐标系，必须先转到 CanvasLayer 内部坐标系
	# 再去做命中测试，否则永远命中不到，点哪都变成"空白区"。
	# 注意：e 的静态类型是 InputEvent，position 是子类才有的属性，
	# 这里还没进 `if e is ...` 块，窄化不生效，必须用 _ev_pos() 转一下。
	var lp := _to_local(_ev_pos(e))
	if e is InputEventScreenTouch:
		if e.pressed:
			# 先看看是不是按在 Button 上。
			# Button 本身只认鼠标事件，而鼠标模拟只跟随第一根手指，
			# 多指操作时（比如左手摇杆、右手点取消）就点不到了。
			# 这里在触摸分支补一次矩形检测，保证任意手指都能触发。
			var btn := _hit_button(lp)
			if btn != "":
				_press_button(btn)
				get_viewport().set_input_as_handled()
				return
			_route_down(TouchLayout.hit(vp, lp), e, lp)
		else:
			_route_up(e.index)
		# 消费掉，别再往 _unhandled_input 传，否则会被当成鼠标左键再次触发开火
		get_viewport().set_input_as_handled()
	elif e is InputEventScreenDrag:
		if e.index == _stick_idx:
			_update_stick(lp)
		elif e.index == _fire_idx:
			pass    # 长按后滑动仍然持续开火，不中断
		elif e.index == _look_idx:
			if player != null:
				# 旋转量不受平移影响，但缩放要还原，否则高 DPI 下转视角过快/过慢
				var sc := _look_scale()
				player.add_look(e.relative * 0.0055 * GameSettings.sensitivity * sc)
		get_viewport().set_input_as_handled()
	elif e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
		# 桌面调试用（project.godot 里已关掉触摸模拟鼠标）
		if e.pressed:
			_route_down(TouchLayout.hit(vp, lp), e, lp)
		else:
			_route_up(0)
		get_viewport().set_input_as_handled()
	elif e is InputEventMouseMotion:
		if _stick_idx == 0:
			_update_stick(lp)
		elif _look_idx == 0:
			if player != null:
				player.add_look(e.relative * 0.0055 * GameSettings.sensitivity * _look_scale())

## 拖拽增量是 viewport 坐标，而 CanvasLayer 跟随视口后缩放已统一，
## 这里只在极端情况下做一次归一化，避免高 DPI 屏转视角手感突变
func _look_scale() -> float:
	var xf := get_final_transform()
	if xf == null:
		return 1.0
	var sx := absf(xf.get_scale().x)
	if sx < 0.001:
		return 1.0
	return 1.0 / sx

## lp：已经转换到 CanvasLayer 内部坐标系的触点位置
## 触摸命中 Button。
## 用 get_rect()（相对父节点 root，而 root 是 FULL_RECT，
## 所以它就在 CanvasLayer 内部坐标系里）与 lp 比较 —— 这两者天然同坐标系，
## 不依赖 follow_viewport 是否生效，比 get_global_rect() 更稳。
func _hit_button(lp: Vector2) -> String:
	if _cancel_btn != null and _cancel_btn.visible \
			and _cancel_btn.get_rect().has_point(lp):
		return "cancel"
	if _back_btn != null and _back_btn.visible \
			and _back_btn.get_rect().has_point(lp):
		return "back"
	return ""

## 触发按钮效果。
##
## 触摸设备上一次点击会走两条路：本层的触摸兜底 + Godot 的鼠标模拟，
## 这里用时间戳去重，避免同一次点击触发两次（比如退出生效两次）。
func _press_button(which: String) -> void:
	var now := Time.get_ticks_msec()
	if now - int(_btn_lock.get(which, 0)) < 400:
		return
	_btn_lock[which] = now
	Sfx.play("click", -6.0)
	match which:
		"cancel":
			if player != null:
				player.cancel_item()
		"back":
			back_pressed.emit()

## lp：已经转换到 CanvasLayer 内部坐标系的触点位置
func _route_down(k: String, e: InputEvent, lp: Vector2 = Vector2.ZERO) -> void:
	var idx: int = int(e.get("index", 0)) if e is InputEventScreenTouch else 0
	# 同上：e 是 InputEvent，取 position 必须走 _ev_pos()
	var pos := lp if lp != Vector2.ZERO else _to_local(_ev_pos(e))
	# 视角登记必须放在 player 判空之前：否则 player 还没绑定时
	# 整个 _look_idx 都设不上，拖动就完全转不了视角。
	# 开火键也登记进来，这样「长按开火 + 滑动瞄准」才成立。
	if k == "" or k == "fire":
		_look_idx = idx
	if player == null:
		return
	match k:
		"stick":
			_stick_idx = idx
			_update_stick(pos)
		"fire":
			_fire_idx = idx
			player.want_fire = true
		"ads":
			_toggle_ads()
		"jump":
			player.request_jump()
		"crouch":
			player.set_stance(Player.Stance.CROUCH if player.stance != Player.Stance.CROUCH \
					else Player.Stance.STAND)
		"prone":
			player.set_stance(Player.Stance.PRONE if player.stance != Player.Stance.PRONE \
					else Player.Stance.STAND)
		"reload":
			player.start_reload()
		"melee":
			player.toggle_weapon()
		"heal":
			var local := pos - _heal_root.position
			if local.y < _heal_circle.position.y:
				_toggle_heal_list()
			else:
				player.use_selected_item()
		_:
			_look_idx = idx

func _route_up(idx: int) -> void:
	if idx == _stick_idx:
		_stick_idx = -1
		_stick_vec = Vector2.ZERO
		if _stick_knob != null:
			_stick_knob.queue_redraw()
		if player != null:
			player.move_axis = Vector2.ZERO
	if idx == _fire_idx:
		_fire_idx = -1
		if player != null:
			player.want_fire = false
	if idx == _look_idx:
		_look_idx = -1

func _update_stick(p: Vector2) -> void:
	var r := _stick_area.size.x * 0.30
	# 摇杆还没布局完时 r 会是 0，这里除零会让 move_axis 变成 NaN，
	# 玩家会被瞬移到一个无效坐标。直接忽略这次输入。
	if r < 1.0:
		return
	var d := p - (_stick_area.position + _stick_base)
	if d.length() > r:
		d = d.normalized() * r
	_stick_vec = d / r
	if _stick_knob != null:
		_stick_knob.queue_redraw()
	if player != null:
		player.move_axis = Vector2(_stick_vec.x, _stick_vec.y)

func _toggle_ads() -> void:
	_ads_on = not _ads_on
	Sfx.play("click")
	if player != null:
		player.touch_ads = _ads_on

# ------------------------------------------------------------------ 治疗物 UI
func _toggle_heal_list() -> void:
	_heal_open = not _heal_open
	Sfx.play("click")
	_heal_list.visible = _heal_open
	if _heal_open:
		_rebuild_heal_list()
		var vp := _vp()
		_heal_list.size = _heal_list.get_combined_minimum_size()
		_heal_list.position = Vector2(
				clampf(_heal_root.position.x + _heal_root.size.x * 0.5 - 150, 8, vp.x - 308),
				maxf(_heal_root.position.y - _heal_list.size.y - 6, 8))

func _rebuild_heal_list() -> void:
	for c in _heal_list.get_children():
		c.queue_free()
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	_heal_list.add_child(v)
	if player == null:
		return
	for i in Player.Item.values():
		var b := Button.new()
		b.text = "%s  x%d" % [player.item_name(i), player.item_count(i)]
		b.custom_minimum_size = Vector2(300, 62)
		b.add_theme_font_size_override("font_size", 22)
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0.20, 0.22, 0.28) if player.selected_item != i \
				else Color(0.18, 0.46, 0.30)
		sb.set_corner_radius_all(10)
		sb.border_width_left = 2
		sb.border_width_right = 2
		sb.border_width_top = 2
		sb.border_width_bottom = 2
		sb.border_color = Color(1, 1, 1, 0.35)
		b.add_theme_stylebox_override("normal", sb)
		b.pressed.connect(func():
			Sfx.play("click")
			player.select_item(i)
			_heal_open = false
			_heal_list.visible = false
		)
		v.add_child(b)

func _refresh_heal_btn() -> void:
	if player == null:
		return
	var n := player.item_name(player.selected_item)
	_heal_circle.text = "%s\n%d" % [n.substr(0, mini(4, n.length())),
			player.item_count(player.selected_item)]
	_heal_circle.disabled = player.item_count(player.selected_item) <= 0

# ------------------------------------------------------------------ 样式
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
	n.border_color = Color(1, 1, 1, 0.42)
	b.add_theme_stylebox_override("normal", n)
	var p := StyleBoxFlat.new()
	p.bg_color = col.lightened(0.25)
	p.set_corner_radius_all(999)
	p.border_width_left = 2
	p.border_width_right = 2
	p.border_width_top = 2
	p.border_width_bottom = 2
	p.border_color = Color(1, 1, 1, 0.7)
	b.add_theme_stylebox_override("pressed", p)
	return b

# ------------------------------------------------------------------ 绑定
func bind_player(p: Player) -> void:
	player = p
	p.hp_changed.connect(_on_hp)
	p.ammo_changed.connect(_on_ammo)
	p.stance_changed.connect(_on_stance)
	p.hit_confirmed.connect(_on_hit)
	p.died.connect(_on_died)
	p.damaged.connect(_on_damaged)
	p.weapon_changed.connect(_on_weapon)
	p.items_changed.connect(_on_items)
	p.item_state_changed.connect(_on_item_state)
	p.respawn_tick.connect(_on_respawn_tick)
	p.respawned.connect(func():
		notice.text = ""
		_use_lbl.text = "")
	_on_hp(p.hp, 100.0)
	_on_ammo(p.mag, p.reserve)
	_on_stance(p.stance)
	_on_weapon(p.weapon)
	_on_items()

func _on_hp(h: float, _m: float) -> void:
	hp_bar.value = h
	hp_text.text = str(int(h))
	var col := Color(0.85, 0.16, 0.18)
	if h > 60:
		col = Color(0.2, 0.75, 0.35)
	elif h > 30:
		col = Color(0.95, 0.7, 0.15)
	_style_bar(hp_bar, col, Color(0.10, 0.11, 0.13))
	_hp_flash_t = 0.25

func _on_ammo(mag: int, reserve: int) -> void:
	if player != null and player.weapon == Player.Weapon.MELEE:
		ammo_label.text = "近战 · 刀"
		ammo_label.add_theme_color_override("font_color", Color(0.85, 0.9, 1.0))
		return
	ammo_label.text = "%d / %d" % [mag, reserve]
	if mag == 0:
		ammo_label.add_theme_color_override("font_color", Color(1.0, 0.35, 0.3))
	else:
		ammo_label.add_theme_color_override("font_color", Color(1.0, 0.92, 0.55))

func _on_stance(s: int) -> void:
	stance_label.text = ["站立", "蹲下", "趴下"][s] if s < 3 else "站立"

func _on_weapon(w: int) -> void:
	if w == Player.Weapon.MELEE:
		stance_label.text = "近战"
		_on_ammo(player.mag, player.reserve)
	else:
		_on_stance(player.stance)

func _on_items() -> void:
	_refresh_heal_btn()
	if _heal_open:
		_rebuild_heal_list()

func _on_item_state(using: int, left: float, total: float) -> void:
	if using < 0:
		_use_lbl.text = ""
		_use_bar.visible = false
		_cancel_btn.visible = false
		return
	_use_bar.visible = true
	_cancel_btn.visible = true
	_use_bar.value = (1.0 - left / maxf(total, 0.001)) * 100.0
	_use_lbl.text = "使用 %s  %.1fs" % [player.item_name(using), left]

func _on_hit(lethal: bool) -> void:
	_hit_t = 0.22
	_hit_lethal = lethal
	hitmark.queue_redraw()
	Sfx.play("hitmark", -8.0)

func _on_damaged(_amount: float, _from: String) -> void:
	_flash_t = 0.45          # 屏幕边框红一下
	_hp_flash_t = 0.30       # 血条红闪一下

func _on_died(_killer: String) -> void:
	notice.text = "已被击杀"

func _on_respawn_tick(sec: int) -> void:
	notice.text = "%d 秒后复活" % sec

## 小地图只在联机模式开启，且受设置里的开关控制
func set_minimap_enabled(on: bool) -> void:
	if minimap != null:
		minimap.visible = on and GameSettings.show_minimap

func set_score(text: String) -> void:
	score_label.text = text

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
	ping_label.text = "PING %dms" % int(ms) if online else ""

# ------------------------------------------------------------------ 绘制
func _process(delta: float) -> void:
	_ensure_layout()
	_fps_acc += delta
	if _fps_acc >= 0.35:
		_fps_acc = 0.0
		var v := Engine.get_frames_per_second()
		var ms := 1000.0 / maxf(v, 1.0)
		fps_label.text = "FPS %d  (%.1fms)" % [int(v), ms]
		fps_label.add_theme_color_override("font_color",
				Color(0.45, 1.0, 0.55) if v >= 55 else
				Color(1.0, 0.85, 0.35) if v >= 30 else Color(1.0, 0.4, 0.35))

	if player != null:
		_spread_px = clampf(player._spread * 900.0, 4.0, 90.0)
		_scope.visible = player.ads and player.weapon == Player.Weapon.RANGED
		# 换弹提示
		if player.is_reloading():
			reload_tip.text = "换弹中… %.1fs" % player.reload_left()
		elif player.weapon == Player.Weapon.RANGED and player.mag == 0:
			reload_tip.text = "弹匣已空 · 点击「换弹」"
		elif player.weapon == Player.Weapon.RANGED and player.mag <= 5:
			reload_tip.text = "弹药不足 %d" % player.mag
		else:
			reload_tip.text = ""
		if player.touch_ads != _ads_on:
			_ads_on = player.touch_ads
	crosshair.queue_redraw()

	if _hit_t > 0.0:
		_hit_t -= delta
		hitmark.queue_redraw()
	if _flash_t > 0.0:
		_flash_t -= delta
		if _damage_layer != null:
			_damage_layer.queue_redraw()
	if _hp_flash_t > 0.0:
		_hp_flash_t -= delta
		if _hp_flash_t <= 0.0 and player != null:
			_on_hp(player.hp, 100.0)

func _draw_stick() -> void:
	var r := _stick_area.size.x * 0.30
	var c := _stick_base
	_stick_knob.draw_circle(c, r, Color(1, 1, 1, 0.07))
	_stick_knob.draw_arc(c, r, 0, TAU, 48, Color(1, 1, 1, 0.18), 3.0)
	_stick_knob.draw_circle(c + _stick_vec * r, r * 0.45, Color(1, 1, 1, 0.22))

func _draw_crosshair() -> void:
	if player != null and player.ads and player.weapon == Player.Weapon.RANGED:
		return  # 开镜时由倍镜自己画准星
	var c := _vp() / 2.0
	var s := GameSettings.cross_size
	var gap := GameSettings.cross_gap * s + _spread_px
	var ln := GameSettings.cross_length * s
	var th := GameSettings.cross_thick * s
	var col := GameSettings.cross_color
	match GameSettings.cross_style:
		GameSettings.CrossStyle.DOT:
			crosshair.draw_circle(c, maxf(1.5, th), col)
		GameSettings.CrossStyle.CIRCLE:
			crosshair.draw_arc(c, maxf(4.0, ln), 0, TAU, 40, col, th)
			if GameSettings.cross_dot:
				crosshair.draw_circle(c, maxf(1.2, th * 0.6), col)
		GameSettings.CrossStyle.CROSS:
			crosshair.draw_line(c + Vector2(-gap - ln, 0), c + Vector2(gap + ln, 0), col, th)
			crosshair.draw_line(c + Vector2(0, -gap - ln), c + Vector2(0, gap + ln), col, th)
			if GameSettings.cross_dot:
				crosshair.draw_circle(c, maxf(1.2, th * 0.6), col)
		_:  # STANDARD：四段臂 + 中心点
			var dirs: Array[Vector2] = [Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1)]
			for d: Vector2 in dirs:
				crosshair.draw_line(c + d * gap, c + d * (gap + ln), col, th)
			if GameSettings.cross_dot:
				crosshair.draw_circle(c, maxf(1.2, th * 0.6), col)

func _make_scope_tex() -> void:
	var n := 256
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	var half := float(n) / 2.0
	for y in n:
		for x in n:
			var dx := float(x) - half
			var dy := float(y) - half
			var d := sqrt(dx * dx + dy * dy) / half
			# 圆内透明，圆外纯黑（形成圆形窥孔）
			var a := 0.0 if d <= 0.985 else 1.0
			img.set_pixel(x, y, Color(0, 0, 0, a))
	_scope_tex = ImageTexture.create_from_image(img)

func _draw_scope() -> void:
	var vp := _vp()
	var c := vp / 2.0
	var r := minf(vp.x, vp.y) * 0.38
	# 圆形窥孔外的黑幕
	if _scope_tex != null:
		_scope.draw_texture_rect(_scope_tex, Rect2(c - Vector2(r, r), Vector2(r * 2, r * 2)), false)
	_scope.draw_rect(Rect2(0, 0, vp.x, c.y - r), Color(0, 0, 0, 1))
	_scope.draw_rect(Rect2(0, c.y + r, vp.x, vp.y - c.y - r), Color(0, 0, 0, 1))
	_scope.draw_rect(Rect2(0, c.y - r, c.x - r, r * 2), Color(0, 0, 0, 1))
	_scope.draw_rect(Rect2(c.x + r, c.y - r, vp.x - c.x - r, r * 2), Color(0, 0, 0, 1))
	# 镜圈
	_scope.draw_arc(c, r, 0, TAU, 64, Color(0.06, 0.07, 0.09), 10.0)
	_scope.draw_arc(c, r - 5, 0, TAU, 64, Color(0.55, 0.62, 0.72, 0.75), 2.0)
	# 镜内准星（细十字 + 中心点）
	var col := GameSettings.cross_color
	var ln := clampf(GameSettings.cross_length * GameSettings.cross_size, 6.0, r * 0.7)
	var th := maxf(1.2, GameSettings.cross_thick * GameSettings.cross_size * 0.7)
	_scope.draw_line(c + Vector2(-ln, 0), c + Vector2(ln, 0), col, th)
	_scope.draw_line(c + Vector2(0, -ln), c + Vector2(0, ln), col, th)
	_scope.draw_circle(c, 1.6, col)
	# 密位刻度
	for i in 3:
		var y := c.y + float(i + 1) * r * 0.22
		_scope.draw_line(c + Vector2(-6, y - c.y), c + Vector2(6, y - c.y), col, 1.5)

func _draw_hitmark() -> void:
	if _hit_t <= 0.0:
		return
	var c := _vp() / 2.0
	var a := lerpf(0.0, 1.0, _hit_t / 0.22) * 0.6 + 0.4
	var col := Color(1.0, 0.25, 0.2, a) if _hit_lethal else Color(1, 1, 1, a)
	var r := 12.0
	var dirs: Array[Vector2] = [Vector2(1, 1), Vector2(1, -1), Vector2(-1, 1), Vector2(-1, -1)]
	for d: Vector2 in dirs:
		hitmark.draw_line(c + d * r * 0.5, c + d * (r + 10), col, 3.0)

func _draw_damage() -> void:
	if _flash_t <= 0.0:
		return
	var vp := _vp()
	var a := clampf(_flash_t / 0.45, 0.0, 1.0) * 0.55
	var layers := 5
	for i in layers:
		var t := float(i) / float(layers)
		var w := lerpf(26.0, 4.0, t)
		var c := Color(1.0, 0.10, 0.12, a * (1.0 - t) * 0.55)
		_damage_layer.draw_rect(Rect2(0, 0, vp.x, w), c)
		_damage_layer.draw_rect(Rect2(0, vp.y - w, vp.x, w), c)
		_damage_layer.draw_rect(Rect2(0, 0, w, vp.y), c)
		_damage_layer.draw_rect(Rect2(vp.x - w, 0, w, vp.y), c)

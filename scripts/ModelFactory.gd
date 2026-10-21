class_name ModelFactory
extends RefCounted
## 临时测试资源：全部用代码搭几何体，不依赖任何外部模型文件。
## 后续有正式模型时，直接替换 build_soldier / build_gun 的返回值即可。

static var MAT_CACHE := {}
static var _skin_tex: Texture2D = null

## 自定义人物贴图：从 GameSettings.skin_path 载入并裁剪到人形比例。
## 任意比例的图都能用，这里按 HUMAN_ASPECT 居中裁剪。
const HUMAN_ASPECT := 0.5        # 宽/高，0.5 = 竖长条，接近人体轮廓

static func mat(color: Color, rough: float = 0.85, metal: float = 0.05) -> StandardMaterial3D:
	var key := "%s-%s-%s" % [color.to_html(), rough, metal]
	if MAT_CACHE.has(key):
		return MAT_CACHE[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = rough
	m.metallic = metal
	MAT_CACHE[key] = m
	return m

## 每实例独立材质（贴皮肤时必须独立，否则会污染所有实例）
static func _own_mat(color: Color, tex: Texture2D) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 0.8
	m.metallic = 0.03
	if tex != null:
		m.albedo_texture = tex
	return m

static func box(w: float, h: float, d: float, color: Color, rough: float = 0.85) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(w, h, d)
	mi.mesh = bm
	mi.material_override = mat(color, rough)
	return mi

# ---------------------------------------------------------------- 皮肤
static func reload_skin() -> void:
	_skin_tex = null
	var path: String = GameSettings.skin_path
	if path == "":
		return
	if not path.begins_with("res://") and not path.begins_with("user://"):
		path = "user://" + path
	if not ResourceLoader.exists(path):
		push_warning("[ModelFactory] 皮肤文件不存在: %s" % path)
		return
	var img := Image.load_from_file(ProjectSettings.globalize_path(path))
	if img == null:
		return
	var w := img.get_width()
	var h := img.get_height()
	# 按人形比例居中裁剪
	var cw: int = w
	var ch: int = h
	if float(w) / float(h) > HUMAN_ASPECT:
		cw = int(float(h) * HUMAN_ASPECT)
	else:
		ch = int(float(w) / HUMAN_ASPECT)
	cw = clampi(cw, 8, w)
	ch = clampi(ch, 8, h)
	var x := (w - cw) / 2
	var y := (h - ch) / 2
	var cropped := img.get_region(Rect2i(x, y, cw, ch))
	cropped.resize(128, 256, Image.INTERPOLATE_LANCZOS)
	_skin_tex = ImageTexture.create_from_image(cropped)
	print("[ModelFactory] 已载入皮肤: %s" % path)

static func skin_texture() -> Texture2D:
	if _skin_tex == null and GameSettings.skin_path != "":
		reload_skin()
	return _skin_tex

# ---------------------------------------------------------------- 士兵
## 标准火柴人：白色、肢体加粗。原点在脚底，身高 1.8m。
## root 上用 meta 暴露可动部件供动画使用（腿/躯干/手臂）。
static func build_soldier(body: Color = Color(0.93, 0.95, 0.98),
		helmet: Color = Color(0.93, 0.95, 0.98),
		accent: Color = Color(0.93, 0.95, 0.98)) -> Node3D:
	var root := Node3D.new()
	root.name = "Model"

	var white := Color(0.93, 0.95, 0.98)
	var tex := skin_texture()

	var rig := Node3D.new()
	rig.name = "Rig"
	root.add_child(rig)

	var legs := Node3D.new()
	legs.name = "Legs"
	rig.add_child(legs)
	# 每条腿单独做成以髋部为轴的节点，跑动时才能分别摆动
	var leg_l := Node3D.new()
	leg_l.name = "LegL"
	leg_l.position = Vector3(-0.13, 0.72, 0)
	legs.add_child(leg_l)
	var leg_r := Node3D.new()
	leg_r.name = "LegR"
	leg_r.position = Vector3(0.13, 0.72, 0)
	legs.add_child(leg_r)
	for pair in [[leg_l, -1.0], [leg_r, 1.0]]:
		var pivot: Node3D = pair[0]
		var leg := box(0.15, 0.72, 0.15, white, 0.75)
		leg.position = Vector3(0, -0.36, 0)
		pivot.add_child(leg)
		var foot := box(0.17, 0.09, 0.24, white, 0.75)
		foot.position = Vector3(0, -0.675, 0.04)
		pivot.add_child(foot)
	# 髋部横杆，让两条腿连起来
	var hip := box(0.42, 0.13, 0.13, white, 0.75)
	hip.position = Vector3(0, 0.72, 0)
	legs.add_child(hip)

	var torso_root := Node3D.new()
	torso_root.name = "Torso"
	torso_root.position = Vector3(0, 0.78, 0)
	rig.add_child(torso_root)
	# 躯干：一根粗竖杆
	var spine := box(0.19, 0.62, 0.17, white, 0.75)
	spine.position = Vector3(0, 0.31, 0)
	torso_root.add_child(spine)
	# 肩部横杆
	var shoulder := box(0.54, 0.13, 0.13, white, 0.75)
	shoulder.position = Vector3(0, 0.56, 0)
	torso_root.add_child(shoulder)
	# 胸口小块（贴皮肤时这块显示贴图）
	var chest := box(0.26, 0.30, 0.19, white, 0.75)
	chest.position = Vector3(0, 0.34, 0.005)
	chest.material_override = _own_mat(white, tex)
	torso_root.add_child(chest)
	# 头
	var neck := box(0.09, 0.10, 0.09, white, 0.75)
	neck.position = Vector3(0, 0.68, 0)
	torso_root.add_child(neck)
	var head := box(0.25, 0.25, 0.23, white, 0.7)
	head.position = Vector3(0, 0.85, 0)
	head.material_override = _own_mat(white, tex)
	torso_root.add_child(head)

	var arm_l := Node3D.new()
	arm_l.name = "ArmL"
	arm_l.position = Vector3(-0.27, 0.56, 0)
	torso_root.add_child(arm_l)
	var al := box(0.12, 0.50, 0.12, white, 0.75)
	al.position = Vector3(0, -0.25, 0)
	arm_l.add_child(al)
	var arm_r := Node3D.new()
	arm_r.name = "ArmR"
	arm_r.position = Vector3(0.27, 0.56, 0)
	torso_root.add_child(arm_r)
	var ar := box(0.12, 0.50, 0.12, white, 0.75)
	ar.position = Vector3(0, -0.25, 0)
	arm_r.add_child(ar)

	var hand := Node3D.new()
	hand.name = "WeaponSlot"
	hand.position = Vector3(0.16, 0.30, -0.18)
	torso_root.add_child(hand)

	root.set_meta("rig", rig)
	root.set_meta("legs", legs)
	root.set_meta("torso", torso_root)
	root.set_meta("arm_l", arm_l)
	root.set_meta("arm_r", arm_r)
	root.set_meta("leg_l", leg_l)
	root.set_meta("leg_r", leg_r)
	root.set_meta("weapon_slot", hand)
	return root

# ---------------------------------------------------------------- 跑动动画
## 依据水平速度摆动四肢与躯干。speed 单位 m/s，t 为累计相位。
static func animate_rig(model: Node3D, speed: float, t: float, sprinting: bool) -> void:
	if model == null or not model.has_meta("leg_l"):
		return
	var leg_l := model.get_meta("leg_l") as Node3D
	var leg_r := model.get_meta("leg_r") as Node3D
	var arm_l := model.get_meta("arm_l") as Node3D
	var arm_r := model.get_meta("arm_r") as Node3D
	var torso := model.get_meta("torso") as Node3D
	if leg_l == null or leg_r == null:
		return

	if speed < 0.35:
		# 站立：缓慢回正
		leg_l.rotation.x = lerpf(leg_l.rotation.x, 0.0, 0.2)
		leg_r.rotation.x = lerpf(leg_r.rotation.x, 0.0, 0.2)
		if arm_l != null:
			arm_l.rotation.x = lerpf(arm_l.rotation.x, 0.0, 0.2)
		if arm_r != null:
			arm_r.rotation.x = lerpf(arm_r.rotation.x, 0.0, 0.2)
		if torso != null:
			torso.position.y = lerpf(torso.position.y, 0.78, 0.2)
		return

	var amp := clampf(speed / 5.4, 0.0, 1.7) * (0.80 if sprinting else 0.52)
	var f := t * (3.4 if sprinting else 2.6)
	var swing := sin(f)
	leg_l.rotation.x = swing * amp
	leg_r.rotation.x = -swing * amp
	if arm_l != null:
		arm_l.rotation.x = -swing * amp * 0.75
	if arm_r != null:
		arm_r.rotation.x = swing * amp * 0.75
	if torso != null:
		# 跑动时躯干上下起伏 + 略微前倾
		torso.position.y = 0.78 + absf(cos(f)) * amp * 0.035
		torso.rotation.x = -clampf(speed / 5.4, 0.0, 1.7) * (0.14 if sprinting else 0.06)

# ---------------------------------------------------------------- 枪械 / 近战
## 原点在握把处，朝 -Z 为枪口方向。
static func build_gun(body_color: Color = Color(0.16, 0.17, 0.2)) -> Node3D:
	var g := Node3D.new()
	g.name = "Gun"

	var receiver := box(0.09, 0.12, 0.52, body_color, 0.5)
	receiver.position = Vector3(0, 0, -0.1)
	g.add_child(receiver)

	var barrel := box(0.045, 0.045, 0.42, Color(0.1, 0.1, 0.12), 0.35)
	barrel.position = Vector3(0, 0.005, -0.52)
	g.add_child(barrel)

	var handguard := box(0.07, 0.08, 0.26, Color(0.13, 0.14, 0.16), 0.7)
	handguard.position = Vector3(0, 0.0, -0.36)
	g.add_child(handguard)

	var mag := box(0.07, 0.26, 0.12, Color(0.22, 0.22, 0.25), 0.6)
	mag.position = Vector3(0, -0.17, -0.02)
	mag.rotation.x = deg_to_rad(8)
	g.add_child(mag)

	var grip := box(0.07, 0.19, 0.1, Color(0.11, 0.11, 0.13), 0.75)
	grip.position = Vector3(0, -0.13, 0.1)
	grip.rotation.x = deg_to_rad(-12)
	g.add_child(grip)

	var stock := box(0.075, 0.13, 0.26, body_color, 0.6)
	stock.position = Vector3(0, -0.02, 0.28)
	g.add_child(stock)

	var sight := box(0.055, 0.075, 0.16, Color(0.09, 0.1, 0.13), 0.4)
	sight.position = Vector3(0, 0.1, -0.12)
	g.add_child(sight)
	var lens := box(0.045, 0.05, 0.012, Color(0.35, 0.85, 0.95, 1.0), 0.15)
	lens.position = Vector3(0, 0.1, -0.2)
	g.add_child(lens)

	var muzzle := Marker3D.new()
	muzzle.name = "Muzzle"
	muzzle.position = Vector3(0, 0.005, -0.74)
	g.add_child(muzzle)
	g.set_meta("muzzle", muzzle)
	return g

## 近战武器：一把刀。原点在握把，刀刃朝 -Z。
static func build_knife() -> Node3D:
	var k := Node3D.new()
	k.name = "Knife"
	var grip := box(0.05, 0.05, 0.20, Color(0.12, 0.11, 0.10), 0.8)
	grip.position = Vector3(0, 0, 0.08)
	k.add_child(grip)
	var guard := box(0.16, 0.04, 0.04, Color(0.35, 0.36, 0.40), 0.4)
	guard.position = Vector3(0, 0, -0.03)
	k.add_child(guard)
	var blade := box(0.035, 0.10, 0.42, Color(0.72, 0.75, 0.82), 0.18)
	blade.position = Vector3(0, 0.01, -0.26)
	k.add_child(blade)
	var tip := box(0.02, 0.05, 0.10, Color(0.72, 0.75, 0.82), 0.18)
	tip.position = Vector3(0, 0.0, -0.50)
	tip.rotation.x = deg_to_rad(-18)
	k.add_child(tip)
	var m := Marker3D.new()
	m.name = "Muzzle"
	m.position = Vector3(0, 0.01, -0.52)
	k.add_child(m)
	k.set_meta("muzzle", m)
	return k

# ---------------------------------------------------------------- 地图
## 布局数据：小地图与实体碰撞共用同一份，保证两者永远一致。
## 返回 [{p:Vector3, s:Vector3, c:Color, kind:String}]
# 中央高台 14x2.4x14（顶面 y=2.4，边缘 x/z = ±7）
# 斜坡中心半径 9.5、中心高 1.20，沿坡半长 2.96 => 内端 r≈6.8/y≈2.42（压住台面），
# 外端 r≈12.2/y≈-0.02（埋进地面消除台阶）
const RAMP_WIDTH := 6.0
const RAMP_THICK := 0.6
const RAMP_DEPTH := 6.0
const RAMP_MID_R := 9.5
const RAMP_MID_Y := 1.20
const RAMP_TILT := deg_to_rad(24.31)

static func arena_layout(size: float = 60.0) -> Array:
	var L: Array = []
	var half := size / 2.0
	# 四面围墙
	for i in 4:
		var is_x := i < 2
		var s := Vector3(size if is_x else 0.8, 6.0, 0.8 if is_x else size)
		var p := Vector3(0, 3.0, -half) if i == 0 else \
				Vector3(0, 3.0, half) if i == 1 else \
				Vector3(-half, 3.0, 0) if i == 2 else Vector3(half, 3.0, 0)
		L.append({"p": p, "s": s, "c": Color(0.34, 0.35, 0.38), "kind": "wall"})
	# 掩体
	var boxes := [
		[Vector3(-12, 1.0, -8), Vector3(4, 2, 4), Color(0.45, 0.42, 0.36)],
		[Vector3(9, 0.9, -14), Vector3(5, 1.8, 3), Color(0.40, 0.43, 0.40)],
		[Vector3(16, 1.2, 6), Vector3(3, 2.4, 6), Color(0.46, 0.38, 0.32)],
		[Vector3(-18, 1.1, 12), Vector3(6, 2.2, 3), Color(0.38, 0.42, 0.46)],
		[Vector3(2, 0.8, 18), Vector3(8, 1.6, 3), Color(0.44, 0.40, 0.34)],
		[Vector3(-6, 0.7, 2), Vector3(3, 1.4, 3), Color(0.42, 0.44, 0.38)],
		[Vector3(22, 0.9, -20), Vector3(4, 1.8, 4), Color(0.36, 0.40, 0.44)],
		[Vector3(-22, 0.9, -20), Vector3(4, 1.8, 4), Color(0.36, 0.40, 0.44)],
	]
	for b in boxes:
		L.append({"p": b[0], "s": b[1], "c": b[2], "kind": "box"})
	# 中央高台
	L.append({"p": Vector3(0, 1.2, 0), "s": Vector3(14, 2.4, 14),
			"c": Color(0.40, 0.41, 0.44), "kind": "plat"})
	# 装饰立柱
	for k in 8:
		var a := deg_to_rad(45.0 * k)
		L.append({"p": Vector3(cos(a) * 24, 2.5, sin(a) * 24), "s": Vector3(1.2, 5, 1.2),
				"c": Color(0.33, 0.34, 0.38), "kind": "pillar"})
	return L

## 中央高台的四面斜坡。
## 姿态用显式 Basis 构造：先绕自身 X 轴倾斜，再绕世界 Y 轴转向，
## 避免欧拉角复合把某几块斜坡拧成竖立的一堵薄墙。
##
## 关键：tilt 必须为正。Basis(X, +tilt) 会把局部 +Z 端压低、局部 -Z 端抬高，
## 而局部 +Z 朝外（远离中心），所以「外低内高」才是能走上高台的坡。
## 取负号会变成外高内低：坡底埋进地里、坡顶悬空，看着就像一堵薄墙。
static func _build_ramp(pos: Vector3, yaw: float, tilt: float) -> StaticBody3D:
	var b := StaticBody3D.new()
	b.collision_layer = 1
	b.position = pos
	var bx := Basis(Vector3(1, 0, 0), tilt)
	var by := Basis(Vector3(0, 1, 0), yaw)
	b.basis = by * bx
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(RAMP_WIDTH, RAMP_THICK, RAMP_DEPTH)
	mi.mesh = bm
	mi.material_override = mat(Color(0.42, 0.43, 0.46), 0.9)
	b.add_child(mi)
	var c := CollisionShape3D.new()
	var cs := BoxShape3D.new()
	cs.size = bm.size
	c.shape = cs
	b.add_child(c)
	return b

static func build_arena(size: float = 60.0) -> Node3D:
	var root := Node3D.new()
	root.name = "Arena"

	var ground := StaticBody3D.new()
	ground.name = "Ground"
	ground.collision_layer = 1
	var gmi := MeshInstance3D.new()
	var gbm := BoxMesh.new()
	gbm.size = Vector3(size, 1.0, size)
	gmi.mesh = gbm
	gmi.material_override = mat(Color(0.30, 0.32, 0.27), 0.95)
	gmi.position = Vector3(0, -0.5, 0)
	ground.add_child(gmi)
	var gc := CollisionShape3D.new()
	var gs := BoxShape3D.new()
	gs.size = Vector3(size, 1.0, size)
	gc.shape = gs
	gc.position = Vector3(0, -0.5, 0)
	ground.add_child(gc)
	root.add_child(ground)

	for it in arena_layout(size):
		var p: Vector3 = it["p"]
		var s: Vector3 = it["s"]
		var col: Color = it["c"]
		root.add_child(_static_box(p, s, col))

	# 中央高台四面斜坡：外端贴地、内端搭在高台顶(2.4m)上
	for k in 4:
		var a := deg_to_rad(90.0 * k)
		var r := _build_ramp(Vector3(cos(a) * RAMP_MID_R, RAMP_MID_Y, sin(a) * RAMP_MID_R),
				deg_to_rad(90.0) - a, RAMP_TILT)
		r.name = "Ramp%d" % k
		root.add_child(r)
	return root

static func _static_box(pos: Vector3, size: Vector3, color: Color) -> StaticBody3D:
	var b := StaticBody3D.new()
	b.collision_layer = 1
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = mat(color, 0.9)
	b.add_child(mi)
	var c := CollisionShape3D.new()
	var cs := BoxShape3D.new()
	cs.size = size
	c.shape = cs
	b.add_child(c)
	b.position = pos
	return b

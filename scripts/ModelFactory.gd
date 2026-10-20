class_name ModelFactory
extends RefCounted
## 临时测试资源：全部用代码搭几何体，不依赖任何外部模型文件。
## 后续有正式模型时，直接替换 build_soldier / build_gun 的返回值即可。

var MAT_CACHE := {}

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

static func box(w: float, h: float, d: float, color: Color, rough: float = 0.85) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(w, h, d)
	mi.mesh = bm
	mi.material_override = mat(color, rough)
	return mi

## ---------------------------------------------------------------- 士兵
## 原点在脚底，身高 1.8m。root 上用 meta 暴露可动部件供动画使用。
static func build_soldier(body: Color, helmet: Color, accent: Color) -> Node3D:
	var root := Node3D.new()
	root.name = "Model"

	var rig := Node3D.new()          # 姿态根节点（蹲/趴 时对它变换）
	rig.name = "Rig"
	root.add_child(rig)

	var legs := Node3D.new()
	legs.name = "Legs"
	rig.add_child(legs)
	var leg_l := box(0.19, 0.85, 0.24, body)
	leg_l.position = Vector3(-0.14, 0.425, 0)
	legs.add_child(leg_l)
	var leg_r := box(0.19, 0.85, 0.24, body)
	leg_r.position = Vector3(0.14, 0.425, 0)
	legs.add_child(leg_r)
	var boot_l := box(0.21, 0.1, 0.3, Color(0.13, 0.13, 0.15))
	boot_l.position = Vector3(-0.14, 0.05, 0.03)
	legs.add_child(boot_l)
	var boot_r := box(0.21, 0.1, 0.3, Color(0.13, 0.13, 0.15))
	boot_r.position = Vector3(0.14, 0.05, 0.03)
	legs.add_child(boot_r)

	var torso_root := Node3D.new()
	torso_root.name = "Torso"
	torso_root.position = Vector3(0, 0.85, 0)
	rig.add_child(torso_root)
	var chest := box(0.58, 0.55, 0.32, body)
	chest.position = Vector3(0, 0.3, 0)
	torso_root.add_child(chest)
	var vest := box(0.62, 0.34, 0.36, accent, 0.7)
	vest.position = Vector3(0, 0.28, 0)
	torso_root.add_child(vest)
	var belt := box(0.6, 0.09, 0.34, Color(0.16, 0.16, 0.18))
	belt.position = Vector3(0, 0.06, 0)
	torso_root.add_child(belt)
	var head := box(0.24, 0.26, 0.24, Color(0.86, 0.7, 0.58))
	head.position = Vector3(0, 0.72, 0)
	torso_root.add_child(head)
	var helm := box(0.28, 0.15, 0.28, helmet, 0.6)
	helm.position = Vector3(0, 0.83, 0)
	torso_root.add_child(helm)
	var visor := box(0.24, 0.07, 0.04, Color(0.08, 0.09, 0.12), 0.25)
	visor.position = Vector3(0, 0.72, -0.13)
	torso_root.add_child(visor)

	var arm_l := Node3D.new()
	arm_l.name = "ArmL"
	arm_l.position = Vector3(-0.36, 0.5, 0)
	torso_root.add_child(arm_l)
	var al := box(0.16, 0.52, 0.18, body)
	al.position = Vector3(0, -0.24, 0)
	arm_l.add_child(al)
	var arm_r := Node3D.new()
	arm_r.name = "ArmR"
	arm_r.position = Vector3(0.36, 0.5, 0)
	torso_root.add_child(arm_r)
	var ar := box(0.16, 0.52, 0.18, body)
	ar.position = Vector3(0, -0.24, 0)
	arm_r.add_child(arm_r)

	# 手持武器的挂点
	var hand := Node3D.new()
	hand.name = "WeaponSlot"
	hand.position = Vector3(0.02, 0.34, -0.22)
	torso_root.add_child(hand)

	root.set_meta("rig", rig)
	root.set_meta("legs", legs)
	root.set_meta("torso", torso_root)
	root.set_meta("arm_l", arm_l)
	root.set_meta("arm_r", arm_r)
	root.set_meta("weapon_slot", hand)
	return root

## ---------------------------------------------------------------- 枪械
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

## ---------------------------------------------------------------- 测试地图
## 60x60 竞技场：地面 + 围墙 + 掩体箱 + 高台，全部带静态碰撞。
static func build_arena(size: float = 60.0) -> Node3D:
	var root := Node3D.new()
	root.name = "Arena"

	var ground := StaticBody3D.new()
	ground.name = "Ground"
	ground.collision_layer = 1
	var gmi := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(size, size)
	gmi.mesh = pm
	gmi.material_override = mat(Color(0.30, 0.32, 0.27), 0.95)
	gmi.rotation.x = deg_to_rad(-90)
	ground.add_child(gmi)
	var gc := CollisionShape3D.new()
	var gs := BoxShape3D.new()
	gs.size = Vector3(size, 1.0, size)
	gc.shape = gs
	gc.position = Vector3(0, -0.5, 0)
	ground.add_child(gc)
	root.add_child(ground)

	var wall_h := 6.0
	var half := size / 2.0
	for i in 4:
		var w := StaticBody3D.new()
		w.name = "Wall%d" % i
		w.collision_layer = 1
		var mi := MeshInstance3D.new()
		var bm := BoxMesh.new()
		var is_x := i < 2
		bm.size = Vector3(size if is_x else 0.8, wall_h, 0.8 if is_x else size)
		mi.mesh = bm
		mi.material_override = mat(Color(0.34, 0.35, 0.38), 0.9)
		mi.position = Vector3(0, wall_h / 2.0, 0)
		w.add_child(mi)
		var c := CollisionShape3D.new()
		var wshape := BoxShape3D.new()
		wshape.size = bm.size
		c.shape = wshape
		c.position = mi.position
		w.add_child(c)
		w.position = Vector3(0, 0, -half) if i == 0 else \
				Vector3(0, 0, half) if i == 1 else \
				Vector3(-half, 0, 0) if i == 2 else Vector3(half, 0, 0)
		root.add_child(w)

	# 掩体（确定性伪随机，保证每次布局一致）
	var rng := RandomNumberGenerator.new()
	rng.seed = 20240617
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
		root.add_child(_static_box(b[0], b[1], b[2]))

	# 中央高台 + 斜坡
	var plat := _static_box(Vector3(0, 1.2, 0), Vector3(14, 2.4, 14), Color(0.40, 0.41, 0.44))
	root.add_child(plat)
	for k in 4:
		var a := deg_to_rad(90.0 * k)
		var ramp := StaticBody3D.new()
		ramp.collision_layer = 1
		var rmi := MeshInstance3D.new()
		var rbm := BoxMesh.new()
		rbm.size = Vector3(5, 0.5, 8)
		rmi.mesh = rbm
		rmi.material_override = mat(Color(0.42, 0.43, 0.46), 0.9)
		ramp.add_child(rmi)
		var rc := CollisionShape3D.new()
		var rs := BoxShape3D.new()
		rs.size = rbm.size
		rc.shape = rs
		ramp.add_child(rc)
		ramp.position = Vector3(cos(a) * 10.5, 1.0, sin(a) * 10.5)
		ramp.rotation.y = -a
		ramp.rotation.x = deg_to_rad(-22)
		root.add_child(ramp)

	# 装饰性立柱
	for k in 8:
		var a := deg_to_rad(45.0 * k)
		var p := _static_box(Vector3(cos(a) * 24, 2.5, sin(a) * 24),
				Vector3(1.2, 5, 1.2), Color(0.33, 0.34, 0.38))
		root.add_child(p)
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

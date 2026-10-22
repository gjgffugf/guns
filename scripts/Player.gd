class_name Player
extends CharacterBody3D
## 本地玩家：移动 / 跳跃 / 疾跑 / 蹲下 / 趴下 / 开镜 / 射击 / 近战 / 治疗物。
## 模型、枪械均由 ModelFactory 用代码生成（临时资源）。

signal hp_changed(hp: float, max_hp: float)
signal ammo_changed(mag: int, reserve: int)
signal stance_changed(stance: int)
signal died(killer: String)
signal respawned()
signal hit_confirmed(lethal: bool)
signal damaged(amount: float, from_name: String)
signal weapon_changed(w: int)
signal items_changed()
signal item_state_changed(using: int, left: float, total: float)
signal respawn_tick(sec: int)

enum Stance { STAND, CROUCH, PRONE }
enum Weapon { RANGED, MELEE }
enum Item { BANDAGE, MEDKIT, DRINK }

# ---- 移动参数 ----
const WALK_SPEED := 5.4
const SPRINT_MUL := 1.62
const CROUCH_MUL := 0.52
const PRONE_MUL := 0.26
const ADS_MUL := 0.55
const ACCEL := 14.0
const AIR_ACCEL := 3.0
const JUMP_VELOCITY := 6.4
const GRAVITY := 21.0

# ---- 姿态 ----
const STANCE_HEIGHT := {Stance.STAND: 1.8, Stance.CROUCH: 1.15, Stance.PRONE: 0.7}
const STANCE_EYE := {Stance.STAND: 1.62, Stance.CROUCH: 1.0, Stance.PRONE: 0.42}
const CAPSULE_RADIUS := 0.28

# ---- 战斗参数 ----
const MAX_HP := 100.0
const MAG_SIZE := 30
const RESERVE_SIZE := 150
const FIRE_INTERVAL := 0.095      # ~630 RPM
const RELOAD_TIME := 1.9
const DAMAGE := 25.0
const HEADSHOT_DAMAGE := 58.0
const RANGE := 300.0
const BASE_SPREAD := 0.028
const ADS_SPREAD := 0.002
const MOVE_SPREAD := 0.030
const RECOIL_PITCH := 0.013
const RECOIL_YAW := 0.004
const FOV_HIP := 62.0
const FOV_ADS := 38.0

# ---- 近战：刀，伤害 10，攻速为枪的 40%（间隔 = 枪间隔 / 0.4）----
const MELEE_DAMAGE := 10.0
const MELEE_RANGE := 2.6
const MELEE_SPEED_MUL := 0.4
const MELEE_INTERVAL := FIRE_INTERVAL / MELEE_SPEED_MUL

# ---- 治疗物 ----
const ITEM_NAMES := {
	Item.BANDAGE: "破损的绷带",
	Item.MEDKIT: "布满灰的急救包",
	Item.DRINK: "冰冰冰",
}
const ITEM_TIME := {Item.BANDAGE: 5.0, Item.MEDKIT: 7.0, Item.DRINK: 4.0}
const ITEM_START := {Item.BANDAGE: 3, Item.MEDKIT: 1, Item.DRINK: 2}
const BANDAGE_HEAL := 40.0
# 能量饮料：+10% 移速 / -20% 受伤 / +10% 输出，持续 15 秒
const DRINK_DURATION := 15.0
const DRINK_SPEED_MUL := 1.10
const DRINK_TAKEN_MUL := 0.80
const DRINK_DEALT_MUL := 1.10

var hp: float = MAX_HP
var alive: bool = true
var stance: int = Stance.STAND
var ads: bool = false
var sprinting: bool = false
var mag: int = MAG_SIZE
var reserve: int = RESERVE_SIZE
var kills: int = 0
var deaths: int = 0
var display_name: String = "你"
var weapon: int = Weapon.RANGED

# 治疗物
var selected_item: int = Item.BANDAGE
var _items: Dictionary = {}
var _using_item: int = -1
var _use_t: float = 0.0
var _use_total: float = 0.0
var _buff_t: float = 0.0

# 由外部（键盘 / 虚拟摇杆 / HUD 按钮）写入
var move_axis: Vector2 = Vector2.ZERO
var jump_buffer_t: float = 0.0
var coyote_t: float = 0.0
const JUMP_BUFFER := 0.13
const COYOTE_TIME := 0.10
var want_fire: bool = false
var touch_ads: bool = false
var touch_sprint: bool = false

var _kb_ads: bool = false
var _kb_sprint: bool = false
var _look := Vector2.ZERO
var _yaw: float = 0.0
var _pitch: float = 0.0
var _fire_cd: float = 0.0
var _reloading: float = 0.0
var _spread: float = BASE_SPREAD
var _bob_t: float = 0.0
var _respawn_t: float = 0.0
var _respawn_last: int = -1
var respawn_point: Vector3 = Vector3.INF
var _recoil := Vector2.ZERO
var _recoil_vel := Vector2.ZERO
var _last_damage_from: String = ""
var _anim_t: float = 0.0

var head: Node3D
var camera: Camera3D
var weapon_holder: Node3D
var _gun_model: Node3D
var _knife_model: Node3D
var muzzle: Marker3D
var ray: RayCast3D
var shape: CollisionShape3D
var model: Node3D
var _rig: Node3D
var _legs: Node3D
var _torso: Node3D
var muzzle_flash: MeshInstance3D
var _flash_t: float = 0.0

var _prev_pos: Vector3
var _curr_pos: Vector3


## 当前设备是否带触摸屏（用于屏蔽鼠标模拟事件）
static func _is_touch_device() -> bool:
	return DisplayServer.is_touchscreen_available()

func _ready() -> void:
	add_to_group("entity")
	_items = {}
	for k in ITEM_START:
		_items[k] = ITEM_START[k]
	_build()

func _build() -> void:
	collision_layer = 2
	collision_mask = 1

	shape = CollisionShape3D.new()
	var cs := CapsuleShape3D.new()
	cs.radius = CAPSULE_RADIUS
	cs.height = STANCE_HEIGHT[Stance.STAND]
	shape.shape = cs
	shape.position = Vector3(0, cs.height / 2.0, 0)
	add_child(shape)

	model = ModelFactory.build_soldier()
	model.visible = false
	add_child(model)
	_rig = model.get_meta("rig")
	_legs = model.get_meta("legs")
	_torso = model.get_meta("torso")

	head = Node3D.new()
	head.name = "Head"
	head.position.y = STANCE_EYE[Stance.STAND]
	add_child(head)

	camera = Camera3D.new()
	camera.name = "Camera3D"
	camera.fov = FOV_HIP
	camera.near = 0.05
	camera.far = 600.0
	camera.current = true
	head.add_child(camera)

	ray = RayCast3D.new()
	ray.name = "AimRay"
	ray.enabled = true
	ray.target_position = Vector3(0, 0, -RANGE)
	ray.collision_mask = 1 | 2
	ray.collide_with_areas = false
	ray.collide_with_bodies = true
	ray.add_exception(self)
	camera.add_child(ray)

	weapon_holder = Node3D.new()
	weapon_holder.name = "WeaponHolder"
	weapon_holder.position = Vector3(0.17, -0.15, -0.32)
	camera.add_child(weapon_holder)

	_gun_model = ModelFactory.build_gun()
	_gun_model.name = "Gun"
	weapon_holder.add_child(_gun_model)
	_knife_model = ModelFactory.build_knife()
	_knife_model.name = "Knife"
	_knife_model.visible = false
	weapon_holder.add_child(_knife_model)
	muzzle = _gun_model.get_meta("muzzle")

	muzzle_flash = MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(0.22, 0.22)
	muzzle_flash.mesh = qm
	var fm := StandardMaterial3D.new()
	fm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fm.albedo_color = Color(1.0, 0.82, 0.35, 1.0)
	fm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	fm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	muzzle_flash.material_override = fm
	muzzle_flash.visible = false
	muzzle.add_child(muzzle_flash)

	_prev_pos = global_position
	_curr_pos = global_position
	_apply_weapon_visual()

# ------------------------------------------------------------------ 武器
func toggle_weapon() -> void:
	if _using_item >= 0:
		return
	weapon = Weapon.MELEE if weapon == Weapon.RANGED else Weapon.RANGED
	Sfx.play("click", -6.0)
	_apply_weapon_visual()
	emit_signal("weapon_changed", weapon)

func _apply_weapon_visual() -> void:
	if _gun_model == null or _knife_model == null:
		return
	var is_melee := weapon == Weapon.MELEE
	_gun_model.visible = not is_melee
	_knife_model.visible = is_melee
	muzzle = (_knife_model if is_melee else _gun_model).get_meta("muzzle")
	if muzzle_flash != null:
		muzzle_flash.reparent(muzzle)
		muzzle_flash.position = Vector3.ZERO
	# 近战不能开镜
	if is_melee:
		ads = false
		touch_ads = false
		_kb_ads = false

# ------------------------------------------------------------------ 治疗物
func item_name(i: int) -> String:
	return ITEM_NAMES.get(i, "物品")

func item_count(i: int) -> int:
	return int(_items.get(i, 0))

func select_item(i: int) -> void:
	if selected_item == i:
		return
	selected_item = i
	emit_signal("items_changed")

func use_selected_item() -> void:
	if not alive or _using_item >= 0:
		return
	var i := selected_item
	if item_count(i) <= 0:
		return
	_using_item = i
	_use_total = float(ITEM_TIME.get(i, 5.0))
	_use_t = _use_total
	want_fire = false
	Sfx.play("click", -4.0)
	emit_signal("item_state_changed", _using_item, _use_t, _use_total)

func cancel_item() -> void:
	if _using_item < 0:
		return
	_using_item = -1
	_use_t = 0.0
	Sfx.play("click", -8.0)
	emit_signal("item_state_changed", -1, 0.0, 0.0)

func _finish_item() -> void:
	var i := _using_item
	_using_item = -1
	_use_t = 0.0
	_items[i] = maxi(0, item_count(i) - 1)
	match i:
		Item.BANDAGE:
			hp = minf(MAX_HP, hp + BANDAGE_HEAL)
			emit_signal("hp_changed", hp, MAX_HP)
		Item.MEDKIT:
			hp = MAX_HP
			emit_signal("hp_changed", hp, MAX_HP)
		Item.DRINK:
			_buff_t = DRINK_DURATION
	emit_signal("item_state_changed", -1, 0.0, 0.0)
	emit_signal("items_changed")
	Sfx.play("click", -2.0)
	# 用完了就自动切到还有存货的那个
	if item_count(selected_item) <= 0:
		for k in ITEM_START:
			if item_count(k) > 0:
				selected_item = k
				break

func _update_items(delta: float) -> void:
	if _buff_t > 0.0:
		_buff_t -= delta
	if _using_item < 0:
		return
	_use_t -= delta
	if _use_t <= 0.0:
		_finish_item()
	else:
		emit_signal("item_state_changed", _using_item, _use_t, _use_total)

func is_using_item() -> bool:
	return _using_item >= 0

# ------------------------------------------------------------------ 输入
func _unhandled_input(e: InputEvent) -> void:
	if not alive:
		return
	# 触摸设备上忽略鼠标事件。
	#
	# Godot 默认开启 emulate_mouse_from_touch，手指点一下会同时发出
	# InputEventScreenTouch 和 InputEventMouseButton(左键)。HUD 处理完
	# 触摸后如果没有把事件标记为已消费，这个鼠标事件就会继续流到这里，
	# 于是「点屏幕任何地方都变成开火」。
	# project.godot 里已经把该选项关掉了，这里再加一道保险。
	if _is_touch_device() and (e is InputEventMouseButton or e is InputEventMouseMotion):
		return
	if e is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		add_look(e.relative * 0.0022 * GameSettings.sensitivity)
	elif e is InputEventMouseButton and e.pressed:
		match e.button_index:
			MOUSE_BUTTON_LEFT:
				want_fire = true
			MOUSE_BUTTON_RIGHT:
				# 开镜改为点击切换，不再长按
				if weapon == Weapon.RANGED:
					_kb_ads = not _kb_ads
	elif e is InputEventMouseButton and not e.pressed:
		match e.button_index:
			MOUSE_BUTTON_LEFT:
				want_fire = false
	elif e is InputEventKey and e.pressed and not e.echo:
		match e.physical_keycode:
			KEY_C:
				_toggle_stance(Stance.CROUCH)
			KEY_Z:
				_toggle_stance(Stance.PRONE)
			KEY_R:
				start_reload()
			KEY_SPACE:
				request_jump()
			KEY_V:
				toggle_weapon()
			KEY_F:
				use_selected_item()
			KEY_Q:
				select_item((selected_item + 1) % ITEM_START.size())
			KEY_SHIFT:
				pass

func add_look(d: Vector2) -> void:
	_look += d * Vector2(-1.0, -1.0 if not GameSettings.invert_y else 1.0)

func set_look_axis(v: Vector2) -> void:
	_look += v

func request_jump() -> void:
	if not alive:
		return
	jump_buffer_t = JUMP_BUFFER

func _read_keyboard() -> void:
	if OS.has_feature("pc"):
		move_axis = Input.get_vector("mv_left", "mv_right", "mv_forward", "mv_back")
	if Input.is_action_just_pressed("mv_jump"):
		request_jump()
	_kb_sprint = Input.is_action_pressed("mv_sprint")
	if Input.is_action_just_pressed("reload"):
		start_reload()

# ------------------------------------------------------------------ 主循环
func _physics_process(delta: float) -> void:
	_prev_pos = _curr_pos
	if not alive:
		_respawn_t -= delta
		var sec := int(ceili(_respawn_t))
		if sec != _respawn_last and sec > 0:
			_respawn_last = sec
			emit_signal("respawn_tick", sec)
		if _respawn_t <= 0.0:
			do_respawn(respawn_point)
		velocity = Vector3.ZERO
		move_and_slide()
		_curr_pos = global_position
		return

	_read_keyboard()
	_update_items(delta)
	ads = (_kb_ads or touch_ads) and weapon == Weapon.RANGED
	_update_stance(delta)
	_update_look()
	_update_move(delta)
	_update_weapon(delta)
	_update_bob(delta)
	move_and_slide()
	_curr_pos = global_position

func _process(delta: float) -> void:
	var f := 1.0
	if Engine.has_method("get_physics_interpolation_fraction"):
		f = Engine.get_physics_interpolation_fraction()
	if model.visible:
		model.global_position = _prev_pos.lerp(_curr_pos, f)
	# 跑动动画（第一人称下模型隐藏，但动画状态保持更新）
	var planar := Vector2(velocity.x, velocity.z).length()
	_anim_t += delta * planar
	ModelFactory.animate_rig(model, planar, _anim_t, sprinting)
	_update_flash(delta)

func _update_look() -> void:
	if _look != Vector2.ZERO:
		_yaw += _look.x
		_pitch = clampf(_pitch + _look.y, deg_to_rad(-88.0), deg_to_rad(88.0))
		_look = Vector2.ZERO
	rotation.y = _yaw
	head.rotation.x = _pitch + _recoil.x
	rotation.y = _yaw + _recoil.y

func _update_move(delta: float) -> void:
	var wish := Vector3(move_axis.x, 0, move_axis.y).normalized()
	wish = wish.rotated(Vector3.UP, _yaw)

	var spd := WALK_SPEED
	if stance == Stance.CROUCH:
		spd *= CROUCH_MUL
	elif stance == Stance.PRONE:
		spd *= PRONE_MUL
	elif sprinting:
		spd *= SPRINT_MUL
	if ads:
		spd *= ADS_MUL
	if _buff_t > 0.0:
		spd *= DRINK_SPEED_MUL

	# 疾跑：摇杆推到顶自动触发，也可以按住按钮 / Shift
	var len_axis := move_axis.length()
	var auto := GameSettings.auto_sprint and move_axis.y <= -0.72 and len_axis > 0.8
	sprinting = (auto or _kb_sprint or touch_sprint) and len_axis > 0.3
	if ads or stance != Stance.STAND or _reloading > 0.0 or _using_item >= 0:
		sprinting = false

	var target := wish * spd
	var a := ACCEL if is_on_floor() else AIR_ACCEL
	velocity.x = move_toward(velocity.x, target.x, a * spd * delta * 0.6 + a * delta)
	velocity.z = move_toward(velocity.z, target.z, a * spd * delta * 0.6 + a * delta)

	jump_buffer_t -= delta
	if is_on_floor():
		coyote_t = COYOTE_TIME
	else:
		coyote_t -= delta

	if jump_buffer_t > 0.0 and coyote_t > 0.0 and stance != Stance.PRONE:
		velocity.y = JUMP_VELOCITY
		jump_buffer_t = 0.0
		coyote_t = 0.0
		Sfx.play("step", -8.0, 1.35)

	if is_on_floor():
		if velocity.y < 0.0:
			velocity.y = -1.0
	else:
		velocity.y -= GRAVITY * delta

func _update_stance(delta: float) -> void:
	var target_h: float = STANCE_HEIGHT[stance]
	var target_eye: float = STANCE_EYE[stance]
	var cs: CapsuleShape3D = shape.shape
	cs.height = lerpf(cs.height, target_h, 1.0 - exp(-16.0 * delta))
	shape.position.y = cs.height / 2.0
	head.position.y = lerpf(head.position.y, target_eye, 1.0 - exp(-16.0 * delta))

func _toggle_stance(s: int) -> void:
	stance = s if stance != s else Stance.STAND
	emit_signal("stance_changed", stance)

func set_stance(s: int) -> void:
	if stance == s:
		return
	stance = s
	emit_signal("stance_changed", stance)

func _update_weapon(delta: float) -> void:
	_fire_cd -= delta
	_recoil_vel += -_recoil * 120.0 * delta
	_recoil_vel *= exp(-14.0 * delta)
	_recoil += _recoil_vel * delta

	var is_melee := weapon == Weapon.MELEE
	var tgt_fov := FOV_ADS if ads else FOV_HIP
	camera.fov = lerpf(camera.fov, tgt_fov, 1.0 - exp(-18.0 * delta))
	var tgt_pos := Vector3(0.0, -0.062, -0.22) if ads else Vector3(0.17, -0.15, -0.32)
	var tgt_rot := Vector3.ZERO if ads else Vector3(0, deg_to_rad(2.5), 0)
	if is_melee:
		tgt_pos = Vector3(0.22, -0.20, -0.34)
		tgt_rot = Vector3(deg_to_rad(-12), deg_to_rad(14), 0)
	weapon_holder.position = weapon_holder.position.lerp(tgt_pos, 1.0 - exp(-16.0 * delta))
	weapon_holder.rotation = weapon_holder.rotation.lerp(tgt_rot, 1.0 - exp(-16.0 * delta))

	# 开镜时把枪械模型整个藏掉，只留 HUD 上的倍镜圆圈，避免挡视野
	weapon_holder.visible = not ads

	var planar_speed := Vector2(velocity.x, velocity.z).length()
	if is_melee:
		_spread = lerpf(_spread, 0.0, 1.0 - exp(-10.0 * delta))
	else:
		var s := ADS_SPREAD if ads else BASE_SPREAD
		s += MOVE_SPREAD * clampf(planar_speed / WALK_SPEED, 0.0, 1.6)
		if not is_on_floor():
			s += 0.035
		if sprinting:
			s += 0.02
		_spread = lerpf(_spread, s, 1.0 - exp(-10.0 * delta))

	if _reloading > 0.0:
		_reloading -= delta
		if _reloading <= 0.0:
			_finish_reload()
		return

	# 使用治疗物期间不能开枪
	if _using_item >= 0:
		return

	if want_fire and _fire_cd <= 0.0:
		if is_melee:
			_melee()
		elif mag > 0:
			_fire()
		elif _reloading <= 0.0:
			start_reload()

func _update_bob(delta: float) -> void:
	var planar_speed := Vector2(velocity.x, velocity.z).length()
	if is_on_floor() and planar_speed > 0.6:
		_bob_t += delta * planar_speed * (1.6 if sprinting else 1.15)
		var amp := 0.035 if sprinting else 0.022
		if ads:
			amp *= 0.35
		weapon_holder.position.x += sin(_bob_t) * amp * 0.4
		weapon_holder.position.y += absf(cos(_bob_t * 0.5)) * amp * 0.3
		head.position.y += sin(_bob_t * 2.0) * amp * 0.12

func start_reload() -> void:
	if weapon != Weapon.RANGED:
		return
	if _reloading > 0.0 or mag == MAG_SIZE or reserve <= 0 or _using_item >= 0:
		return
	_reloading = RELOAD_TIME
	Sfx.play("reload", -4.0)
	emit_signal("ammo_changed", mag, reserve)

func is_reloading() -> bool:
	return _reloading > 0.0

func reload_left() -> float:
	return maxf(0.0, _reloading)

func _finish_reload() -> void:
	var need := MAG_SIZE - mag
	var got := mini(need, reserve)
	mag += got
	reserve -= got
	emit_signal("ammo_changed", mag, reserve)

# ------------------------------------------------------------------ 射击 / 近战
func _fire() -> void:
	_fire_cd = FIRE_INTERVAL
	mag -= 1
	emit_signal("ammo_changed", mag, reserve)
	Sfx.play("shoot", -3.0, randf_range(0.94, 1.06))

	_recoil_vel.x -= RECOIL_PITCH * (0.6 if ads else 1.0) * 60.0
	_recoil_vel.y += RECOIL_YAW * randf_range(-1.0, 1.0) * 60.0

	muzzle_flash.visible = true
	muzzle_flash.rotation.z = randf() * TAU
	muzzle_flash.scale = Vector3.ONE * randf_range(0.8, 1.25)
	_flash_t = 0.045

	var dir := -camera.global_transform.basis.z
	if _spread > 0.0:
		var ang := randf() * TAU
		var r := sqrt(randf()) * _spread
		var up := camera.global_transform.basis.y
		var right := camera.global_transform.basis.x
		dir = (dir + right * cos(ang) * r + up * sin(ang) * r).normalized()

	var space := get_world_3d().direct_space_state
	var from := muzzle.global_position
	var q := PhysicsRayQueryParameters3D.create(from, from + dir * RANGE, 1 | 2, [self])
	var hit := space.intersect_ray(q)
	var end := from + dir * RANGE
	if not hit.is_empty():
		end = hit["position"]
		_apply_hit(hit, dir, DAMAGE, HEADSHOT_DAMAGE)
	_spawn_tracer(from, end)

func _melee() -> void:
	_fire_cd = MELEE_INTERVAL
	Sfx.play("shoot", -10.0, 0.72)
	var space := get_world_3d().direct_space_state
	var from := camera.global_position
	var dir := -camera.global_transform.basis.z
	var q := PhysicsRayQueryParameters3D.create(from, from + dir * MELEE_RANGE, 1 | 2, [self])
	var hit := space.intersect_ray(q)
	if not hit.is_empty():
		_apply_hit(hit, dir, MELEE_DAMAGE, MELEE_DAMAGE)

func _update_flash(delta: float) -> void:
	if _flash_t > 0.0:
		_flash_t -= delta
		if _flash_t <= 0.0:
			muzzle_flash.visible = false

func _apply_hit(hit: Dictionary, _dir: Vector3, dmg_body: float, dmg_head: float) -> void:
	var target := hit.get("collider", null) as Node
	while target != null and not target.has_method("take_damage"):
		target = target.get_parent()
	if target == null:
		return
	var p := hit.get("position", Vector3.ZERO) as Vector3
	var local_y: float = p.y - target.global_position.y
	var is_head: bool = local_y > 1.45
	var dmg := dmg_head if is_head else dmg_body
	if _buff_t > 0.0:
		dmg *= DRINK_DEALT_MUL
	target.take_damage(dmg, self, is_head)
	emit_signal("hit_confirmed", is_head)

func _spawn_tracer(from: Vector3, to: Vector3) -> void:
	var scene := get_tree().current_scene
	if scene == null:
		return
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.035, 0.035, 1.0)
	mi.mesh = bm
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color(1.0, 0.88, 0.45, 0.85)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mi.material_override = m
	scene.add_child(mi)
	var mid := (from + to) / 2.0
	mi.global_position = mid
	mi.look_at(to, Vector3.UP)
	mi.rotate_object_local(Vector3(1, 0, 0), deg_to_rad(90))
	mi.scale.z = maxf(0.4, from.distance_to(to))
	var tw := create_tween()
	tw.tween_property(m, "albedo_color:a", 0.0, 0.09)
	tw.tween_callback(mi.queue_free)

# ------------------------------------------------------------------ 伤害
func take_damage(amount: float, from: Node = null, _is_head: bool = false) -> void:
	if not alive:
		return
	var real := amount
	if _buff_t > 0.0:
		real *= DRINK_TAKEN_MUL
	hp = maxf(0.0, hp - real)
	_last_damage_from = (from.display_name if from is Player or from is Bot else "战场") \
			if from != null else "战场"
	emit_signal("hp_changed", hp, MAX_HP)
	emit_signal("damaged", real, _last_damage_from)
	Sfx.play("hurt", -3.0)
	# 受伤会打断使用中的治疗物
	if _using_item >= 0:
		cancel_item()
	if hp <= 0.0:
		_on_die()

func _on_die() -> void:
	alive = false
	deaths += 1
	want_fire = false
	_using_item = -1
	_respawn_t = 3.0
	_respawn_last = -1
	emit_signal("item_state_changed", -1, 0.0, 0.0)
	emit_signal("died", _last_damage_from)

func queue_respawn(at: Vector3) -> void:
	respawn_point = at

func do_respawn(at: Vector3 = Vector3.INF) -> void:
	respawn_point = Vector3.INF
	hp = MAX_HP
	alive = true
	mag = MAG_SIZE
	reserve = RESERVE_SIZE
	_buff_t = 0.0
	set_stance(Stance.STAND)
	ads = false
	_kb_ads = false
	touch_ads = false
	velocity = Vector3.ZERO
	_respawn_last = -1
	if at == Vector3.INF:
		var rng := RandomNumberGenerator.new()
		rng.randomize()
		at = Vector3(rng.randf_range(-22.0, 22.0), 2.0, rng.randf_range(-22.0, 22.0))
	global_position = at
	emit_signal("hp_changed", hp, MAX_HP)
	emit_signal("ammo_changed", mag, reserve)
	emit_signal("respawned")

func get_eye_position() -> Vector3:
	return camera.global_position

func get_yaw() -> float:
	return _yaw

func get_pitch() -> float:
	return _pitch

func set_yaw_pitch(y: float, p: float) -> void:
	_yaw = y
	_pitch = p
	rotation.y = _yaw
	head.rotation.x = _pitch

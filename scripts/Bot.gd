class_name Bot
extends CharacterBody3D
## 人机：巡逻 / 索敌 / 追击 / 开火 / 死亡重生。模型为代码生成的临时测试件。

signal hp_changed(hp: float, max_hp: float)
signal died(bot_name: String)

enum S { PATROL, CHASE, FIRE, DEAD }

const MAX_HP := 100.0
const WALK := 3.6
const CHASE_SPEED := 5.0
const GRAVITY := 21.0
const VIEW_DIST := 48.0
const FIRE_RANGE := 34.0
const KEEP_DIST := 11.0
const FIRE_INTERVAL := 0.42
const FIRE_BURST := 4
const BURST_PAUSE := 1.1
const DAMAGE := 11.0
const REACTION := 0.35
const RESPAWN_TIME := 4.0

var hp: float = MAX_HP
var alive: bool = true
var display_name: String = "人机"
var difficulty: float = 0.55      # 0~1，影响命中率与反应
var stance: int = 0

var state: int = S.PATROL
var _target: Node3D = null
var _patrol_point: Vector3
var _fire_cd: float = 0.0
var _burst_left: int = FIRE_BURST
var _burst_pause: float = 0.0
var _seen_t: float = 0.0
var _respawn_t: float = 0.0
var _think: float = 0.0
var _bob: float = 0.0
var _shoot_flash_t: float = 0.0

var model: Node3D
var _rig: Node3D
var _legs: Node3D
var _torso: Node3D
var _arm_l: Node3D
var _arm_r: Node3D
var _weapon_slot: Node3D
var _gun: Node3D
var _muzzle: Marker3D
var _flash: MeshInstance3D
var _hp_bar: Node3D
var shape: CollisionShape3D

var _prev_pos: Vector3
var _curr_pos: Vector3

func _ready() -> void:
	add_to_group("entity")
	add_to_group("bot")
	_build()

func _build() -> void:
	collision_layer = 2
	collision_mask = 1
	shape = CollisionShape3D.new()
	var cs := CapsuleShape3D.new()
	cs.radius = 0.3
	cs.height = 1.8
	shape.shape = cs
	shape.position = Vector3(0, 0.9, 0)
	add_child(shape)

	model = ModelFactory.build_soldier(Color(0.52, 0.28, 0.24), Color(0.36, 0.20, 0.18),
			Color(0.42, 0.24, 0.20))
	add_child(model)
	_rig = model.get_meta("rig")
	_legs = model.get_meta("legs")
	_torso = model.get_meta("torso")
	_arm_l = model.get_meta("arm_l")
	_arm_r = model.get_meta("arm_r")
	_weapon_slot = model.get_meta("weapon_slot")
	_gun = ModelFactory.build_gun(Color(0.18, 0.16, 0.15))
	_gun.scale = Vector3.ONE * 0.85
	_gun.rotation.y = deg_to_rad(90)
	_gun.position = Vector3(0, -0.05, -0.18)
	_weapon_slot.add_child(_gun)
	_muzzle = _gun.get_meta("muzzle")

	_flash = MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(0.25, 0.25)
	_flash.mesh = qm
	var fm := StandardMaterial3D.new()
	fm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fm.albedo_color = Color(1.0, 0.8, 0.35, 1.0)
	fm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	fm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_flash.material_override = fm
	_flash.visible = false
	_muzzle.add_child(_flash)

	# 头顶血条（始终朝向相机）
	_hp_bar = _build_hp_bar()
	model.add_child(_hp_bar)

	_patrol_point = _random_point()
	_prev_pos = global_position
	_curr_pos = global_position

func _build_hp_bar() -> Node3D:
	var n := Node3D.new()
	n.name = "HpBar"
	n.position = Vector3(0, 2.25, 0)
	var bg := MeshInstance3D.new()
	var bgm := QuadMesh.new()
	bgm.size = Vector2(1.0, 0.12)
	bg.mesh = bgm
	var bgmat := StandardMaterial3D.new()
	bgmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bgmat.albedo_color = Color(0.05, 0.05, 0.06, 0.85)
	bgmat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	bgmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	bg.material_override = bgmat
	n.add_child(bg)
	var fg := MeshInstance3D.new()
	fg.name = "Fill"
	var fgm := QuadMesh.new()
	fgm.size = Vector2(0.94, 0.08)
	fg.mesh = fgm
	var fgmat := StandardMaterial3D.new()
	fgmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fgmat.albedo_color = Color(0.9, 0.2, 0.22)
	fgmat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	fg.material_override = fgmat
	fg.position = Vector3(0, 0, 0.01)
	n.add_child(fg)
	n.set_meta("fill", fg)
	return n

func _random_point() -> Vector3:
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	return Vector3(rng.randf_range(-24.0, 24.0), 1.2, rng.randf_range(-24.0, 24.0))

# ------------------------------------------------------------------ AI
func _physics_process(delta: float) -> void:
	_prev_pos = _curr_pos
	if not alive:
		_respawn_t -= delta
		velocity.y -= GRAVITY * delta
		velocity.x = move_toward(velocity.x, 0.0, 8.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 8.0 * delta)
		move_and_slide()
		_curr_pos = global_position
		if _respawn_t <= 0.0:
			_respawn()
		return

	_think -= delta
	if _think <= 0.0:
		_think = 0.18
		_decide()

	match state:
		S.PATROL:
			_do_patrol(delta)
		S.CHASE:
			_do_chase(delta)
		S.FIRE:
			_do_fire(delta)

	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	elif velocity.y < 0:
		velocity.y = -1.0
	move_and_slide()
	_curr_pos = global_position

func _process(delta: float) -> void:
	var f := 1.0
	if Engine.has_method("get_physics_interpolation_fraction"):
		f = Engine.get_physics_interpolation_fraction()
	model.global_position = _prev_pos.lerp(_curr_pos, f)
	_animate(delta)
	if _shoot_flash_t > 0.0:
		_shoot_flash_t -= delta
		if _shoot_flash_t <= 0.0:
			_flash.visible = false

func _decide() -> void:
	if _target != null and not is_instance_valid(_target):
		_target = null
	var p := _find_player()
	if p == null:
		state = S.PATROL
		_target = null
		return
	var d := global_position.distance_to(p.global_position)
	var can_see := d < VIEW_DIST and _has_los(p)
	if can_see:
		_seen_t += 0.18
		if _seen_t >= REACTION * (1.4 - difficulty):
			_target = p
			state = S.FIRE if d <= FIRE_RANGE else S.CHASE
		else:
			state = S.PATROL
	else:
		_seen_t = 0.0
		if _target != null:
			state = S.CHASE
		else:
			state = S.PATROL

func _find_player() -> Node3D:
	var pl := get_tree().get_nodes_in_group("local_player")
	for n in pl:
		if n is Player and n.alive:
			return n
	# 多人模式下也把其他玩家当目标
	var others := get_tree().get_nodes_in_group("remote_player")
	for n in others:
		if "alive" in n and n.alive:
			return n
	return null

func _has_los(t: Node3D) -> bool:
	var from := global_position + Vector3(0, 1.5, 0)
	var to := t.global_position + Vector3(0, 1.3, 0)
	var space := get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(from, to, 1, [self])
	var r := space.intersect_ray(q)
	return r.is_empty()

func _move_to(p: Vector3, speed: float, delta: float) -> void:
	var dir := (p - global_position)
	dir.y = 0
	if dir.length() < 0.8:
		velocity.x = move_toward(velocity.x, 0.0, 10.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 10.0 * delta)
		return
	dir = dir.normalized()
	velocity.x = move_toward(velocity.x, dir.x * speed, 12.0 * delta)
	velocity.z = move_toward(velocity.z, dir.z * speed, 12.0 * delta)
	var yaw := atan2(dir.x, dir.z)
	rotation.y = lerp_angle(rotation.y, yaw + PI, 1.0 - exp(-9.0 * delta))

func _face(target: Vector3, delta: float) -> void:
	var d := target - global_position
	var yaw := atan2(d.x, d.z)
	rotation.y = lerp_angle(rotation.y, yaw + PI, 1.0 - exp(-12.0 * delta))

func _do_patrol(delta: float) -> void:
	if global_position.distance_to(_patrol_point) < 2.0:
		_patrol_point = _random_point()
	_move_to(_patrol_point, WALK, delta)

func _do_chase(delta: float) -> void:
	if _target == null or not is_instance_valid(_target):
		_target = null
		state = S.PATROL
		return
	var d := global_position.distance_to(_target.global_position)
	if d <= FIRE_RANGE and _has_los(_target):
		state = S.FIRE
		_face(_target.global_position, delta)
		return
	if d > KEEP_DIST:
		_move_to(_target.global_position + Vector3(randf_range(-3, 3), 0, randf_range(-3, 3)),
				CHASE_SPEED, delta)
	else:
		_face(_target.global_position, delta)
		velocity.x = move_toward(velocity.x, 0.0, 10.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 10.0 * delta)
		if _has_los(_target):
			state = S.FIRE

func _do_fire(delta: float) -> void:
	if _target == null or not is_instance_valid(_target):
		_target = null
		state = S.PATROL
		return
	var d := global_position.distance_to(_target.global_position)
	_face(_target.global_position, delta)
	if d > FIRE_RANGE or not _has_los(_target):
		state = S.CHASE
		return
	if d < 4.0:
		_move_to(global_position + (global_position - _target.global_position), WALK, delta)
	elif d > KEEP_DIST * 1.4:
		_move_to(_target.global_position, CHASE_SPEED * 0.8, delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 10.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 10.0 * delta)

	_burst_pause -= delta
	if _burst_pause > 0.0:
		return
	_fire_cd -= delta
	if _fire_cd <= 0.0:
		_shoot()
		_fire_cd = FIRE_INTERVAL
		_burst_left -= 1
		if _burst_left <= 0:
			_burst_left = FIRE_BURST
			_burst_pause = BURST_PAUSE * randf_range(0.8, 1.3)

func _shoot() -> void:
	if _target == null or not is_instance_valid(_target):
		return
	Sfx.play_at("shoot", global_position)
	_flash.visible = true
	_flash.rotation.z = randf() * TAU
	_shoot_flash_t = 0.05

	var miss := (1.0 - difficulty) * 0.28
	if randf() < miss:
		return
	# 命中率随距离衰减
	var d := global_position.distance_to(_target.global_position)
	var acc := clampf(1.0 - d / (FIRE_RANGE * 1.5), 0.25, 1.0) * (0.55 + difficulty * 0.5)
	if randf() > acc:
		return
	if _target.has_method("take_damage"):
		_target.take_damage(DAMAGE, self, false)

# ------------------------------------------------------------------ 表现
func _animate(delta: float) -> void:
	if not alive:
		return
	var planar := Vector2(velocity.x, velocity.z).length()
	if planar > 0.4:
		_bob += delta * planar * 2.2
		var sw := sin(_bob) * 0.55 * clampf(planar / WALK, 0.3, 1.4)
		if _legs is Node3D:
			for c in _legs.get_children():
				c.rotation.x = sw if c.position.x < 0 else -sw
		if _arm_l != null:
			_arm_l.rotation.x = -sw * 0.6
		if _arm_r != null:
			_arm_r.rotation.x = sw * 0.35
	else:
		if _legs is Node3D:
			for c in _legs.get_children():
				c.rotation.x = lerpf(c.rotation.x, 0.0, 1.0 - exp(-8.0 * delta))
		if _arm_l != null:
			_arm_l.rotation.x = lerpf(_arm_l.rotation.x, 0.0, 1.0 - exp(-8.0 * delta))
	# 开火时手臂端平
	if state == S.FIRE and _arm_r != null:
		_arm_r.rotation.x = lerpf(_arm_r.rotation.x, deg_to_rad(-72), 1.0 - exp(-12.0 * delta))

# ------------------------------------------------------------------ 伤害
func take_damage(amount: float, from: Node = null, _is_head: bool = false) -> void:
	if not alive:
		return
	hp = maxf(0.0, hp - amount)
	_update_hp_bar()
	emit_signal("hp_changed", hp, MAX_HP)
	# 被打会立刻警觉
	if from != null and state != S.FIRE:
		_target = from
		_seen_t = 1.0
		state = S.CHASE
	if hp <= 0.0:
		_on_die()

func _update_hp_bar() -> void:
	if _hp_bar == null:
		return
	var fill := _hp_bar.get_meta("fill") as MeshInstance3D
	if fill == null:
		return
	var r := clampf(hp / MAX_HP, 0.0, 1.0)
	fill.scale.x = maxf(0.001, r)
	fill.position.x = -(1.0 - r) * 0.47
	var m := fill.material_override as StandardMaterial3D
	if m:
		m.albedo_color = Color(0.9, 0.2, 0.22) if r > 0.35 else Color(1.0, 0.45, 0.1)
	_hp_bar.visible = alive

func _on_die() -> void:
	alive = false
	state = S.DEAD
	_respawn_t = RESPAWN_TIME
	velocity = Vector3.ZERO
	_hp_bar.visible = false
	emit_signal("died", display_name)
	var tw := create_tween()
	tw.tween_property(model, "rotation:x", deg_to_rad(-88), 0.35)
	tw.tween_property(model, "position:y", 0.25, 0.35)

func _respawn() -> void:
	hp = MAX_HP
	alive = true
	state = S.PATROL
	_target = null
	_seen_t = 0.0
	model.rotation.x = 0.0
	model.position.y = 0.0
	_patrol_point = _random_point()
	global_position = _random_point() + Vector3(0, 1.0, 0)
	_update_hp_bar()
	emit_signal("hp_changed", hp, MAX_HP)

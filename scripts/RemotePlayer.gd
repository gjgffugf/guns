class_name RemotePlayer
extends Node3D
## 多人模式中的其他玩家：按服务器快照插值渲染（血条 + 姓名 + 开火表现）。

const MAX_HP := 100.0

var player_id: int = -1
var player_name: String = "玩家"
var hp: float = MAX_HP
var alive: bool = true

var _target_pos: Vector3 = Vector3.ZERO
var _target_yaw: float = 0.0
var _shoot_t: float = 0.0
var _bob: float = 0.0
var _anim_t: float = 0.0
var _speed: float = 0.0
var _prev_pos: Vector3 = Vector3.ZERO
var _moving: int = 0

var model: Node3D
var _rig: Node3D
var _legs: Node3D
var _arm_r: Node3D
var _weapon_slot: Node3D
var _gun: Node3D
var _muzzle: Marker3D
var _flash: MeshInstance3D
var _name_lbl: Label3D
var _hp_bar: Node3D

func _ready() -> void:
	add_to_group("entity")
	add_to_group("remote_player")
	_build()
	_prev_pos = global_position

func _setup(pid: int, nm: String) -> void:
	player_id = pid
	player_name = nm
	_name_lbl.text = nm

func _build() -> void:
	# 命中盒：让本地射线能打到远程玩家，伤害由服务器仲裁
	var hb := StaticBody3D.new()
	hb.name = "Hitbox"
	hb.collision_layer = 2
	hb.collision_mask = 0
	var cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.42
	cap.height = 1.9
	cs.shape = cap
	cs.position = Vector3(0, 0.95, 0)
	hb.add_child(cs)
	add_child(hb)

	model = ModelFactory.build_soldier()
	add_child(model)
	_rig = model.get_meta("rig")
	_legs = model.get_meta("legs")
	_arm_r = model.get_meta("arm_r")
	_weapon_slot = model.get_meta("weapon_slot")
	_gun = ModelFactory.build_gun(Color(0.15, 0.16, 0.19))
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
	fm.albedo_color = Color(1.0, 0.82, 0.36, 1.0)
	fm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	fm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_flash.material_override = fm
	_flash.visible = false
	_muzzle.add_child(_flash)

	_name_lbl = Label3D.new()
	_name_lbl.text = player_name
	_name_lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_name_lbl.font_size = 44
	_name_lbl.modulate = Color(0.75, 0.88, 1.0)
	_name_lbl.position = Vector3(0, 2.45, 0)
	_name_lbl.outline_size = 6
	_name_lbl.outline_modulate = Color(0, 0, 0, 0.8)
	model.add_child(_name_lbl)

	_hp_bar = _build_hp_bar()
	model.add_child(_hp_bar)

func _build_hp_bar() -> Node3D:
	var n := Node3D.new()
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
	var fgm := QuadMesh.new()
	fgm.size = Vector2(0.94, 0.08)
	fg.mesh = fgm
	var fgmat := StandardMaterial3D.new()
	fgmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fgmat.albedo_color = Color(0.85, 0.22, 0.24)
	fgmat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	fg.material_override = fgmat
	fg.position = Vector3(0, 0, 0.01)
	n.add_child(fg)
	n.set_meta("fill", fg)
	n.position = Vector3(0, 2.2, 0)
	return n

## 由 MultiplayerGame 每帧调用
func apply_state(d: Dictionary) -> void:
	_target_pos = d.get("pos", global_position)
	_target_yaw = float(d.get("yaw", 0.0))
	var nh := float(d.get("hp", hp))
	if nh < hp:
		pass
	hp = nh
	alive = hp > 0.0
	_moving = int(d.get("mv", 0))
	if bool(d.get("sh", false)):
		_shoot_t = 0.06
	_update_hp_bar()
	model.visible = alive

func _process(delta: float) -> void:
	# 位置与朝向插值，保证高帧率下平滑
	global_position = global_position.lerp(_target_pos, 1.0 - exp(-14.0 * delta))
	rotation.y = lerp_angle(rotation.y, _target_yaw + PI, 1.0 - exp(-16.0 * delta))

	# 跑动动画：速度按插值后的实际位移估算
	var step := global_position.distance_to(_prev_pos) / maxf(delta, 0.0001)
	_prev_pos = global_position
	_speed = lerpf(_speed, step, 1.0 - exp(-8.0 * delta))
	_anim_t += delta * _speed
	ModelFactory.animate_rig(model, _speed, _anim_t, false)
	# 血条每帧同步，杜绝「看着还有半管血却突然死了」
	_update_hp_bar()

	if _shoot_t > 0.0:
		_shoot_t -= delta
		_flash.visible = true
		if _arm_r != null:
			_arm_r.rotation.x = deg_to_rad(-70)
		if _shoot_t <= 0.0:
			_flash.visible = false

func _update_hp_bar() -> void:
	if _hp_bar == null:
		return
	var fill := _hp_bar.get_meta("fill") as MeshInstance3D
	if fill == null:
		return
	var r := clampf(hp / MAX_HP, 0.0, 1.0)
	fill.scale.x = maxf(0.001, r)
	fill.position.x = -(1.0 - r) * 0.47
	_hp_bar.visible = alive

## 本地射线命中远端玩家：上报服务器仲裁，同时做「乐观预测」——
## 立刻在本地扣血刷新血条，否则要等服务器回包血条才动，
## 表现上就是「看着还剩半管血，对方却突然死了」。
## 服务器快照回来会覆盖这里的预测值，所以不会算错。
func take_damage(amount: float, _from: Node = null, _is_head: bool = false) -> void:
	if not alive:
		return
	Net.send_hit(player_id, int(amount))
	# 预测值最低留 1 点，避免服务器还没确认就把人显示成死亡
	hp = maxf(1.0, hp - amount)
	_update_hp_bar()

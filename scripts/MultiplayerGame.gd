extends Node3D
## 多人模式：与 Game 相同的战场，但玩家状态通过 UDP 上报给服务器，
## 其他玩家由服务器快照插值渲染。附带 1 名人机作为陪练（可注释掉）。

const WITH_BOT := true

var player: Player
var hud: Hud
var _remote: Dictionary = {}
var _spawn_points: Array[Vector3] = []
var _bots: Array[Bot] = []

func _ready() -> void:
	_build_world()
	_build_player()
	if WITH_BOT:
		_build_bots()
	_build_hud()
	Net.players_changed.connect(_sync_remote)
	Net.disconnected.connect(func():
		hud.push_kill("与服务器断开连接")
	)
	_sync_remote()
	if OS.has_feature("pc"):
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _build_world() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var pm := ProceduralSkyMaterial.new()
	pm.sky_top_color = Color(0.26, 0.40, 0.62)
	pm.sky_horizon_color = Color(0.58, 0.62, 0.70)
	pm.sky_curve = 0.15
	pm.ground_bottom_color = Color(0.18, 0.18, 0.17)
	pm.ground_horizon_color = Color(0.42, 0.42, 0.41)
	pm.sun_angle_max = 25.0
	sky.sky_material = pm
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	e.ambient_light_energy = 0.7
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.tonemap_white = 1.6
	env.environment = e
	add_child(env)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48, 38, 0)
	sun.light_energy = 1.3
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 90.0
	sun.shadow_bias = 0.03
	add_child(sun)

	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-20, -140, 0)
	fill.light_energy = 0.35
	fill.light_color = Color(0.75, 0.82, 1.0)
	add_child(fill)

	add_child(ModelFactory.build_arena(60.0))
	_spawn_points = [
		Vector3(0, 2.0, 22), Vector3(-20, 2.0, -18), Vector3(20, 2.0, -18),
		Vector3(-22, 2.0, 14), Vector3(24, 2.0, 16), Vector3(0, 2.0, -24),
	]

func _build_player() -> void:
	player = Player.new()
	player.name = "LocalPlayer"
	player.display_name = GameSettings.player_name
	player.add_to_group("local_player")
	add_child(player)
	player.global_position = _spawn_points[randi() % _spawn_points.size()]
	player.died.connect(func(_k): player.queue_respawn(_pick_spawn()))

func _build_bots() -> void:
	var b := Bot.new()
	b.name = "Bot1"
	b.display_name = "陪练人机"
	b.difficulty = 0.5
	add_child(b)
	b.global_position = _spawn_points[1]
	b.died.connect(func(nm): hud.push_kill("击倒 %s" % nm))
	_bots.append(b)

func _build_hud() -> void:
	hud = Hud.new()
	add_child(hud)
	hud.bind_player(player)
	hud.back_pressed.connect(func():
		Sfx.play("click")
		if OS.has_feature("pc"):
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		Net.disconnect_from_server()
		Trans.goto("res://scenes/MainMenu.tscn")
	)

func _pick_spawn() -> Vector3:
	return _spawn_points[randi() % _spawn_points.size()]

# ------------------------------------------------------------------ 网络
func _sync_remote() -> void:
	# 新增
	for id in Net.remote_players:
		if not _remote.has(id):
			var rp := RemotePlayer.new()
			rp.name = "P%d" % id
			add_child(rp)
			rp._setup(id, Net.remote_players[id].get("name", "玩家"))
			rp.global_position = Net.remote_players[id].get("pos", Vector3.ZERO)
			_remote[id] = rp
			hud.push_kill("%s 加入战场" % rp.player_name)
	# 移除
	for id in _remote.keys():
		if not Net.remote_players.has(id):
			_remote[id].queue_free()
			_remote.erase(id)

func _process(_delta: float) -> void:
	# 快照 -> 远程玩家
	for id in _remote:
		if Net.remote_players.has(id):
			_remote[id].apply_state(Net.remote_players[id])
	# 事件
	for e in Net.take_events():
		_handle_event(e)
	# 上报本地状态
	Net.send_state(player.global_position, player.get_yaw(), player.get_pitch(),
			player.hp, player.stance, 1 if player.move_axis.length() > 0.1 else 0,
			player.want_fire)
	hud.set_ping(Net.get_rtt(), true)

func _handle_event(e: Dictionary) -> void:
	match str(e.get("k", "")):
		"shot":
			var o: Vector3 = e.get("o", Vector3.ZERO)
			var d: Vector3 = e.get("d", Vector3(0, 0, -1))
			if e.get("id", -1) != Net.my_id:
				Sfx.play_at("shoot", o)
				_draw_remote_tracer(o, o + d * 60.0)
		"hit":
			var to := int(e.get("to", -1))
			if to == Net.my_id:
				player.take_damage(float(e.get("dmg", 0.0)), null, false)
		"kill":
			var a := int(e.get("a", -1))
			var b := int(e.get("b", -1))
			var an := _name_of(a)
			var bn := _name_of(b)
			hud.push_kill("%s 击倒 %s" % [an, bn])
			if a == Net.my_id:
				player.kills += 1
			if b == Net.my_id:
				player.queue_respawn(_pick_spawn())
		"join":
			hud.push_kill("%s 加入战场" % str(e.get("n", "玩家")))
		"leave":
			hud.push_kill("%s 离开战场" % str(e.get("n", "玩家")))

func _name_of(id: int) -> String:
	if id == Net.my_id:
		return GameSettings.player_name
	if Net.remote_players.has(id):
		return str(Net.remote_players[id].get("name", "玩家"))
	return "未知"

func _draw_remote_tracer(from: Vector3, to: Vector3) -> void:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.03, 0.03, 1.0)
	mi.mesh = bm
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color(1.0, 0.75, 0.35, 0.8)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mi.material_override = m
	add_child(mi)
	mi.global_position = (from + to) / 2.0
	mi.look_at(to, Vector3.UP)
	mi.rotate_object_local(Vector3(1, 0, 0), deg_to_rad(90))
	mi.scale.z = maxf(0.4, from.distance_to(to))
	var tw := create_tween()
	tw.tween_property(m, "albedo_color:a", 0.0, 0.09)
	tw.tween_callback(mi.queue_free)

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("pause") and OS.has_feature("pc"):
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		Net.disconnect_from_server()
		Trans.goto("res://scenes/MainMenu.tscn")

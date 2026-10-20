extends Node3D
## 单人模式：代码生成的测试地图 + 本地玩家 + 1 名战术人机。

const BOT_COUNT := 1

var player: Player
var hud: Hud
var _bots: Array[Bot] = []
var _spawn_points: Array[Vector3] = []

func _ready() -> void:
	_build_world()
	_build_player()
	_build_bots()
	_build_hud()
	if OS.has_feature("pc"):
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _build_world() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var pm := ProceduralSkyMaterial.new()
	pm.sky_top_color = Color(0.30, 0.45, 0.68)
	pm.sky_horizon_color = Color(0.62, 0.66, 0.72)
	pm.sky_curve = 0.15
	pm.ground_bottom_color = Color(0.20, 0.19, 0.18)
	pm.ground_horizon_color = Color(0.45, 0.45, 0.44)
	pm.sun_angle_max = 30.0
	sky.sky_material = pm
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	e.ambient_light_sky_contribution = 0.85
	e.ambient_light_energy = 0.65
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.tonemap_white = 1.6
	env.environment = e
	add_child(env)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48, 38, 0)
	sun.light_energy = 1.35
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 90.0
	sun.shadow_bias = 0.03
	sun.shadow_normal_bias = 0.05
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
	player.global_position = _spawn_points[0]
	player.died.connect(func(_k): player.queue_respawn(_pick_spawn()))

func _build_bots() -> void:
	for i in BOT_COUNT:
		var b := Bot.new()
		b.name = "Bot%d" % (i + 1)
		b.display_name = "战术人机 %d" % (i + 1)
		b.difficulty = 0.55
		add_child(b)
		var p := _spawn_points[(i + 2) % _spawn_points.size()]
		b.global_position = p
		b.died.connect(_on_bot_died)
		_bots.append(b)

func _build_hud() -> void:
	hud = Hud.new()
	add_child(hud)
	hud.bind_player(player)
	hud.back_pressed.connect(func():
		Sfx.play("click")
		if OS.has_feature("pc"):
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		Trans.goto("res://scenes/MainMenu.tscn")
	)

func _on_bot_died(nm: String) -> void:
	player.kills += 1
	hud.push_kill("击倒 %s" % nm)

func _pick_spawn() -> Vector3:
	var best := _spawn_points[0]
	var best_d := -1.0
	for p in _spawn_points:
		var d := p.distance_to(player.global_position)
		var ok := true
		for b in _bots:
			if b.alive and b.global_position.distance_to(p) < 12.0:
				ok = false
		if ok and d > best_d:
			best_d = d
			best = p
	return best

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("pause") and OS.has_feature("pc"):
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		Trans.goto("res://scenes/MainMenu.tscn")

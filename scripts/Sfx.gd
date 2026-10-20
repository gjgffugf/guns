extends Node
## 全局音效播放器。所有 wav 均为代码合成，无外部依赖。
## 这里用运行时 load() 而不是 preload()：万一 assets 没提交进仓库，
## 也不会让整个脚本解析失败导致 autoload 起不来（游戏照常能跑，只是没声音）。

const SFX_PATH := {
	"click": "res://assets/sfx/ui_click.wav",
	"transition": "res://assets/sfx/ui_transition.wav",
	"shoot": "res://assets/sfx/shoot.wav",
	"hitmark": "res://assets/sfx/hitmark.wav",
	"reload": "res://assets/sfx/reload.wav",
	"hurt": "res://assets/sfx/hurt.wav",
	"step": "res://assets/sfx/step.wav",
}

var _cache: Dictionary = {}
var _players: Array[AudioStreamPlayer] = []
var _next: int = 0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for i in 8:
		var p := AudioStreamPlayer.new()
		p.bus = "Master"
		p.volume_db = -6.0
		add_child(p)
		_players.append(p)
	# 预热，顺便把缺失的资源暴露在日志里
	for k in SFX_PATH:
		_get(k)

func _get(name: String) -> AudioStream:
	if _cache.has(name):
		return _cache[name]
	var path: String = SFX_PATH.get(name, "")
	var s: AudioStream = null
	if path != "" and ResourceLoader.exists(path):
		s = load(path) as AudioStream
	_cache[name] = s
	if s == null:
		push_warning("[Sfx] 音效缺失，跳过: %s" % path)
	return s

func play(name: String, vol_db: float = 0.0, pitch: float = 1.0) -> void:
	var s := _get(name)
	if s == null:
		return
	var p := _players[_next]
	_next = (_next + 1) % _players.size()
	p.stream = s
	p.volume_db = -6.0 + vol_db
	p.pitch_scale = pitch
	p.play()

## 3D 位置音效（枪声 / 受伤），挂在临时节点上
func play_at(name: String, pos: Vector3) -> void:
	var s := _get(name)
	if s == null:
		return
	var p := AudioStreamPlayer3D.new()
	p.stream = s
	p.global_position = pos
	p.max_distance = 60.0
	p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
	p.volume_db = -8.0
	p.finished.connect(p.queue_free)
	var host := get_tree().current_scene
	if host == null:
		host = get_tree().root
	host.add_child(p)
	p.play()

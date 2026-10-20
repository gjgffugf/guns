extends Node
## 全局音效播放器。所有 wav 均为代码合成，无外部依赖。

const SFX := {
	"click": preload("res://assets/sfx/ui_click.wav"),
	"transition": preload("res://assets/sfx/ui_transition.wav"),
	"shoot": preload("res://assets/sfx/shoot.wav"),
	"hitmark": preload("res://assets/sfx/hitmark.wav"),
	"reload": preload("res://assets/sfx/reload.wav"),
	"hurt": preload("res://assets/sfx/hurt.wav"),
	"step": preload("res://assets/sfx/step.wav"),
}

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

func play(name: String, vol_db: float = 0.0, pitch: float = 1.0) -> void:
	if not SFX.has(name):
		return
	var p := _players[_next]
	_next = (_next + 1) % _players.size()
	p.stream = SFX[name]
	p.volume_db = -6.0 + vol_db
	p.pitch_scale = pitch
	p.play()

## 3D 位置音效（枪声 / 受伤），挂在临时节点上
func play_at(name: String, pos: Vector3) -> void:
	if not SFX.has(name):
		return
	var p := AudioStreamPlayer3D.new()
	p.stream = SFX[name]
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

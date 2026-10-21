extends Node
## 大厅背景音乐：随机播放 assets/music/ 下的音频文件。
## ★ 想换音乐：把自己的 mp3 / ogg / wav 放进 assets/music/ 即可，
##   不需要改代码。目录为空则静默不播放。

const MUSIC_DIR := "res://assets/music"

var _player: AudioStreamPlayer
var _files: PackedStringArray = []
var _idx: int = -1
var _last_played: String = ""
var _bus: String = "Music"

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	if not AudioServer.get_bus_index(_bus) >= 0:
		AudioServer.add_bus()
		AudioServer.set_bus_name(AudioServer.bus_count - 1, _bus)
	_player = AudioStreamPlayer.new()
	_player.bus = _bus
	_player.volume_db = -14.0
	add_child(_player)
	_player.finished.connect(_play_next)
	_scan()

func _scan() -> void:
	_files = PackedStringArray()
	var d := DirAccess.open(MUSIC_DIR)
	if d == null:
		print("[Music] 未找到 %s，大厅不播放背景音乐（把音频文件放进去即可）" % MUSIC_DIR)
		return
	d.list_dir_begin()
	var f := d.get_next()
	while f != "":
		var low := f.to_lower()
		if not d.current_is_dir() and (low.ends_with(".ogg") or low.ends_with(".mp3")
				or low.ends_with(".wav")):
			_files.append("%s/%s" % [MUSIC_DIR, f])
		f = d.get_next()
	d.list_dir_end()
	print("[Music] 共 %d 首" % _files.size())

func play_lobby() -> void:
	if _files.is_empty():
		return
	if _player.playing:
		return
	_play_next()

func stop() -> void:
	_player.stop()

func set_volume_db(v: float) -> void:
	_player.volume_db = v

func _play_next() -> void:
	if _files.is_empty():
		return
	if _files.size() == 1:
		_idx = 0
	else:
		# 随机，且避免连续两首重复
		var n := _files.size()
		var i := randi() % n
		if _files[i] == _last_played:
			i = (i + 1 + randi() % (n - 1)) % n
		_idx = i
	_last_played = _files[_idx]
	var s := load(_files[_idx]) as AudioStream
	if s == null:
		return
	_player.stream = s
	_player.play()
	print("[Music] 播放: ", _last_played)

extends Node
## 多人联机网络层（UDP + JSON）。与 server/server.py 配套。
## 只做状态同步：本地把自身状态 20Hz 上报，服务器广播快照，客户端插值渲染。

signal connected_ok()
signal connect_failed(reason: String)
signal disconnected()
signal players_changed()

const TICK_HZ := 20.0

enum St { OFFLINE, CONNECTING, ONLINE }

var state: int = St.OFFLINE
var my_id: int = -1
var server_host: String = ""
var server_port: int = 19000
## id -> {name, pos, yaw, pitch, hp, stance, moving, shooting}
var remote_players: Dictionary = {}
## 一次性事件队列，由游戏场景消费：{k:"shot"/"hit"/"kill"/"join"/"leave", ...}
var events: Array = []

var _udp: PacketPeerUDP
var _seq: int = 0
var _acc: float = 0.0
var _ping_acc: float = 0.0
var _rtt: float = 0.0
var _last_snapshot_time: float = 0.0
var _resolved_ip: String = ""

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	set_process(false)

func _process(delta: float) -> void:
	if state != St.ONLINE and state != St.CONNECTING:
		return
	# 接收
	while _udp.get_available_packet_count() > 0:
		var pkt := _udp.get_packet()
		_on_packet(pkt.get_string_from_utf8())
	# 心跳 / 超时
	_ping_acc += delta
	if _ping_acc >= 1.0:
		_ping_acc = 0.0
		_send({"t": "ping", "ts": Time.get_ticks_msec()})
	if state == St.ONLINE and Time.get_ticks_msec() - _last_snapshot_time > 6000:
		disconnect_from_server("服务器超时")

func connect_to_server(host: String, port: int, pname: String) -> void:
	disconnect_from_server("")
	server_host = host
	server_port = port
	state = St.CONNECTING
	remote_players.clear()
	events.clear()
	my_id = -1
	_resolved_ip = host
	if not _is_ip(host):
		var ips := IP.resolve_hostname(host, IP.TYPE_IPV4)
		if ips.is_empty():
			state = St.OFFLINE
			connect_failed.emit("无法解析服务器地址")
			return
		_resolved_ip = ips[0]
	_udp = PacketPeerUDP.new()
	var err := _udp.bind(0)
	if err != OK:
		state = St.OFFLINE
		connect_failed.emit("无法创建本地端口")
		return
	_udp.set_dest_address(_resolved_ip, port)
	set_process(true)
	_send({"t": "join", "n": pname})
	# 3 秒内没收到 welcome 判定失败
	await get_tree().create_timer(3.0).timeout
	if state == St.CONNECTING:
		state = St.OFFLINE
		set_process(false)
		connect_failed.emit("服务器无响应，请检查地址/端口/防火墙")

func disconnect_from_server(_reason: String = "") -> void:
	if _udp:
		if state == St.ONLINE:
			_send({"t": "bye"})
		_udp.close()
		_udp = null
	state = St.OFFLINE
	remote_players.clear()
	set_process(false)
	disconnected.emit()

## 本地玩家状态上报，由游戏场景每帧调用（内部按 TICK_HZ 节流）
func send_state(pos: Vector3, yaw: float, pitch: float, hp: float, stance: int,
		moving: int, shooting: bool) -> void:
	if state != St.ONLINE:
		return
	_acc += get_process_delta_time()
	if _acc < 1.0 / TICK_HZ:
		return
	_acc = 0.0
	_seq += 1
	_send({
		"t": "inp",
		"p": _v3(pos),
		"y": snappedf(yaw, 0.01),
		"pi": snappedf(pitch, 0.01),
		"hp": int(hp),
		"st": stance,
		"mv": moving,
		"sh": 1 if shooting else 0,
		"q": _seq,
	})

func send_shot(origin: Vector3, dir: Vector3) -> void:
	if state != St.ONLINE:
		return
	_send({"t": "shot", "o": _v3(origin), "d": _v3(dir)})

func send_hit(target_id: int, dmg: int) -> void:
	if state != St.ONLINE:
		return
	_send({"t": "hit", "tg": target_id, "dmg": dmg})

func get_rtt() -> float:
	return _rtt

func _send(d: Dictionary) -> void:
	if _udp == null:
		return
	_udp.put_packet(JSON.stringify(d).to_utf8_buffer())

func _on_packet(txt: String) -> void:
	var j := JSON.new()
	if j.parse(txt) != OK:
		return
	var d: Dictionary = j.data
	match str(d.get("t", "")):
		"welcome":
			my_id = int(d.get("id", -1))
			state = St.ONLINE
			_last_snapshot_time = Time.get_ticks_msec()
			connected_ok.emit()
		"snap":
			_last_snapshot_time = Time.get_ticks_msec()
			var lst: Array = d.get("p", [])
			var ids := {}
			for e in lst:
				var id := int(e.get("id", -1))
				ids[id] = true
				if id == my_id:
					continue
				remote_players[id] = {
					"name": str(e.get("n", "?")),
					"pos": _to_v3(e.get("p", [0, 0, 0])),
					"yaw": float(e.get("y", 0.0)),
					"pitch": float(e.get("pi", 0.0)),
					"hp": float(e.get("hp", 100.0)),
					"stance": int(e.get("st", 0)),
					"mv": int(e.get("mv", 0)),
					"sh": bool(e.get("sh", false)),
					"t": Time.get_ticks_msec(),
				}
			# 清理离开的
			for k in remote_players.keys():
				if not ids.has(k):
					remote_players.erase(k)
			players_changed.emit()
		"shot":
			events.append({"k": "shot", "id": int(d.get("id", -1)),
					"o": _to_v3(d.get("o", [0, 0, 0])), "d": _to_v3(d.get("d", [0, 0, -1]))})
		"hit":
			events.append({"k": "hit", "from": int(d.get("from", -1)),
					"to": int(d.get("to", -1)), "dmg": float(d.get("dmg", 0.0))})
		"pong":
			_rtt = (Time.get_ticks_msec() - int(d.get("ts", 0))) / 2.0
		"evt":
			d["k"] = str(d.get("k", ""))
			events.append(d)
		_:
			pass

func take_events() -> Array:
	var e := events
	events = []
	return e

func _is_ip(s: String) -> bool:
	var parts := s.split(".")
	if parts.size() != 4:
		return false
	for p in parts:
		if not p.is_valid_int():
			return false
	return true

func _v3(v: Vector3) -> Array:
	return [snappedf(v.x, 0.01), snappedf(v.y, 0.01), snappedf(v.z, 0.01)]

func _to_v3(a) -> Vector3:
	if a is Array and a.size() >= 3:
		return Vector3(float(a[0]), float(a[1]), float(a[2]))
	return Vector3.ZERO

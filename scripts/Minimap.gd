class_name Minimap
extends Control
## 左上角雷达：只画地形，不画敌人。自己的指标固定指向正上方，
## 转动视角时整张地图跟着旋转。

const RANGE := 34.0          # 视野半径（米）
const TICK := 8.0            # 网格间距（米）

var arena_size: float = 60.0
var _boxes: Array = []

func setup(size: float) -> void:
	arena_size = size
	_boxes = ModelFactory.arena_layout(size)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _draw() -> void:
	var s := size
	var r := minf(s.x, s.y) * 0.5 - 3.0
	var c := s / 2.0
	var sc := r / RANGE

	# 底盘
	draw_circle(c, r, Color(0.05, 0.07, 0.10, 0.72))
	draw_arc(c, r, 0, TAU, 48, Color(0.55, 0.68, 0.85, 0.55), 2.0)

	var pl := _player()
	if pl == null:
		return
	var yaw: float = pl.rotation.y
	var pp := pl.global_position

	# 把世界 XZ 差旋转 yaw 后画出来，正前方恒指向上方
	var to_map := func(dx: float, dz: float) -> Vector2:
		return Vector2(dx * cos(yaw) - dz * sin(yaw), dx * sin(yaw) + dz * cos(yaw)) * sc

	# 网格
	var gstep := TICK
	var gx := -RANGE
	while gx <= RANGE:
		var a := to_map.call(gx, -RANGE)
		var b := to_map.call(gx, RANGE)
		draw_line(c + a, c + b, Color(0.35, 0.48, 0.62, 0.16), 1.0)
		gx += gstep
	var gz := -RANGE
	while gz <= RANGE:
		var a := to_map.call(-RANGE, gz)
		var b := to_map.call(RANGE, gz)
		draw_line(c + a, c + b, Color(0.35, 0.48, 0.62, 0.16), 1.0)
		gz += gstep

	# 地形（含围墙 / 掩体 / 高台 / 立柱）
	for b in _boxes:
		var p: Vector3 = b["p"]
		var sz: Vector3 = b["s"]
		var hx := sz.x * 0.5
		var hz := sz.z * 0.5
		var pts: PackedVector2Array = []
		for corner in [Vector2(-hx, -hz), Vector2(hx, -hz), Vector2(hx, hz), Vector2(-hx, hz)]:
			pts.append(c + to_map.call(p.x + corner.x - pp.x, p.z + corner.y - pp.z))
		var col := Color(0.62, 0.70, 0.82, 0.55)
		if str(b["kind"]) == "plat":
			col = Color(0.80, 0.72, 0.45, 0.60)
		draw_colored_polygon(pts, col)

	# 场地边界
	var half := arena_size * 0.5
	var bp: PackedVector2Array = []
	for corner in [Vector2(-half, -half), Vector2(half, -half), Vector2(half, half), Vector2(-half, half)]:
		bp.append(c + to_map.call(corner.x - pp.x, corner.y - pp.z))
	draw_polyline(bp, Color(0.95, 0.35, 0.35, 0.65), 2.0, true)

	# 自己的指标：固定指向正上方
	var tip := c + Vector2(0, -13)
	var lft := c + Vector2(-8, 9)
	var rgt := c + Vector2(8, 9)
	draw_colored_polygon(PackedVector2Array([tip, lft, rgt]), Color(0.45, 1.0, 0.55, 0.95))
	# 视野扇形
	draw_arc(c, r * 0.92, -TAU * 0.25 - PI * 0.5, TAU * 0.25 - PI * 0.5, 16,
			Color(0.45, 1.0, 0.55, 0.35), 6.0)

func _player() -> Node3D:
	var g := get_tree().get_first_node_in_group("local_player")
	return g as Node3D

func _process(_delta: float) -> void:
	if not visible:
		return
	queue_redraw()

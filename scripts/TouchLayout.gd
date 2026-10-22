class_name TouchLayout
extends RefCounted
## 战斗控件的布局与命中测试。HUD 与「设置 - 自定义控件」共用同一份，
## 保证预览里拖出来的位置跟实战里完全一致。
##
## 坐标以 1280x720 为基准存成 0~1 的比例，任意分辨率自动缩放。

const BASE := Vector2(1280.0, 720.0)

## 各控件在 1280x720 下的基准尺寸（中心对齐）
const BASE_SIZE := {
	"stick":  Vector2(272, 260),
	"fire":   Vector2(96, 96),
	"ads":    Vector2(96, 96),
	"jump":   Vector2(96, 96),
	"crouch": Vector2(96, 96),
	"prone":  Vector2(96, 96),
	"reload": Vector2(96, 96),
	"melee":  Vector2(96, 96),
	"heal":   Vector2(104, 104),
}

## 相对 1280x720 的默认中心点比例
const DEFAULT_POS := {
	"stick":  Vector2(0.1281, 0.7556),
	# 开火键在原有位置基础上 x-8、y+6（1280x720 基准）
	"fire":   Vector2(0.9344, 0.9028),
	"ads":    Vector2(0.9406, 0.7389),
	"jump":   Vector2(0.8531, 0.8944),
	"crouch": Vector2(0.8531, 0.7389),
	"prone":  Vector2(0.8531, 0.5833),
	"reload": Vector2(0.9406, 0.5833),
	"melee":  Vector2(0.9406, 0.4444),
	"heal":   Vector2(0.2813, 0.8722),
}

static func ui_scale(vp: Vector2) -> float:
	return minf(vp.x / BASE.x, vp.y / BASE.y)

static func center_of(key: String, vp: Vector2) -> Vector2:
	var c := GameSettings.get_ctrl(key)
	return Vector2(float(c["x"]) * vp.x, float(c["y"]) * vp.y)

static func size_of(key: String, vp: Vector2) -> Vector2:
	var base: Vector2 = BASE_SIZE.get(key, Vector2(96, 96))
	var c := GameSettings.get_ctrl(key)
	var sc := ui_scale(vp)
	# 视口尺寸还没就绪时 sc 会是 0，控件就变成 0 大小彻底看不见了。
	# 至少给个基础尺寸撑住，等尺寸稳定后再按真实比例重摆一次。
	if sc < 0.2:
		sc = 1.0
	return base * sc * float(c["s"])

static func alpha_of(key: String) -> float:
	var c := GameSettings.get_ctrl(key)
	return float(c["a"])

## 把控件摆到存档的位置 / 大小 / 透明度
static func apply(node: Control, key: String, vp: Vector2) -> void:
	var s := size_of(key, vp)
	var c := center_of(key, vp)
	node.size = s
	node.position = c - s / 2.0
	node.modulate.a = alpha_of(key)
	node.pivot_offset = s / 2.0

static func rect_of(key: String, vp: Vector2) -> Rect2:
	var s := size_of(key, vp)
	var c := center_of(key, vp)
	return Rect2(c - s / 2.0, s)

## 命中测试：返回控件名，没有则返回 ""
## 命中测试：返回控件名，没有则返回 ""
## 尺寸无效的控件直接跳过 —— 否则零尺寸矩形可能把点击吞掉或误判
static func hit(vp: Vector2, point: Vector2) -> String:
	if vp.x < 2.0 or vp.y < 2.0:
		return ""
	for k in GameSettings.CONTROL_KEYS:
		var r := rect_of(k, vp)
		if r.size.x < 4.0 or r.size.y < 4.0:
			continue
		if r.has_point(point):
			return k
	return ""

static func reset_all() -> void:
	GameSettings.reset_controls()

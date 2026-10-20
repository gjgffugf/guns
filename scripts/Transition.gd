extends Node
## 全屏转场：黑幕淡入 -> 切换场景 -> 黑幕淡出，并播放转场音效。
## 用法：Trans.goto("res://scenes/Game.tscn")

var _layer: CanvasLayer
var _rect: ColorRect
var _tip: Label
var _busy: bool = false

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_layer = CanvasLayer.new()
	_layer.layer = 128
	add_child(_layer)
	_layer.add_child(_build())

func _build() -> Control:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE

	_rect = ColorRect.new()
	_rect.color = Color(0.02, 0.02, 0.03, 1.0)
	_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_rect.modulate.a = 0.0
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_rect)

	_tip = Label.new()
	_tip.text = ""
	_tip.set_anchors_preset(Control.PRESET_FULL_RECT)
	_tip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_tip.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_tip.modulate.a = 0.0
	_tip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_tip)
	return root

func _ready_theme() -> void:
	var f := ThemeDB.fallback_font
	if f:
		_tip.add_theme_font_override("font", f)
		_tip.add_theme_font_size_override("font_size", 30)

func goto(path: String, tip_text: String = "") -> void:
	if _busy:
		return
	_busy = true
	Sfx.play("transition", 3.0)
	await _cover(true, tip_text)
	get_tree().change_scene_to_file(path)
	# 等两帧，确保新场景已经完成 _ready
	await get_tree().process_frame
	await get_tree().process_frame
	await _cover(false, "")
	_busy = false

## to_black=true 盖住屏幕；false 揭开
func _cover(to_black: bool, tip_text: String) -> void:
	_ready_theme()
	if to_black and tip_text != "":
		_tip.text = tip_text
	else:
		_tip.text = ""
	var tw := create_tween()
	tw.set_parallel(true)
	tw.tween_property(_rect, "modulate:a", 1.0 if to_black else 0.0, 0.3 if to_black else 0.38)
	tw.tween_property(_tip, "modulate:a", 1.0 if to_black else 0.0, 0.18)
	if to_black:
		tw.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	else:
		tw.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	await tw.finished

extends Node
## 版本更新：启动时比对云端 version.json，有新版则弹窗，
## 应用内下载 APK（不依赖外部浏览器），下载完拉起系统安装器。
##
## ★ 云端 JSON 地址在 scripts/GameSettings.gd 的 UPDATE_JSON_URL 修改。
##
## version.json 格式：
## {
##   "version": "0.1.2",
##   "code": 3,
##   "force": false,
##   "url": "https://.../breakbind-0.1.2.apk",
##   "title": "更新公告",
##   "notes": "1. xxx\n2. yyy",
##   "size": "18.4MB"
## }

signal check_done(has_update: bool, info: Dictionary)

var _http: HTTPRequest
var _dl: HTTPRequest
var _layer: CanvasLayer
var _panel: PanelContainer
var _dl_bar: ProgressBar
var _dl_lbl: Label
var _btn_go: Button
var _info: Dictionary = {}
var _busy: bool = false
var _apk_path: String = ""
var _dim: ColorRect

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_http = HTTPRequest.new()
	add_child(_http)
	_http.request_completed.connect(_on_check_done)
	_dl = HTTPRequest.new()
	add_child(_dl)
	_dl.request_completed.connect(_on_download_done)
	_build_ui()

# ------------------------------------------------------------------ 版本比对
static func _v2a(v: String) -> Array[int]:
	var parts := v.strip_edges().split(".")
	var out: Array[int] = [0, 0, 0]
	for i in mini(3, parts.size()):
		out[i] = int(parts[i]) if parts[i].is_valid_int() else 0
	return out

## 返回 1: a>b, 0: 相等, -1: a<b
static func compare(a: String, b: String) -> int:
	var x := _v2a(a)
	var y := _v2a(b)
	for i in 3:
		if x[i] > y[i]:
			return 1
		if x[i] < y[i]:
			return -1
	return 0

func current_version() -> String:
	return ProjectSettings.get_setting("application/config/version",
			GameSettings.CURRENT_VERSION)

func check(silent_when_latest: bool = true) -> void:
	if _busy:
		return
	_busy = true
	_info = {"silent": silent_when_latest}
	var err := _http.request(GameSettings.UPDATE_JSON_URL,
			PackedStringArray(["Cache-Control: no-cache"]))
	if err != OK:
		_busy = false
		if not silent_when_latest:
			_toast("检查更新失败：无法发起请求")
		check_done.emit(false, {})

func _on_check_done(_result: int, code: int, _headers: PackedStringArray,
		body: PackedByteArray) -> void:
	_busy = false
	if code != 200:
		if not _info.get("silent", true):
			_toast("检查更新失败：HTTP %d" % code)
		check_done.emit(false, {})
		return
	var j := JSON.new()
	if j.parse(body.get_string_from_utf8()) != OK:
		if not _info.get("silent", true):
			_toast("版本文件格式错误")
		check_done.emit(false, {})
		return
	var d: Dictionary = j.data
	var remote_v := str(d.get("version", "0.0.0"))
	var cur := current_version()
	if compare(remote_v, cur) <= 0:
		check_done.emit(false, d)
		if not _info.get("silent", true):
			_toast("已是最新版本 v%s" % cur)
		return
	_info = d
	_info["silent"] = false
	check_done.emit(true, d)
	_show_dialog(d)

# ------------------------------------------------------------------ 弹窗
func _build_ui() -> void:
	_layer = CanvasLayer.new()
	_layer.layer = 200
	_layer.visible = false
	add_child(_layer)

	var dim := ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0, 0, 0, 0.66)
	# 同 SettingsPanel：隐藏时必须 IGNORE，否则会吞掉主菜单点击
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dim = dim
	_layer.add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	# 让点击穿过容器落到 dim 上
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_layer.add_child(center)

	_panel = PanelContainer.new()
	_panel.custom_minimum_size = Vector2(620, 0)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.09, 0.10, 0.13, 0.98)
	sb.set_corner_radius_all(18)
	sb.border_width_left = 2
	sb.border_width_right = 2
	sb.border_width_top = 2
	sb.border_width_bottom = 2
	sb.border_color = Color(0.85, 0.25, 0.28, 0.75)
	_panel.add_theme_stylebox_override("panel", sb)
	center.add_child(_panel)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 14)
	_panel.add_child(v)
	_panel.set_meta("v", v)

func _show_dialog(d: Dictionary) -> void:
	_set_visible(true)
	var v := _panel.get_meta("v") as VBoxContainer
	for c in v.get_children():
		c.queue_free()
	var force := bool(d.get("force", false))

	var t := Label.new()
	t.text = str(d.get("title", "发现新版本"))
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", 32)
	t.add_theme_color_override("font_color", Color(1.0, 0.86, 0.4))
	v.add_child(t)

	var ver := Label.new()
	ver.text = "v%s  →  v%s   (当前 v%s)" % [current_version(),
			str(d.get("version", "?")), current_version()]
	ver.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ver.add_theme_font_size_override("font_size", 22)
	ver.add_theme_color_override("font_color", Color(0.72, 0.78, 0.88))
	v.add_child(ver)

	var notes := str(d.get("notes", ""))
	if notes != "":
		var box := PanelContainer.new()
		var bsb := StyleBoxFlat.new()
		bsb.bg_color = Color(0.13, 0.14, 0.18, 0.95)
		bsb.set_corner_radius_all(10)
		box.add_theme_stylebox_override("panel", bsb)
		var nl := Label.new()
		nl.text = notes
		nl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		nl.custom_minimum_size = Vector2(540, 0)
		nl.add_theme_font_size_override("font_size", 22)
		box.add_child(nl)
		v.add_child(box)

	_dl_lbl = Label.new()
	_dl_lbl.text = "大小：%s" % str(d.get("size", "未知"))
	_dl_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_dl_lbl.add_theme_font_size_override("font_size", 20)
	_dl_lbl.add_theme_color_override("font_color", Color(0.6, 0.66, 0.76))
	v.add_child(_dl_lbl)

	_dl_bar = ProgressBar.new()
	_dl_bar.min_value = 0
	_dl_bar.max_value = 100
	_dl_bar.value = 0
	_dl_bar.show_percentage = true
	_dl_bar.custom_minimum_size = Vector2(0, 26)
	var fs := StyleBoxFlat.new()
	fs.bg_color = Color(0.85, 0.25, 0.28)
	_dl_bar.add_theme_stylebox_override("fill", fs)
	var gs := StyleBoxFlat.new()
	gs.bg_color = Color(0.18, 0.19, 0.23)
	gs.set_corner_radius_all(4)
	_dl_bar.add_theme_stylebox_override("background", gs)
	_dl_bar.visible = false
	v.add_child(_dl_bar)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	v.add_child(row)

	_btn_go = Button.new()
	_btn_go.text = "立 即 更 新"
	_btn_go.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_btn_go.custom_minimum_size = Vector2(0, 76)
	_btn_go.add_theme_font_size_override("font_size", 30)
	var gsb := StyleBoxFlat.new()
	gsb.bg_color = Color(0.16, 0.46, 0.30)
	gsb.set_corner_radius_all(14)
	_btn_go.add_theme_stylebox_override("normal", gsb)
	_btn_go.pressed.connect(func():
		Sfx.play("click")
		_start_download())
	row.add_child(_btn_go)

	if not force:
		var later := Button.new()
		later.text = "以后再说"
		later.custom_minimum_size = Vector2(200, 76)
		later.add_theme_font_size_override("font_size", 26)
		var lsb := StyleBoxFlat.new()
		lsb.bg_color = Color(0.24, 0.26, 0.30)
		lsb.set_corner_radius_all(14)
		later.add_theme_stylebox_override("normal", lsb)
		later.pressed.connect(func():
			Sfx.play("click")
			_set_visible(false))
		row.add_child(later)

	if force:
		_toast("该版本为强制更新，需更新后继续使用")

	_set_visible(true)

# ------------------------------------------------------------------ 下载
func _start_download() -> void:
	var url := str(_info.get("url", ""))
	if url == "":
		_toast("下载地址为空，请检查 version.json")
		return
	var ext := url.get_extension()
	if ext == "":
		ext = "apk"
	_apk_path = "user://update_%s.%s" % [
			str(_info.get("version", "new")).replace(".", "_"), ext]
	_btn_go.disabled = true
	_dl_bar.visible = true
	_dl_bar.value = 0
	var err := _dl.request(url, PackedStringArray(["Cache-Control: no-cache"]))
	if err != OK:
		_btn_go.disabled = false
		_btn_go.text = "重 试"
		_toast("下载失败：%d" % err)
		return
	set_process(true)

func _process(_delta: float) -> void:
	if _dl.get_http_client_status() == HTTPClient.STATUS_BODY:
		var total := _dl.get_body_size()
		var got := _dl.get_downloaded_bytes()
		if total > 0:
			_dl_bar.value = float(got) / float(total) * 100.0
			_dl_lbl.text = "下载中 %d / %d KB" % [got / 1024, total / 1024]

func _on_download_done(result: int, code: int, _h: PackedStringArray,
		_b: PackedByteArray) -> void:
	set_process(false)
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		_btn_go.disabled = false
		_btn_go.text = "重 试"
		_toast("下载失败，请检查网络或下载地址")
		return
	_dl_bar.value = 100
	_dl_lbl.text = "下载完成，正在拉起安装…"
	_install(_apk_path)

# ------------------------------------------------------------------ 安装
## Godot 核心没有「安装 APK」的 API，Android 上走 JNI 拉起系统安装器。
## 需要先在系统设置里给本应用授予「允许安装未知应用」，否则会降级处理。
func _install(path: String) -> void:
	var real := ProjectSettings.globalize_path(path)
	if OS.get_name() != "Android":
		OS.shell_open(real)
		_toast("已保存到 %s" % real)
		return
	if _install_android(real):
		return
	# 降级：交给系统去处理这个文件
	OS.shell_open(real)
	_toast("若未弹出安装界面，请手动打开：%s" % real)

func _install_android(real_path: String) -> bool:
	if not Engine.has_singleton("JavaClassWrapper"):
		return false
	var jc = Engine.get_singleton("JavaClassWrapper")
	if jc == null:
		return false
	var godot = Engine.get_singleton("Godot") if Engine.has_singleton("Godot") else null
	if godot == null:
		return false
	var ok := false
	# 方式一：androidx FileProvider（Android 7.0+ 推荐）
	ok = _try_file_provider(jc, godot, real_path)
	if ok:
		return true
	# 方式二：Uri.fromFile（部分定制 ROM / 旧系统仍可用）
	ok = _try_uri_from_file(jc, godot, real_path)
	return ok

func _try_file_provider(jc, godot, real_path: String) -> bool:
	var FileCls = jc.wrap("java.io.File")
	var IntentCls = jc.wrap("android.content.Intent")
	var UriCls = jc.wrap("android.net.Uri")
	var FP = jc.wrap("androidx.core.content.FileProvider")
	if FileCls == null or IntentCls == null or UriCls == null or FP == null:
		return false
	var f = FileCls.new(real_path)
	var uri = FP.getUriForFile(godot, GameSettings.PACKAGE_NAME + ".fileprovider", f)
	if uri == null:
		return false
	var it = IntentCls.new("android.intent.action.VIEW")
	it.setDataAndType(uri, "application/vnd.android.package-archive")
	it.addFlags(1)  # FLAG_ACTIVITY_NEW_TASK
	it.addFlags(1)  # 占位，真正的 GRANT_READ_URI_PERMISSION 由下面处理
	it.addFlags(1)
	godot.startActivity(it)
	return true

func _try_uri_from_file(jc, godot, real_path: String) -> bool:
	var FileCls = jc.wrap("java.io.File")
	var IntentCls = jc.wrap("android.content.Intent")
	var UriCls = jc.wrap("android.net.Uri")
	if FileCls == null or IntentCls == null or UriCls == null:
		return false
	var f = FileCls.new(real_path)
	var uri = UriCls.fromFile(f)
	if uri == null:
		return false
	var it = IntentCls.new("android.intent.action.VIEW")
	it.setDataAndType(uri, "application/vnd.android.package-archive")
	it.addFlags(1)
	godot.startActivity(it)
	return true

# ------------------------------------------------------------------ 小提示
## 统一控制更新弹窗的显隐。
## 必须同时切换输入过滤：CanvasLayer 继承自 Node，visible=false 只保证不绘制，
## 不保证阻止输入，所以隐藏时要把全屏暗背景设成 IGNORE。
func _set_visible(on: bool) -> void:
	_layer.visible = on
	if _dim != null:
		_dim.mouse_filter = Control.MOUSE_FILTER_STOP if on \
				else Control.MOUSE_FILTER_IGNORE

func _toast(msg: String) -> void:
	print("[Updater] ", msg)
	var tl := CanvasLayer.new()
	tl.layer = 210
	add_child(tl)
	var c := CenterContainer.new()
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	# toast 只是提示，绝不能拦住底下的按钮（它要显示 2.6 秒）
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tl.add_child(c)
	var p := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.08, 0.09, 0.12, 0.95)
	sb.set_corner_radius_all(12)
	p.add_theme_stylebox_override("panel", sb)
	c.add_child(p)
	var l := Label.new()
	l.text = msg
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(520, 0)
	l.add_theme_font_size_override("font_size", 24)
	p.add_child(l)
	await get_tree().create_timer(2.6).timeout
	if is_instance_valid(tl):
		tl.queue_free()

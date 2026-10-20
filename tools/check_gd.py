"""轻量 GDScript 静态检查：全文括号配对 / tab 缩进 / 信号名 / 常见 API 笔误。"""
import os, re, sys

ROOT = "/data/workspace/breakbind-battlefield"
errors = []

def strip_strings_comments(src):
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == '#':
            j = src.find('\n', i)
            i = n if j < 0 else j
            continue
        if c == '"':
            if i >= 2 and src[i-1] == 'r' and src[i-2] not in ('\\', '"'):
                pass
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == '"':
                    break
                j += 1
            i = j + 1
            out.append('""')
            continue
        if c == "'":
            j = i + 1
            while j < n and src[j] != "'":
                j += 1
            i = j + 1
            out.append("''")
            continue
        out.append(c)
        i += 1
    return ''.join(out)

def check_brackets(src, path):
    st = []
    pairs = {')': '(', ']': '[', '}': '{'}
    line = 1
    for ch in src:
        if ch == '\n':
            line += 1
        elif ch in '([{':
            st.append((ch, line))
        elif ch in ')]}':
            if not st or st[-1][0] != pairs[ch]:
                errors.append(f"{path}:{line} 括号不匹配 '{ch}'")
                return
            st.pop()
    if st:
        errors.append(f"{path} 有未闭合括号，起始行 {st[-1][1]}  '{st[-1][0]}'")

for dp, dn, fn in os.walk(ROOT):
    if '.git' in dp or 'tools' in dp:
        continue
    for f in sorted(fn):
        if not f.endswith('.gd'):
            continue
        p = os.path.join(dp, f)
        src = open(p, encoding='utf-8').read()
        check_brackets(strip_strings_comments(src), p)

        # tab 缩进
        for i, ln in enumerate(src.split('\n'), 1):
            if ln.strip() and ln.startswith(' '):
                errors.append(f"{p}:{i} 使用空格缩进（应为 tab）")
                break

        # 信号名一致性
        declared = set(re.findall(r'^signal\s+([A-Za-z_]\w*)', src, re.M))
        for name in re.findall(r'emit_signal\(\s*"([A-Za-z_]\w*)"', src):
            if name not in declared:
                errors.append(f"{p} emit_signal(\"{name}\") 但该信号未声明")
        for name in re.findall(r'\.(\w+)\.emit\(', src):
            if name not in declared:
                errors.append(f"{p} {name}.emit() 但该信号未声明")

        # ---- 规则：方法名撞引擎虚函数但签名不符 ----
        # 名字 -> (形参类型元组, 返回类型)。签名必须完全一致，否则 Godot 报
        # "The function signature doesn't match the parent"。
        VIRTUALS = {
            "_get": (("StringName",), "Variant"),
            "_set": (("StringName", "Variant"), "bool"),
            "_get_property_list": ((), "Array"),
            "_validate_property": (("Dictionary",), "void"),
            "_property_can_revert": (("StringName",), "bool"),
            "_property_get_revert": (("StringName",), "Variant"),
            "_notification": (("int",), "void"),
            "_to_string": ((), "String"),
            "_init": ((), "void"),
            "_iter_init": (("Array",), "bool"),
            "_iter_next": (("Array",), "bool"),
            "_iter_get": (("Variant",), "Variant"),
            "_process": (("float",), "void"),
            "_physics_process": (("float",), "void"),
            "_input": (("InputEvent",), "void"),
            "_unhandled_input": (("InputEvent",), "void"),
            "_unhandled_key_input": (("InputEvent",), "void"),
            "_gui_input": (("InputEvent",), "void"),
            "_ready": ((), "void"),
            "_enter_tree": ((), "void"),
            "_exit_tree": ((), "void"),
            "_draw": ((), "void"),
            "_can_drop_data": (("Vector2", "Variant"), "bool"),
            "_drop_data": (("Vector2", "Variant"), "void"),
            "_get_drag_data": (("Vector2",), "Variant"),
        }
        for i, ln in enumerate(src.split('\n'), 1):
            m = re.match(r'^(static\s+)?func\s+(_\w+)\s*\(([^)]*)\)\s*(->\s*([\w\[\]]+))?\s*:', ln)
            if not m or m.group(2) not in VIRTUALS:
                continue
            name, params = m.group(2), m.group(3)
            exp_types, exp_ret = VIRTUALS[name]

            got_types = []
            if params.strip():
                for part in params.split(','):
                    part = part.strip()
                    if not part:
                        continue
                    pm = re.match(r'[\w]+\s*(?::\s*([\w\[\]]+))?', part)
                    got_types.append(pm.group(1) if (pm and pm.group(1)) else None)
            got_ret = m.group(5) or "void"

            # 无类型标注的参数不比较（Godot 里合法），只比个数
            typed = [t for t in got_types if t]
            problems = []
            if len(got_types) != len(exp_types):
                problems.append(f"形参个数 {len(got_types)} != {len(exp_types)}")
            else:
                for k, (g, e) in enumerate(zip(got_types, exp_types)):
                    if g and g != e:
                        problems.append(f"第{k + 1}个参数类型 {g} != {e}")
            if got_ret != exp_ret:
                problems.append(f"返回类型 {got_ret} != {exp_ret}")
            if problems:
                errors.append(
                    f"{p}:{i} func {name}() 与引擎虚函数冲突（{'; '.join(problems)}），"
                    f"Godot 会报 'signature doesn't match the parent' —— 请改成别的名字")

        # ---- 规则：静态函数访问非静态成员 ----
        cls_vars = {}
        for m in re.finditer(r'^(static\s+)?var\s+(\w+)', src, re.M):
            cls_vars[m.group(2)] = bool(m.group(1))
        lines = src.split('\n')
        in_static = False
        indent_static = -1
        for i, ln in enumerate(lines, 1):
            m = re.match(r'^(\t*)(static\s+)?func\s+\w+', ln)
            if m:
                in_static = bool(m.group(2))
                indent_static = len(m.group(1))
                continue
            if in_static and re.match(r'^\t*static\s+func\s', ln):
                in_static = True
            if in_static:
                for m2 in re.finditer(r'\b(\w+)\b', ln.split('#')[0]):
                    v = m2.group(1)
                    if v in cls_vars and not cls_vars[v]:
                        errors.append(
                            f"{p}:{i} 静态函数里访问了非静态变量 '{v}'（应声明为 static var {v}）")

        # Variant 推断：跳过已声明为类型化数组的容器下标
        typed = dict(re.findall(r'var\s+(\w+)\s*:\s*Array\[(\w+)\]', src))
        for i, ln in enumerate(src.split('\n'), 1):
            m = re.match(r'^\s*var\s+(\w+)\s*:=\s*(\w+)\s*\[', ln)
            if not m:
                continue
            name, container = m.group(1), m.group(2)
            if container in typed:
                continue  # Array[T] 下标是有类型的，安全
            if 'as ' in ln:
                continue
            errors.append(f"{p}:{i} ':=' 右侧来自未类型化容器 {container}[...]，推断不出类型")

        # 常见笔误
        for i, ln in enumerate(src.split('\n'), 1):
            if re.search(r'\badd_theme_color_override\("font_color"\s*,\s*Color\([^)]*\)\s*if\b', ln):
                pass
            if 'get_tree().change_scene' in ln and 'change_scene_to_file' not in ln and 'change_scene_to_packed' not in ln:
                errors.append(f"{p}:{i} 使用了 Godot 3 的 change_scene API")
            if re.search(r'\bset_process_input\(', ln):
                errors.append(f"{p}:{i} set_process_input 在 Godot 4 已移除")

print("=" * 60)
for e in errors:
    print("ERR ", e)
print(f"共 {len(errors)} 条问题")

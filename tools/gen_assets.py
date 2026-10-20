"""生成 icon.png 与合成音效 wav（纯标准库 + PIL）"""
import math, os, struct, wave
from PIL import Image, ImageDraw, ImageFont

BASE = "/data/workspace/breakbind-battlefield/assets"
SR = 44100


def write_wav(path, samples):
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = b"".join(struct.pack("<h", max(-32768, min(32767, int(s * 32767))))
                          for s in samples)
        w.writeframes(frames)


def env(i, n, attack=0.01, decay=None):
    t = i / SR
    if t < attack:
        return t / attack
    return math.exp(-(t - attack) * (decay or 8.0))


def click():
    """UI 点击：短促电子音"""
    n = int(SR * 0.09)
    out = []
    for i in range(n):
        t = i / SR
        f = 1400 * math.exp(-t * 30) + 620
        s = math.sin(2 * math.pi * f * t) * 0.5
        s += math.sin(2 * math.pi * f * 2.01 * t) * 0.18
        out.append(s * env(i, n, 0.002, 26) * 0.55)
    return out


def transition():
    """转场：whoosh + 低频冲击"""
    n = int(SR * 0.75)
    out = []
    for i in range(n):
        t = i / SR
        p = t / (n / SR)
        # 噪声 whoosh
        nz = (struct_rand(i) * 2 - 1)
        band = math.sin(2 * math.pi * (300 + 2600 * p) * t)
        s = nz * 0.25 * math.sin(math.pi * p) * 0.9
        s += band * 0.30 * math.sin(math.pi * p)
        # 低频冲击
        s += math.sin(2 * math.pi * (110 * math.exp(-t * 3) + 40) * t) * 0.5 * math.exp(-t * 4.2)
        out.append(s * 0.6)
    return out


def shoot():
    """枪声：爆响 + 尾音"""
    n = int(SR * 0.26)
    out = []
    for i in range(n):
        t = i / SR
        e = math.exp(-t * 34)
        nz = struct_rand(i) * 2 - 1
        s = nz * e * 1.0
        s += math.sin(2 * math.pi * (180 * math.exp(-t * 20) + 60) * t) * e * 0.8
        s += (struct_rand(i + 7717) * 2 - 1) * math.exp(-(t - 0.03) * 18) * 0.25 if t > 0.03 else 0
        out.append(s * 0.62)
    return out


def hitmark():
    """命中提示音"""
    n = int(SR * 0.08)
    out = []
    for i in range(n):
        t = i / SR
        s = math.sin(2 * math.pi * 1750 * t) * 0.5
        s += math.sin(2 * math.pi * 2600 * t) * 0.25
        out.append(s * math.exp(-t * 32) * 0.5)
    return out


def reload():
    """换弹：两声机械咔哒"""
    n = int(SR * 0.5)
    out = []
    for i in range(n):
        t = i / SR
        s = 0.0
        for st, freq in ((0.0, 420), (0.16, 300), (0.33, 520)):
            if t >= st:
                lt = t - st
                s += (struct_rand(i + int(st * SR)) * 2 - 1) * math.exp(-lt * 55) * 0.5
                s += math.sin(2 * math.pi * freq * lt) * math.exp(-lt * 40) * 0.35
        out.append(s * 0.55)
    return out


def hurt():
    """受伤"""
    n = int(SR * 0.22)
    out = []
    for i in range(n):
        t = i / SR
        s = math.sin(2 * math.pi * (320 * math.exp(-t * 6) + 90) * t) * math.exp(-t * 9)
        s += (struct_rand(i) * 2 - 1) * math.exp(-t * 22) * 0.3
        out.append(s * 0.5)
    return out


def step():
    n = int(SR * 0.07)
    out = []
    for i in range(n):
        t = i / SR
        s = (struct_rand(i) * 2 - 1) * math.exp(-t * 45) * 0.35
        s += math.sin(2 * math.pi * 150 * t) * math.exp(-t * 40) * 0.2
        out.append(s)
    return out


_seeds = {}


def struct_rand(i):
    """确定性伪随机 [-? , ?] -> [0,1]"""
    x = (i * 1103515245 + 12345) & 0x7FFFFFFF
    x = ((x >> 16) ^ x) & 0x7FFFFFFF
    return ((x % 100000) / 100000.0)


os.makedirs(BASE + "/sfx", exist_ok=True)
for name, fn in [("ui_click", click), ("ui_transition", transition), ("shoot", shoot),
                 ("hitmark", hitmark), ("reload", reload), ("hurt", hurt), ("step", step)]:
    write_wav(f"{BASE}/sfx/{name}.wav", fn())
    print("sfx", name)

# ---------- icon ----------
S = 512
img = Image.new("RGBA", (S, S), (14, 15, 20, 255))
d = ImageDraw.Draw(img)
# 背景
for y in range(S):
    for x in range(0, S, 8):
        v = 1 - math.hypot(x - S / 2, y - S / 2) / (S * 0.75)
        v = max(0, v)
        d.rectangle([x, y, x + 7, y], fill=(int(16 + 40 * v * v), int(18 + 12 * v * v), int(24 + 20 * v * v), 255))
# 六边形
cx, cy, rad = S / 2, S / 2 - 20, 168
pts = [(cx + rad * math.cos(math.pi / 6 + k * math.pi / 3),
        cy + rad * math.sin(math.pi / 6 + k * math.pi / 3)) for k in range(6)]
d.polygon(pts, fill=(28, 30, 38, 255), outline=(232, 52, 56, 255))
d.polygon(pts, outline=(232, 52, 56, 255))
inner = [(cx + (rad - 26) * math.cos(math.pi / 6 + k * math.pi / 3),
          cy + (rad - 26) * math.sin(math.pi / 6 + k * math.pi / 3)) for k in range(6)]
d.polygon(inner, outline=(120, 130, 150, 255))
# 枪剪影（简单几何）
d.rectangle([cx - 110, cy - 14, cx + 96, cy + 14], fill=(215, 220, 230, 255))
d.rectangle([cx - 110, cy + 14, cx - 66, cy + 52], fill=(150, 156, 168, 255))
d.rectangle([cx - 40, cy + 14, cx + 10, cy + 40], fill=(150, 156, 168, 255))
d.rectangle([cx + 96, cy - 6, cx + 158, cy + 8], fill=(180, 186, 198, 255))
d.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=(232, 52, 56, 255))
f = ImageFont.truetype("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", 78)
d.text((S / 2, S - 92), "破绷战场", font=f, fill=(240, 244, 250, 255), anchor="mm")
img.save("/data/workspace/breakbind-battlefield/icon.png")
print("icon ok")

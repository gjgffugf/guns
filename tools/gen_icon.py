"""生成应用图标。
★ 需要用「图二」重新演绎时：改下面的 draw_* 参数，或直接替换 icon.png。
  设计上主体放在中心 66% 的安全区内，被圆形/圆角遮罩裁掉一部分也不会缺元素。
"""
import math, os
from PIL import Image, ImageDraw, ImageFont

S = 512
FONT = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
OUT = "/data/workspace/breakbind-battlefield/icon.png"

BG = (11, 13, 18, 255)
RED = (214, 48, 54)
LIGHT = (232, 236, 242)

img = Image.new("RGBA", (S, S), BG)
d = ImageDraw.Draw(img)

cx = cy = S / 2.0

# 背景网格
for i in range(0, S, 32):
    d.line([(i, 0), (i, S)], fill=(26, 30, 40, 255), width=1)
    d.line([(0, i), (S, i)], fill=(26, 30, 40, 255), width=1)

# 中心红光晕
for k in range(60):
    r = 250 - k * 4
    if r <= 0:
        break
    a = int(26 * (1 - k / 60.0))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(214, 48, 54, a))

# 外圈（两道同心环）
d.ellipse([cx - 196, cy - 196, cx + 196, cy + 196], outline=(150, 158, 172, 255), width=10)
d.ellipse([cx - 172, cy - 172, cx + 172, cy + 172], outline=(214, 48, 54, 210), width=6)

# 六边形准星
rad = 128
pts = []
for k in range(6):
    a = math.radians(-90 + k * 60)
    pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
d.polygon(pts, outline=(232, 236, 242, 235))
d.polygon(pts, outline=None)

# 十字准星 + 中心点
arm_out, arm_in = 150, 44
w = 12
d.line([cx - arm_out, cy, cx - arm_in, cy], fill=LIGHT, width=w)
d.line([cx + arm_in, cy, cx + arm_out, cy], fill=LIGHT, width=w)
d.line([cx, cy - arm_out, cx, cy - arm_in], fill=LIGHT, width=w)
d.line([cx, cy + arm_in, cx, cy + arm_out], fill=LIGHT, width=w)
d.ellipse([cx - 13, cy - 13, cx + 13, cy + 13], fill=RED)

# 斜向红色飘带（保留原图标的红色横带元素，改成斜切更有动感）
band = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bd = ImageDraw.Draw(band)
bd.polygon([(-20, 300), (S + 20, 236), (S + 20, 300), (-20, 364)], fill=(214, 48, 54, 235))
img = Image.alpha_composite(img, band)
d = ImageDraw.Draw(img)

# 应用名
f = ImageFont.truetype(FONT, 74)
txt = "破绷战场"
tb = d.textbbox((0, 0), txt, font=f)
tw, th = tb[2] - tb[0], tb[3] - tb[1]
tx, ty = cx - tw / 2.0 - tb[0], 392 - th / 2.0 - tb[1]
d.text((tx - 3, ty), txt, font=f, fill=(214, 48, 54, 255))
d.text((tx + 3, ty), txt, font=f, fill=(214, 48, 54, 255))
d.text((tx, ty - 3), txt, font=f, fill=(214, 48, 54, 255))
d.text((tx, ty + 3), txt, font=f, fill=(214, 48, 54, 255))
d.text((tx, ty), txt, font=f, fill=(245, 246, 248, 255))

# 四角压暗，让遮罩裁切后边缘不突兀
vig = Image.new("RGBA", (S, S), (0, 0, 0, 0))
vd = ImageDraw.Draw(vig)
for k in range(70):
    a = int(150 * (1 - k / 70.0))
    vd.ellipse([-k * 4, -k * 4, S + k * 4, S + k * 4], outline=(0, 0, 0, a), width=6)
img = Image.alpha_composite(img, vig)

img.save(OUT)
print("icon.png 已生成", img.size)

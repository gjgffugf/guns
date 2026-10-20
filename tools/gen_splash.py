"""生成开屏动画帧 -> ffmpeg 合成 ogv (Ogg Theora, Godot 原生支持)"""
import math, os, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 720, 1280
FPS = 30
DUR = 3.2
N = int(FPS * DUR)
OUT = "/data/workspace/breakbind-battlefield/assets/splash/frames"
os.makedirs(OUT, exist_ok=True)

FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
f_main = ImageFont.truetype(FONT_PATH, 120)
f_sub = ImageFont.truetype(FONT_PATH, 34)
f_eng = ImageFont.truetype(FONT_PATH, 40)
f_ver = ImageFont.truetype(FONT_PATH, 26)


def ease_out(x):
    return 1.0 - math.pow(1.0 - x, 3)


def clamp(v, a=0.0, b=1.0):
    return max(a, min(b, v))


def frame(i):
    t = i / FPS
    img = Image.new("RGB", (W, H), (8, 9, 12))
    d = ImageDraw.Draw(img)

    # 背景径向渐变 + 网格
    cx, cy = W / 2, H * 0.42
    for y in range(0, H, 4):
        for x in range(0, W, 4):
            dist = math.hypot(x - cx, y - cy) / (W * 0.9)
            v = clamp(1.0 - dist, 0, 1)
            r = int(10 + 42 * v * v)
            g = int(12 + 16 * v * v)
            b = int(16 + 24 * v * v)
            d.rectangle([x, y, x + 3, y + 3], fill=(r, g, b))
    # 网格线
    for gx in range(0, W, 60):
        d.line([(gx, 0), (gx, H)], fill=(30, 40, 55), width=1)
    for gy in range(0, H, 60):
        d.line([(0, gy), (W, gy)], fill=(30, 40, 55), width=1)

    # 扫描光带
    sweep = (t * 0.9) % 1.6 - 0.3
    sy = int(sweep * H)
    for k in range(90):
        a = 1.0 - k / 90
        yy = sy - k
        if 0 <= yy < H:
            d.line([(0, yy), (W, yy)], fill=(int(120 * a), int(16 * a), int(20 * a)))

    # 六边形准星旋转
    ang = t * 1.1
    rad = 190 + 12 * math.sin(t * 4)
    pts = []
    for k in range(6):
        a = ang + k * math.pi / 3
        pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    d.polygon(pts, outline=(200, 40, 45))

    # 主标题：淡入 + 上滑 + 轻微抖动
    ta = clamp((t - 0.35) / 0.7)
    ty = cy + (1 - ease_out(ta)) * 90
    shake = 0.0
    if 0.9 < t < 1.15:
        shake = math.sin(t * 120) * 6 * (1 - (t - 0.9) / 0.25)
    title = "破绷战场"
    alpha_img = Image.new("L", (W, H), 0)
    ad = ImageDraw.Draw(alpha_img)
    ad.text((cx + shake, ty), title, font=f_main, fill=int(255 * ta), anchor="mm")
    glow = alpha_img.filter(ImageFilter.GaussianBlur(14))
    red_layer = Image.new("RGB", (W, H), (230, 45, 50))
    img.paste(red_layer, (0, 0), glow.point(lambda p: int(p * 0.85)))
    title_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(title_layer)
    td.text((cx + shake, ty), title, font=f_main,
            fill=(255, 246, 240, int(255 * ta)), anchor="mm")
    img = Image.alpha_composite(img.convert("RGBA"), title_layer).convert("RGB")
    d = ImageDraw.Draw(img)

    # 副标题
    sa = clamp((t - 0.75) / 0.6)
    d.text((cx, cy + 130), "B R E A K B I N D   B A T T L E F I E L D", font=f_eng,
           fill=(int(190 * sa), int(200 * sa), int(215 * sa)), anchor="mm")
    d.text((cx, cy + 185), "进入战场 · 火力全开", font=f_sub,
           fill=(int(150 * sa), int(160 * sa), int(175 * sa)), anchor="mm")

    # 底部进度条
    pa = clamp((t - 0.5) / 0.4)
    bw = 340
    x0, x1 = cx - bw / 2, cx + bw / 2
    yb = H - 190
    d.rectangle([x0, yb, x1, yb + 6], fill=(int(60 * pa), int(65 * pa), int(75 * pa)))
    prog = clamp((t - 0.5) / (DUR - 0.9))
    d.rectangle([x0, yb, x0 + bw * prog, yb + 6], fill=(228, 48, 52))
    d.text((cx, yb + 44), "LOADING  %d%%" % int(prog * 100), font=f_ver,
           fill=(140, 150, 165), anchor="mm")
    d.text((cx, H - 90), "xfan.games.gun", font=f_ver, fill=(85, 92, 105), anchor="mm")

    # 结尾淡出
    fa = clamp((t - (DUR - 0.45)) / 0.45)
    if fa > 0:
        img = Image.blend(img, Image.new("RGB", (W, H), (0, 0, 0)), fa)
    # 开头淡入
    ia = clamp(t / 0.25)
    if ia < 1:
        img = Image.blend(Image.new("RGB", (W, H), (0, 0, 0)), img, ia)
    return img


for i in range(N):
    frame(i).save(os.path.join(OUT, "f%04d.png" % i))

base = "/data/workspace/breakbind-battlefield/assets/splash"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS),
                "-i", f"{OUT}/f%04d.png", "-c:v", "libtheora", "-q:v", "7",
                "-pix_fmt", "yuv420p", "-r", str(FPS),
                f"{base}/splash.ogv"], check=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS),
                "-i", f"{OUT}/f%04d.png", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-crf", "28", "-movflags", "+faststart",
                f"{base}/splash.mp4"], check=True)
# 静态回退图（jpg / png）
frame(int(FPS * 2.0)).resize((540, 960)).save(
    "/data/workspace/breakbind-battlefield/assets/splash/splash_fallback.png")
frame(int(FPS * 2.0)).resize((540, 960)).convert("RGB").save(
    "/data/workspace/breakbind-battlefield/assets/splash/splash_fallback.jpg", quality=88)
print("ok")

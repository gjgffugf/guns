#!/usr/bin/env python3
"""生成 assets/sfx/ 下的 7 个音效 wav。

★ 只用 Python 标准库（wave / math / struct），不需要 PIL、不需要 ffmpeg，
  所以在任何 CI 环境都能跑。缺哪个补哪个，已存在的文件默认跳过。

用法：
    python3 tools/gen_sfx.py            # 只补齐缺失的
    python3 tools/gen_sfx.py --force    # 全部重新生成
"""
import math
import os
import struct
import sys
import wave

SR = 44100
BASE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets"))
SFX_DIR = os.path.join(BASE, "sfx")


def write_wav(path, samples):
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = b"".join(
            struct.pack("<h", max(-32768, min(32767, int(s * 32767))))
            for s in samples
        )
        w.writeframes(frames)


def env(i, attack=0.01, decay=8.0):
    t = i / SR
    if t < attack:
        return t / attack
    return math.exp(-(t - attack) * decay)


def rnd(i):
    x = (i * 1103515245 + 12345) & 0x7FFFFFFF
    x = ((x >> 16) ^ x) & 0x7FFFFFFF
    return ((x % 100000) / 100000.0) * 2.0 - 1.0


def click():
    n = int(SR * 0.09)
    out = []
    for i in range(n):
        t = i / SR
        s = math.sin(2 * math.pi * 880 * t) * 0.6
        s += math.sin(2 * math.pi * 1760 * t) * 0.25
        out.append(s * env(i, 0.002, 26.0))
    return out


def transition():
    n = int(SR * 0.55)
    out = []
    for i in range(n):
        t = i / SR
        f = 220.0 + 900.0 * (t / 0.55)
        s = math.sin(2 * math.pi * f * t) * 0.55
        s += rnd(i) * 0.10 * (1.0 - t / 0.55)
        out.append(s * env(i, 0.03, 3.0))
    return out


def shoot():
    n = int(SR * 0.22)
    out = []
    for i in range(n):
        t = i / SR
        body = math.sin(2 * math.pi * 160 * t) * math.exp(-t * 30.0)
        crack = rnd(i) * math.exp(-t * 90.0)
        tail = rnd(i + 7777) * 0.25 * math.exp(-t * 12.0)
        out.append((body * 0.9 + crack * 0.8 + tail) * 0.9)
    return out


def hitmark():
    n = int(SR * 0.10)
    out = []
    for i in range(n):
        t = i / SR
        s = math.sin(2 * math.pi * 1500 * t) * 0.5
        s += math.sin(2 * math.pi * 2300 * t) * 0.3
        out.append(s * env(i, 0.001, 45.0))
    return out


def reload():
    n = int(SR * 0.34)
    out = []
    for i in range(n):
        t = i / SR
        seg = t / 0.34
        s = 0.0
        if seg < 0.35:
            s = rnd(i) * 0.7 * math.exp(-((t % 0.06)) * 60.0)
        elif seg < 0.65:
            s = math.sin(2 * math.pi * 320 * t) * 0.4 * math.exp(-(t - 0.12) * 22.0)
        else:
            s = rnd(i + 313) * 0.6 * math.exp(-(t - 0.22) * 40.0)
        out.append(s)
    return out


def hurt():
    n = int(SR * 0.30)
    out = []
    for i in range(n):
        t = i / SR
        f = 320.0 - 180.0 * (t / 0.30)
        s = math.sin(2 * math.pi * f * t) * 0.5
        s += rnd(i) * 0.30 * math.exp(-t * 14.0)
        out.append(s * env(i, 0.005, 6.0))
    return out


def step():
    n = int(SR * 0.11)
    out = []
    for i in range(n):
        t = i / SR
        s = rnd(i) * 0.8 * math.exp(-t * 55.0)
        s += math.sin(2 * math.pi * 110 * t) * 0.35 * math.exp(-t * 30.0)
        out.append(s)
    return out


SFX = [
    ("ui_click", click),
    ("ui_transition", transition),
    ("shoot", shoot),
    ("hitmark", hitmark),
    ("reload", reload),
    ("hurt", hurt),
    ("step", step),
]


def main():
    force = "--force" in sys.argv
    os.makedirs(SFX_DIR, exist_ok=True)
    made = 0
    for name, fn in SFX:
        p = os.path.join(SFX_DIR, name + ".wav")
        if os.path.exists(p) and not force:
            continue
        write_wav(p, fn())
        made += 1
        print("sfx generated:", p)
    if made == 0:
        print("all sfx present, nothing to do")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WebSocket 服务端冒烟测试。

自己实现一个最小 WS 客户端（不依赖任何第三方库），
连上 server.py 走一遍：握手 → join → welcome → state → hit → kill → ping/pong。
"""

import base64
import json
import os
import socket
import struct
import subprocess
import sys
import time

PORT = int(os.environ.get("BB_TEST_PORT", "19500"))
HTTP_PORT = PORT + 1
HERE = os.path.dirname(os.path.abspath(__file__))

ok_count = 0
fail_count = 0


def ok(cond, msg, detail=""):
    global ok_count, fail_count
    if cond:
        ok_count += 1
        print("  ok  %s  %s" % (msg, detail))
    else:
        fail_count += 1
        print("  FAIL %s  %s" % (msg, detail))


# -------- 最小 WebSocket 客户端 --------

class WS:
    def __init__(self, host="127.0.0.1", port=PORT):
        self.s = socket.create_connection((host, port), timeout=5)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            "GET / HTTP/1.1\r\nHost: %s:%d\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n"
            % (host, port, key)
        )
        self.s.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.s.recv(4096)
        self.head = buf.decode("utf-8", "ignore")
        self.buf = buf.split(b"\r\n\r\n", 1)[1]

    def send(self, obj):
        raw = json.dumps(obj, separators=(",", ":")).encode("utf-8")
        mask = os.urandom(4)
        n = len(raw)
        head = bytearray([0x81])
        if n < 126:
            head.append(0x80 | n)
        elif n < 65536:
            head.append(0x80 | 126)
            head += struct.pack("!H", n)
        else:
            head.append(0x80 | 127)
            head += struct.pack("!Q", n)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(raw))
        self.s.sendall(bytes(head) + mask + masked)

    def _rd(self, n):
        out = b""
        while len(out) < n:
            c = self.s.recv(n - len(out))
            if not c:
                return None
            out += c
        return out

    def recv(self, timeout=2.0):
        self.s.settimeout(timeout)
        try:
            b0 = self._rd(2)
            if not b0:
                return None
            n = b0[1] & 0x7F
            if n == 126:
                n = struct.unpack("!H", self._rd(2))[0]
            elif n == 127:
                n = struct.unpack("!Q", self._rd(8))[0]
            data = self._rd(n) if n else b""
            return json.loads(data.decode("utf-8"))
        except Exception:
            return None

    def close(self):
        try:
            self.s.close()
        except Exception:
            pass


def http_info():
    try:
        s = socket.create_connection(("127.0.0.1", HTTP_PORT), timeout=3)
        s.sendall(b"GET /info HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n")
        buf = b""
        s.settimeout(3)
        while True:
            c = s.recv(4096)
            if not c:
                break
            buf += c
        s.close()
        body = buf.split(b"\r\n\r\n", 1)[1].decode("utf-8", "ignore")
        return json.loads(body)
    except Exception:
        return None


def main():
    env = dict(os.environ, BB_PORT=str(PORT), BB_HTTP_PORT=str(HTTP_PORT))
    # 默认测 Python 版；给 BB_SERVER_CMD 就能用同一套用例测 Node 版
    cmd = os.environ.get("BB_SERVER_CMD")
    if cmd:
        import shlex
        proc = subprocess.Popen(shlex.split(cmd), env=env, cwd=HERE)
    else:
        proc = subprocess.Popen([sys.executable, os.path.join(HERE, "server.py")], env=env)
    try:
        time.sleep(1.0)
        print("WebSocket 服务端冒烟测试（端口 %d）" % PORT)

        # 1) HTTP 状态页
        info = http_info()
        ok(info is not None, "HTTP /info 可访问", str(info))
        if info:
            ok(info.get("online") == 0, "初始在线人数为 0", "online=%s" % info.get("online"))
            ok(info.get("max", 0) > 0, "返回了人数上限", "max=%s" % info.get("max"))

        # 2) 握手
        a = WS()
        ok("101" in a.head, "WebSocket 握手返回 101", a.head.split("\r\n")[0])
        ok("Sec-WebSocket-Accept" in a.head, "返回了 Accept 头")

        # 3) join -> welcome
        a.send({"t": "join", "name": "甲"})
        w = a.recv(3.0)
        ok(w is not None and w.get("t") == "welcome", "join 后收到 welcome", str(w)[:80])
        ida = w.get("id") if w else None
        ok(bool(ida), "分配了玩家 id", str(ida))

        # 4) 第二人加入，互相能看见
        b = WS()
        b.send({"t": "join", "name": "乙"})
        wb = b.recv(3.0)
        ok(wb is not None and len(wb.get("players", [])) == 1,
           "第二人加入时能看到已在房间的人",
           "看到 %d 人" % (len(wb.get("players", [])) if wb else -1))
        idb = wb.get("id") if wb else None

        # 5) state 广播
        a.send({"t": "state", "x": 1.0, "y": 0.0, "z": 2.0, "yaw": 0.5, "pitch": 0.1,
                "hp": 100, "stance": "stand", "kills": 0, "deaths": 0})
        got = None
        for _ in range(30):
            m = b.recv(1.0)
            if m and m.get("t") == "state":
                got = m
                break
        ok(got is not None, "收到 state 广播")
        if got:
            ps = got.get("players", [])
            mine = [p for p in ps if p.get("id") == ida]
            ok(len(mine) == 1, "广播里包含对方", "%d 人" % len(ps))
            if mine:
                ok(abs(mine[0]["x"] - 1.0) < 0.01, "位置被正确同步", "x=%s" % mine[0]["x"])
                ok(mine[0].get("name") == "甲", "名字被正确同步", mine[0].get("name"))

        # 6) ping -> pong
        a.send({"t": "ping", "ts": 12345})
        pong = None
        for _ in range(10):
            m = a.recv(1.0)
            if m and m.get("t") == "pong":
                pong = m
                break
        ok(pong is not None and pong.get("ts") == 12345, "ping -> pong 往返正常", str(pong))

        # 7) hit 扣血 + kill 广播
        for dmg in (40, 40, 40):
            b.send({"t": "hit", "target": ida, "damage": dmg, "head": False})
            time.sleep(0.15)
        killmsg = None
        for _ in range(30):
            m = a.recv(1.0)
            if m and m.get("t") == "kill":
                killmsg = m
                break
        ok(killmsg is not None, "血量归零后广播 kill", str(killmsg)[:80])
        if killmsg:
            ok(killmsg.get("victim") == ida and killmsg.get("killer") == idb,
               "kill 里的凶手与受害者正确")

        # 7.5) ★ 皮肤转发：甲上传 -> 乙收到；丙中途进场 -> 能拉到
        SKIN = "data:image/jpeg;base64," + "A" * 3000
        a.send({"t": "skin", "data": SKIN})
        got_skin = None
        for _ in range(30):
            m = b.recv(1.0)
            if m and m.get("t") == "skin":
                got_skin = m
                break
        ok(got_skin is not None, "★ 甲上传皮肤后乙收到广播", str(got_skin)[:60])
        if got_skin:
            ok(got_skin.get("id") == ida, "★ 广播里带的是甲的 id", got_skin.get("id"))
            ok(got_skin.get("data") == SKIN, "★ 皮肤数据完整（未被截断）",
               "长度 %d" % len(got_skin.get("data") or ""))

        # 大包也要完整：验证服务端帧编码支持 >64KB
        BIG = "data:image/jpeg;base64," + "B" * 90000
        a.send({"t": "skin", "data": BIG})
        big_ok = False
        for _ in range(40):
            m = b.recv(1.5)
            if m and m.get("t") == "skin" and len(m.get("data") or "") == len(BIG):
                big_ok = True
                break
        ok(big_ok, "★ 大皮肤（90KB）也能完整转发（帧编码支持长负载）")

        # 超限应被拒绝
        HUGE = "data:image/jpeg;base64," + "C" * 200000
        a.send({"t": "skin", "data": HUGE})
        rejected = False
        for _ in range(20):
            m = a.recv(1.0)
            if m and m.get("t") == "error":
                rejected = True
                break
        ok(rejected, "★ 超大皮肤被拒绝（不会拖垮房间）")

        # 丙中途进场，主动拉甲的皮肤
        c = WS(port=PORT)
        c.send({"t": "join", "name": "丙"})
        wc = None
        for _ in range(30):
            m = c.recv(1.0)
            if m and m.get("t") == "welcome":
                wc = m
                break
        ok(wc is not None, "★ 丙成功加入")
        c.send({"t": "getskin", "id": ida})
        pulled = None
        for _ in range(30):
            m = c.recv(1.0)
            if m and m.get("t") == "skin" and m.get("id") == ida:
                pulled = m
                break
        ok(pulled is not None, "★ 丙能主动拉取甲的皮肤", str(pulled)[:60])
        if pulled:
            # 最后成功设置的是 BIG（HUGE 被拒），所以拉到的应是 BIG
            ok(len(pulled.get("data") or "") == len(BIG),
               "★ 拉到的是最新一份皮肤", "长度 %d" % len(pulled.get("data") or ""))

        # 查询不存在的玩家：不应崩溃，也不应回消息
        c.send({"t": "getskin", "id": "不存在的人"})
        time.sleep(0.3)
        c.close()
        time.sleep(0.3)

        # 8) 在线人数
        info2 = http_info()
        ok(info2 is not None and info2.get("online") == 2,
           "HTTP /info 显示在线 2 人", str(info2))

        # 9) 断开后人数下降
        b.close()
        time.sleep(0.6)
        info3 = http_info()
        ok(info3 is not None and info3.get("online") == 1,
           "断开后在线人数下降", str(info3))

        print()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

    print("结果：%d 项通过，%d 项失败" % (ok_count, fail_count))
    return 1 if fail_count else 0


if __name__ == "__main__":
    sys.exit(main())

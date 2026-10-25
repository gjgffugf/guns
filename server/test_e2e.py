#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
端到端联机验证：真起两个客户端，走完整流程。

覆盖上一版漏掉的东西：
  - 服务端启动时会打印局域网地址（地址填错是最常见连不上原因）
  - welcome 不含自己
  - 状态页 online 与实际连接数一致
  - 断开后对方能收到离开
"""
import json
import os
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("BB_TEST_PORT", "19650"))
HTTP_PORT = PORT + 1
okc = 0
failc = 0


def ok(cond, msg, detail=""):
    global okc, failc
    if cond:
        okc += 1
        print("  ok   %s  %s" % (msg, detail))
    else:
        failc += 1
        print("  FAIL %s  %s" % (msg, detail))


def info():
    try:
        s = socket.create_connection(("127.0.0.1", HTTP_PORT), timeout=3)
        s.sendall(b"GET /info HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n")
        buf = b""
        s.settimeout(3)
        try:
            while True:
                c = s.recv(4096)
                if not c:
                    break
                buf += c
        except Exception:
            pass
        s.close()
        return json.loads(buf.split(b"\r\n\r\n", 1)[1].decode("utf-8", "ignore"))
    except Exception:
        return None


def run(cmd):
    env = dict(os.environ, BB_PORT=str(PORT), BB_HTTP_PORT=str(HTTP_PORT))
    proc = subprocess.Popen(cmd, env=env, cwd=HERE,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True)
    return proc


def main():
    print("端到端联机验证（端口 %d）" % PORT)
    proc = run([sys.executable, os.path.join(HERE, "server.py")])
    try:
        time.sleep(1.2)
        # 读启动日志
        lines = []
        try:
            os.set_blocking(proc.stdout.fileno(), False)
            time.sleep(0.2)
            lines = (proc.stdout.read() or "").splitlines()
        except Exception:
            pass

        joined = "\n".join(lines)
        ok("客户端地址填" in joined, "★ 启动日志给出了可填的客户端地址",
           [l for l in lines if "客户端地址填" in l])
        ok("127.0.0.1:%d" % PORT in joined, "★ 日志提示了本机自测地址", "")

        # 用真实 WS 客户端验证 welcome 不含自己
        sys.path.insert(0, HERE)
        from test_ws import WS
        a = WS(port=PORT)
        a.send({"t": "join", "name": "甲"})
        w = a.recv(3.0)
        ok(w is not None and w.get("players") == [],
           "★ welcome 不含自己", str(w)[:70])

        b = WS(port=PORT)
        b.send({"t": "join", "name": "乙"})
        wb = b.recv(3.0)
        ok(wb is not None and len(wb.get("players", [])) == 1,
           "★ 第二人能看到第一人",
           "%d 人" % (len(wb.get("players", [])) if wb else -1))

        inf = info()
        ok(inf is not None and inf.get("online") == 2,
           "★ 状态页人数与实际一致", str(inf))

        # 甲断开，乙应看到甲消失
        a.close()
        time.sleep(0.4)
        seen = set()
        for _ in range(30):
            m = b.recv(1.0)
            if m and m.get("t") == "state":
                seen = {p["id"] for p in m.get("players", [])}
                if len(m.get("players", [])) == 1:
                    break
        ok(len(seen) == 1, "★ 甲断开后乙的快照里只剩自己", "%d 人" % len(seen))
        b.close()
        print()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

    print("结果：%d 项通过，%d 项失败" % (okc, failc))
    return 1 if failc else 0


if __name__ == "__main__":
    sys.exit(main())

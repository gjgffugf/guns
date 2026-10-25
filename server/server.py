#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
破绷战场 —— 联机服务器（Python 版，零依赖，纯标准库）

    python3 server.py

★ 为什么要有 Python 版：
  Termux 里 Node.js 是二进制包，而你要求"不运行二进制文件"。
  python3 是 Termux 自带的基础包，pip 什么都不用装，直接跑。

★ 为什么不只用 UDP：
  浏览器 / WebView 里发不出 UDP 包，只能走 WebSocket。
  所以服务端同时监听：
      UDP 19000   原生客户端 / 调试用
      TCP 19000   WebSocket（网页与 APK 客户端走这条）
      TCP 19001   HTTP 状态页，返回 /info（在线人数、上限）
  UDP 和 TCP 可以共用同一个端口号 —— 协议不同，互不冲突。

★ 服务端没有任何 AI / 陪练机器人。
"""

import base64
import hashlib
import json
import os
import socket
import struct
import threading
import time
import random

PORT = int(os.environ.get("BB_PORT", "19000"))
HTTP_PORT = int(os.environ.get("BB_HTTP_PORT", str(PORT + 1)))
MAX_PLAYERS = int(os.environ.get("BB_MAX", "16"))
TICK = 1.0 / 20                 # 20Hz 广播
TIMEOUT = 15.0                  # 15 秒无消息踢出
SERVER_NAME = os.environ.get("BB_NAME", "破绷战场")

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

_lock = threading.Lock()
players = {}                    # id -> dict
_seq = [0]


# ---------------- 房间逻辑 ----------------

def new_id():
    return "%08x" % random.getrandbits(32)


def snapshot():
    out = []
    for p in players.values():
        out.append({
            "id": p["id"], "name": p["name"],
            "x": round(p["x"], 3), "y": round(p["y"], 3), "z": round(p["z"], 3),
            "yaw": round(p["yaw"], 3), "pitch": round(p["pitch"], 3),
            "hp": p["hp"], "stance": p["stance"],
            "kills": p["kills"], "deaths": p["deaths"],
        })
    return out


def state_msg():
    _seq[0] += 1
    return {"t": "state", "seq": _seq[0], "players": snapshot()}


def send_json(conn, obj):
    """向一个 WebSocket 连接发一帧文本"""
    try:
        conn.sendall(encode_frame(json.dumps(obj, separators=(",", ":"))))
    except Exception:
        pass


def broadcast():
    """给所有在线玩家发快照"""
    if not players:
        return
    msg = state_msg()
    raw = json.dumps(msg, separators=(",", ":")).encode("utf-8")
    frame = encode_frame_raw(raw)
    with _lock:
        for p in list(players.values()):
            if p.get("kind") == "ws" and p.get("conn"):
                try:
                    p["conn"].sendall(frame)
                except Exception:
                    pass
            elif p.get("kind") == "udp" and p.get("addr"):
                try:
                    udp_sock.sendto(raw, p["addr"])
                except Exception:
                    pass


def handle_join(p, msg, out):
    p["name"] = (msg.get("name") or "玩家")[:16]
    # ★ welcome 里不包自己：否则客户端会把自己的模型也画一份出来。
    #   （客户端也做了 id 过滤，但服务端直接不给最干净。）
    others = [x for x in snapshot() if x["id"] != p["id"]]
    welcome = {"t": "welcome", "id": p["id"], "players": others, "max": MAX_PLAYERS}
    out.append((None, welcome))          # None = 只发给本人
    print("[+] %s 加入（%s），当前 %d 人" % (p["name"], p["kind"], len(players)))


def handle_hit(src, msg, out):
    """命中上报：服务端扣血并广播，避免客户端乱报"""
    target = msg.get("target")
    dmg = float(msg.get("damage") or 0)
    head = bool(msg.get("head"))
    if dmg <= 0 or dmg > 200:
        return
    tgt = players.get(target)
    if not tgt or tgt["hp"] <= 0:
        return
    tgt["hp"] = max(0, tgt["hp"] - int(dmg))

    # 告诉被打的人：你掉了多少血
    out.append((target, {"t": "hit", "from": src["id"], "damage": int(dmg), "head": head}))

    if tgt["hp"] <= 0:
        tgt["deaths"] += 1
        src["kills"] += 1
        kill = {"t": "kill", "killer": src["id"], "victim": target}
        for pid in players:
            out.append((pid, kill))
        print("[kill] %s -> %s" % (src["name"], tgt["name"]))


def process(p, msg):
    """
    处理一条客户端消息。
    返回 [(目标id或None表示全体, 消息)] —— 由调用方分发。
    """
    out = []            # [(target_id, msg)]，target_id=None 表示只回给自己
    t = msg.get("t")
    if t == "join":
        handle_join(p, msg, out)
    elif t == "state":
        for k in ("x", "y", "z", "yaw", "pitch"):
            if k in msg:
                try:
                    p[k] = float(msg[k])
                except (TypeError, ValueError):
                    pass
        try:
            p["hp"] = int(msg.get("hp", p["hp"]))
        except (TypeError, ValueError):
            pass
        if msg.get("stance") in ("stand", "crouch", "prone"):
            p["stance"] = msg["stance"]
        p["kills"] = int(msg.get("kills") or 0)
        p["deaths"] = int(msg.get("deaths") or 0)
    elif t == "ping":
        out.append((None, {"t": "pong", "ts": msg.get("ts", 0)}))
    elif t == "hit":
        handle_hit(p, msg, out)
    elif t == "leave":
        p["dead"] = True
    return out


def dispatch(src, items):
    """items: [(目标id, 消息)]，目标 id 为 None 表示只回给自己"""
    for tid, m in items:
        if tid is None:
            tid = src["id"]
        tgt = players.get(tid)
        if not tgt:
            continue
        if tgt.get("kind") == "ws" and tgt.get("conn"):
            send_json(tgt["conn"], m)
        elif tgt.get("kind") == "udp" and tgt.get("addr"):
            try:
                udp_sock.sendto(json.dumps(m, separators=(",", ":")).encode("utf-8"), tgt["addr"])
            except Exception:
                pass


# ---------------- WebSocket 帧编解码 ----------------

def encode_frame(text):
    return encode_frame_raw(text.encode("utf-8"))


def encode_frame_raw(raw):
    n = len(raw)
    head = bytearray([0x81])            # FIN + text
    if n < 126:
        head.append(n)
    elif n < 65536:
        head.append(126)
        head += struct.pack("!H", n)
    else:
        head.append(127)
        head += struct.pack("!Q", n)
    return bytes(head) + raw


def recv_frame(conn):
    """读一帧，返回 (opcode, payload_bytes)；连接关闭返回 (None, b'')"""
    def rd(n):
        buf = b""
        while len(buf) < n:
            chunk = conn.recv(n - len(buf))
            if not chunk:
                return None
            buf += chunk
        return buf

    b0 = rd(2)
    if not b0:
        return (None, b"")
    fin_op = b0[0]
    opcode = fin_op & 0x0F
    masked = (b0[1] & 0x80) != 0
    n = b0[1] & 0x7F
    if n == 126:
        ext = rd(2)
        if ext is None:
            return (None, b"")
        n = struct.unpack("!H", ext)[0]
    elif n == 127:
        ext = rd(8)
        if ext is None:
            return (None, b"")
        n = struct.unpack("!Q", ext)[0]

    mask = rd(4) if masked else b""
    if mask is None:
        return (None, b"")
    data = rd(n) if n else b""
    if data is None:
        return (None, b"")

    if masked:
        data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))

    if opcode == 0x8:                   # close
        return (None, b"")
    if opcode == 0x9:                   # ping -> pong
        try:
            conn.sendall(bytes([0x8A]) + encode_frame_raw(data)[1:])
        except Exception:
            pass
        return (0x9, b"")
    return (opcode, data)


def ws_handshake(conn):
    """读 HTTP 升级请求，返回 True 表示握手成功"""
    buf = b""
    while b"\r\n\r\n" not in buf:
        try:
            chunk = conn.recv(4096)
        except Exception:
            return False
        if not chunk:
            return False
        buf += chunk
        if len(buf) > 8192:
            return False
    try:
        head = buf.decode("utf-8", "ignore")
    except Exception:
        return False
    key = ""
    for line in head.split("\r\n"):
        if line.lower().startswith("sec-websocket-key:"):
            key = line.split(":", 1)[1].strip()
    if not key:
        return False
    accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
    resp = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Accept: %s\r\n\r\n" % accept
    )
    try:
        conn.sendall(resp.encode("utf-8"))
    except Exception:
        return False
    return True


# ---------------- WebSocket 连接线程 ----------------

def ws_thread(conn, addr):
    if not ws_handshake(conn):
        try:
            conn.close()
        except Exception:
            pass
        return

    pid = new_id()
    with _lock:
        players[pid] = {
            "id": pid, "name": "玩家", "kind": "ws", "conn": conn, "addr": addr,
            "x": 0.0, "y": 0.0, "z": 0.0, "yaw": 0.0, "pitch": 0.0,
            "hp": 100, "stance": "stand", "kills": 0, "deaths": 0,
            "last": time.time(), "dead": False,
        }
        p = players[pid]

    try:
        while True:
            op, data = recv_frame(conn)
            if op is None:
                break
            if op != 0x1 or not data:
                continue
            try:
                msg = json.loads(data.decode("utf-8"))
            except Exception:
                continue
            p["last"] = time.time()
            dispatch(p, process(p, msg))
            if p.get("dead"):
                break
    except Exception as e:
        print("[ws] 连接异常：%r" % (e,))
    finally:
        with _lock:
            players.pop(pid, None)
        try:
            conn.close()
        except Exception:
            pass
        print("[-] %s 离开（ws），当前 %d 人" % (p.get("name", "?"), len(players)))


def ws_server():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", PORT))
    srv.listen(64)
    print("WebSocket 监听 tcp://0.0.0.0:%d" % PORT, flush=True)
    while True:
        try:
            conn, addr = srv.accept()
        except Exception:
            continue
        if len(players) >= MAX_PLAYERS:
            try:
                conn.close()
            except Exception:
                pass
            continue
        threading.Thread(target=ws_thread, args=(conn, addr), daemon=True).start()


# ---------------- UDP ----------------

udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
udp_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)


def udp_server():
    udp_sock.bind(("0.0.0.0", PORT))
    print("UDP 监听 udp://0.0.0.0:%d" % PORT, flush=True)
    while True:
        try:
            raw, addr = udp_sock.recvfrom(65535)
        except Exception:
            continue
        try:
            msg = json.loads(raw.decode("utf-8"))
        except Exception:
            continue

        pid = msg.get("id") or ("%s:%d" % addr)
        with _lock:
            p = players.get(pid)
            if p is None:
                if len(players) >= MAX_PLAYERS:
                    continue
                p = {
                    "id": pid, "name": "玩家", "kind": "udp", "conn": None, "addr": addr,
                    "x": 0.0, "y": 0.0, "z": 0.0, "yaw": 0.0, "pitch": 0.0,
                    "hp": 100, "stance": "stand", "kills": 0, "deaths": 0,
                    "last": time.time(), "dead": False,
                }
                players[pid] = p
            p["addr"] = addr
            p["last"] = time.time()
        dispatch(p, process(p, msg))


# ---------------- HTTP 状态页 ----------------

def http_server():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        srv.bind(("0.0.0.0", HTTP_PORT))
    except OSError as e:
        print("HTTP 状态页启动失败：%s" % e)
        return
    srv.listen(16)
    print("HTTP 状态页 http://0.0.0.0:%d/info" % HTTP_PORT, flush=True)
    while True:
        try:
            conn, _ = srv.accept()
        except Exception:
            continue
        threading.Thread(target=http_thread, args=(conn,), daemon=True).start()


def http_thread(conn):
    try:
        conn.settimeout(3)
        req = conn.recv(4096).decode("utf-8", "ignore")
        path = "/"
        if req:
            parts = req.split(" ")
            if len(parts) > 1:
                path = parts[1]
        if path.startswith("/info"):
            body = json.dumps({
                "name": SERVER_NAME, "online": len(players), "max": MAX_PLAYERS,
                "version": "0.2.4", "map": "arena",
            }).encode("utf-8")
            head = (
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: application/json; charset=utf-8\r\n"
                "Content-Length: %d\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Connection: close\r\n\r\n" % len(body)
            )
            conn.sendall(head.encode("utf-8") + body)
        else:
            body = ("<html><body><h3>%s</h3><p>在线 %d / %d</p>"
                    "<p>WebSocket: ws://HOST:%d</p></body></html>"
                    % (SERVER_NAME, len(players), MAX_PLAYERS, PORT)).encode("utf-8")
            head = ("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n"
                    "Content-Length: %d\r\nConnection: close\r\n\r\n" % len(body))
            conn.sendall(head.encode("utf-8") + body)
    except Exception:
        pass
    finally:
        try:
            conn.close()
        except Exception:
            pass


# ---------------- 广播 + 超时清理 ----------------

def ticker():
    while True:
        time.sleep(TICK)
        try:
            broadcast()
            now = time.time()
            with _lock:
                for pid in [k for k, v in players.items() if now - v["last"] > TIMEOUT]:
                    print("[-] %s 超时离开" % players[pid].get("name", "?"))
                    players.pop(pid, None)
        except Exception as e:
            print("[ticker] %s" % e)


def lan_ips():
    """列出本机局域网 IP —— 玩家要填的就是这个，不是 127.0.0.1。

    ★ 最常见的连不上原因其实是【地址填错】：
      在手机上开服、用另一台设备连，却填了 127.0.0.1 或 localhost，
      那指向的是设备自己。所以启动时直接把可用地址打印出来。
    """
    out = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))          # 不会真的发包，只用来选出网网卡
        out.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        out.append(socket.gethostbyname(socket.gethostname()))
    except Exception:
        pass
    # 去重并保持顺序
    seen = set()
    return [x for x in out if not (x in seen or seen.add(x))]


def main():
    # ★ 加 flush=True：stdout 被重定向到文件或管道时 Python 会缓冲，
    #   不刷新的话"地址填什么"这行关键信息要等很久才出现。
    print("破绷战场 服务器启动", flush=True)
    print("  名称：%s    最大人数：%d" % (SERVER_NAME, MAX_PLAYERS), flush=True)
    ips = lan_ips()
    if ips:
        print("  客户端地址填：" + " 或 ".join("%s:%d" % (i, PORT) for i in ips), flush=True)
    print("  本机自测可填：127.0.0.1:%d" % PORT, flush=True)
    print("  端口：WS/UDP %d，状态页 %d" % (PORT, HTTP_PORT), flush=True)
    for t, args in ((udp_server, ()), (ws_server, ()), (http_server, ()), (ticker, ())):
        threading.Thread(target=t, args=args, daemon=True).start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()

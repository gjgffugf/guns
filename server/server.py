#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
破绷战场 (BreakBind Battlefield) - 联机服务器
包名: xfan.games.gun

纯 Python 3 标准库实现，不含任何二进制依赖：
  - 电脑：python3 server.py
  - 手机：Termux 里 python3 server.py（无需 root、无需编译）

协议：UDP + JSON（与 scripts/NetworkManager.gd 配套）
  客户端 -> 服务器：
    {"t":"join","n":"昵称"}                      加入战场
    {"t":"inp","p":[x,y,z],"y":yaw,"pi":pitch,   状态上报（20Hz）
       "hp":100,"st":0,"mv":1,"sh":0}
    {"t":"shot","o":[x,y,z],"d":[dx,dy,dz]}      开枪（仅用于表现）
    {"t":"hit","tg":2,"dmg":25}                  命中上报，由服务器仲裁扣血
    {"t":"ping","ts":123456}                     心跳
    {"t":"bye"}                                  离开

  服务器 -> 客户端：
    {"t":"welcome","id":1}                       分配 id
    {"t":"snap","p":[{...}, ...]}                20Hz 全场快照
    {"t":"shot","id":1,"o":[...],"d":[...]}      他人开枪
    {"t":"hit","from":1,"to":2,"dmg":25}         命中广播
    {"t":"pong","ts":123456}                     心跳回包
    {"t":"evt","k":"kill"/"join"/"leave","n":名字,"a":击杀者,"b":被杀者}
"""

import argparse
import json
import os
import socket
import sys
import threading
import time
from typing import Dict, Optional, Tuple

MAX_PACKET = 4096
MAX_HP = 100.0
RESPAWN_DELAY = 3.0
TIMEOUT = 8.0


def now_ms() -> int:
    return int(time.time() * 1000)


def log(msg: str) -> None:
    stamp = time.strftime("%H:%M:%S")
    print("[%s] %s" % (stamp, msg), flush=True)


class Player:
    __slots__ = ("pid", "addr", "name", "pos", "yaw", "pitch", "hp",
                 "stance", "moving", "shooting", "last_seen", "dead_at", "seq")

    def __init__(self, pid: int, addr: Tuple[str, int], name: str):
        self.pid = pid
        self.addr = addr
        self.name = (name or "玩家")[:16]
        self.pos = [0.0, 1.0, 0.0]
        self.yaw = 0.0
        self.pitch = 0.0
        self.hp = MAX_HP
        self.stance = 0
        self.moving = 0
        self.shooting = False
        self.last_seen = time.time()
        self.dead_at = 0.0
        self.seq = 0

    def snapshot(self) -> dict:
        return {
            "id": self.pid,
            "n": self.name,
            "p": [round(self.pos[0], 2), round(self.pos[1], 2), round(self.pos[2], 2)],
            "y": round(self.yaw, 3),
            "pi": round(self.pitch, 3),
            "hp": int(self.hp),
            "st": self.stance,
            "mv": self.moving,
            "sh": self.shooting,
        }


class Server:
    def __init__(self, host: str, port: int, tick: int, max_players: int, verbose: bool):
        self.host = host
        self.port = port
        self.tick = max(1, min(60, tick))
        self.max_players = max(1, max_players)
        self.verbose = verbose
        self.players: Dict[int, Player] = {}
        self.by_addr: Dict[Tuple[str, int], int] = {}
        self._next_id = 1
        self._lock = threading.RLock()
        self.running = True

        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            self.sock.bind((host, port))
        except OSError as e:
            log("绑定 %s:%d 失败：%s" % (host, port, e))
            sys.exit(1)

    # ------------------------------------------------------------------ 发送
    def send(self, addr: Tuple[str, int], obj: dict) -> None:
        try:
            self.sock.sendto(json.dumps(obj, separators=(",", ":")).encode("utf-8"), addr)
        except OSError:
            pass

    def broadcast(self, obj: dict, exclude: Optional[int] = None) -> None:
        data = json.dumps(obj, separators=(",", ":")).encode("utf-8")
        with self._lock:
            targets = [p.addr for p in self.players.values() if p.pid != exclude]
        for a in targets:
            try:
                self.sock.sendto(data, a)
            except OSError:
                pass

    # ------------------------------------------------------------------ 主循环
    def serve(self) -> None:
        log("破绷战场服务器已启动：%s:%d" % (self.host, self.port))
        log("广播频率 %dHz，最大人数 %d" % (self.tick, self.max_players))
        log("等待玩家接入 ...（Ctrl+C 停止）")
        t = threading.Thread(target=self._snapshot_loop, daemon=True)
        t.start()
        while self.running:
            try:
                data, addr = self.sock.recvfrom(MAX_PACKET)
            except OSError:
                break
            try:
                msg = json.loads(data.decode("utf-8", "ignore"))
            except (ValueError, UnicodeDecodeError):
                continue
            if isinstance(msg, dict):
                self._handle(msg, addr)

    def _snapshot_loop(self) -> None:
        interval = 1.0 / float(self.tick)
        while self.running:
            time.sleep(interval)
            try:
                self._tick_update()
            except Exception as e:  # 不让广播线程崩掉
                log("广播异常: %s" % e)

    def _tick_update(self) -> None:
        now = time.time()
        with self._lock:
            # 超时清理
            gone = [p for p in self.players.values() if now - p.last_seen > TIMEOUT]
            for p in gone:
                self.players.pop(p.pid, None)
                self.by_addr.pop(p.addr, None)
                log("%s(%d) 超时离开" % (p.name, p.pid))
                self.broadcast({"t": "evt", "k": "leave", "n": p.name, "id": p.pid})
            # 死亡重生
            for p in self.players.values():
                if p.hp <= 0 and p.dead_at > 0 and now - p.dead_at >= RESPAWN_DELAY:
                    p.hp = MAX_HP
                    p.dead_at = 0.0
                    self.broadcast({"t": "evt", "k": "respawn", "id": p.pid, "n": p.name})
            if not self.players:
                return
            snap = {"t": "snap", "p": [p.snapshot() for p in self.players.values()]}
        self.broadcast(snap)

    # ------------------------------------------------------------------ 消息
    def _handle(self, msg: dict, addr: Tuple[str, int]) -> None:
        t = msg.get("t")
        pid = self.by_addr.get(addr)

        # 服务器列表查询：无需加入即可拿到延迟与在线人数
        if t == "query":
            with self._lock:
                online = len(self.players)
            self.send(addr, {"t": "status", "ts": msg.get("ts", 0),
                             "online": online, "max": self.max_players,
                             "tick": self.tick})
            return

        if t == "join":
            self._on_join(msg, addr)
            return
        if pid is None:
            # 未注册的一律要求先 join
            self.send(addr, {"t": "evt", "k": "need_join"})
            return

        with self._lock:
            p = self.players.get(pid)
            if p is None:
                self.by_addr.pop(addr, None)
                return
            p.last_seen = time.time()

            if t == "inp":
                self._on_input(p, msg)
            elif t == "shot":
                self.broadcast({"t": "shot", "id": p.pid,
                                "o": self._v3(msg.get("o")),
                                "d": self._v3(msg.get("d"))}, exclude=p.pid)
            elif t == "hit":
                self._on_hit(p, msg)
            elif t == "ping":
                self.send(addr, {"t": "pong", "ts": msg.get("ts", 0)})
            elif t == "bye":
                self.players.pop(pid, None)
                self.by_addr.pop(addr, None)
                log("%s(%d) 离开战场" % (p.name, p.pid))
                self.broadcast({"t": "evt", "k": "leave", "n": p.name, "id": p.pid})

    def _on_join(self, msg: dict, addr: Tuple[str, int]) -> None:
        with self._lock:
            pid = self.by_addr.get(addr)
            if pid is not None and pid in self.players:
                self.send(addr, {"t": "welcome", "id": pid})
                return
            if len(self.players) >= self.max_players:
                self.send(addr, {"t": "evt", "k": "full"})
                log("拒绝 %s：服务器已满" % addr)
                return
            pid = self._next_id
            self._next_id += 1
            name = str(msg.get("n", "玩家"))[:16] or "玩家"
            p = Player(pid, addr, name)
            p.pos = self._spawn_point()
            self.players[pid] = p
            self.by_addr[addr] = pid
            log("%s(%d) 加入战场  来源 %s:%d  在线 %d 人"
                % (name, pid, addr[0], addr[1], len(self.players)))
            self.send(addr, {"t": "welcome", "id": pid})
            self.broadcast({"t": "evt", "k": "join", "n": name, "id": pid}, exclude=pid)

    def _on_input(self, p: Player, msg: dict) -> None:
        pos = msg.get("p")
        if isinstance(pos, list) and len(pos) == 3:
            try:
                p.pos = [float(pos[0]), float(pos[1]), float(pos[2])]
            except (TypeError, ValueError):
                pass
        p.yaw = self._f(msg.get("y"), p.yaw)
        p.pitch = self._f(msg.get("pi"), p.pitch)
        p.stance = int(self._f(msg.get("st"), p.stance))
        p.moving = int(self._f(msg.get("mv"), 0))
        p.shooting = bool(msg.get("sh", 0))
        hp = self._f(msg.get("hp"), p.hp)
        # 客户端是血量权威（本地判定），但服务器做上限保护与广播
        p.hp = max(0.0, min(MAX_HP, hp))
        if p.hp <= 0 and p.dead_at == 0.0:
            p.dead_at = time.time()

    def _on_hit(self, p: Player, msg: dict) -> None:
        try:
            target_id = int(msg.get("tg", -1))
            dmg = abs(float(msg.get("dmg", 0.0)))
        except (TypeError, ValueError):
            return
        if dmg <= 0 or dmg > 200:
            return
        tgt = self.players.get(target_id)
        if tgt is None or tgt.pid == p.pid:
            return
        if tgt.hp <= 0:
            return
        tgt.hp = max(0.0, tgt.hp - dmg)
        self.broadcast({"t": "hit", "from": p.pid, "to": tgt.pid, "dmg": int(dmg)})
        if self.verbose:
            log("%s -> %s  %d 伤害 (剩 %d)" % (p.name, tgt.name, int(dmg), int(tgt.hp)))
        if tgt.hp <= 0:
            tgt.dead_at = time.time()
            log("%s 击倒 %s" % (p.name, tgt.name))
            self.broadcast({"t": "evt", "k": "kill", "a": p.pid, "b": tgt.pid,
                            "n": tgt.name})

    # ------------------------------------------------------------------ 工具
    @staticmethod
    def _f(v, default: float) -> float:
        try:
            return float(v)
        except (TypeError, ValueError):
            return float(default)

    @staticmethod
    def _v3(v) -> list:
        if isinstance(v, list) and len(v) == 3:
            try:
                return [round(float(v[0]), 2), round(float(v[1]), 2), round(float(v[2]), 2)]
            except (TypeError, ValueError):
                pass
        return [0.0, 0.0, 0.0]

    def _spawn_point(self) -> list:
        pts = [[0, 2, 22], [-20, 2, -18], [20, 2, -18],
               [-22, 2, 14], [24, 2, 16], [0, 2, -24]]
        n = len(self.players)
        return list(pts[n % len(pts)])

    def local_ips(self) -> list:
        ips = []
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ips.append(s.getsockname()[0])
            s.close()
        except OSError:
            pass
        try:
            ips.append(socket.gethostbyname(socket.gethostname()))
        except OSError:
            pass
        seen = []
        for i in ips:
            if i and i not in seen:
                seen.append(i)
        if not seen:
            seen.append("127.0.0.1")
        return seen

    def stop(self) -> None:
        self.running = False
        try:
            self.sock.close()
        except OSError:
            pass


def main() -> None:
    ap = argparse.ArgumentParser(description="破绷战场 联机服务器")
    ap.add_argument("--host", default="0.0.0.0", help="监听地址，默认 0.0.0.0")
    ap.add_argument("-p", "--port", type=int, default=19000, help="UDP 端口，默认 19000")
    ap.add_argument("--tick", type=int, default=20, help="快照广播频率 Hz，默认 20")
    ap.add_argument("--max-players", type=int, default=16, help="最大人数，默认 16")
    ap.add_argument("-v", "--verbose", action="store_true", help="打印每一次命中")
    args = ap.parse_args()

    srv = Server(args.host, args.port, args.tick, args.max_players, args.verbose)
    for ip in srv.local_ips():
        log("客户端可填写的服务器地址：%s" % ip)

    def bye(_sig=None, _frm=None):
        log("服务器已停止")
        srv.stop()
        os._exit(0)

    try:
        import signal
        signal.signal(signal.SIGINT, bye)
        signal.signal(signal.SIGTERM, bye)
    except Exception:
        pass

    try:
        srv.serve()
    except KeyboardInterrupt:
        bye()


if __name__ == "__main__":
    main()

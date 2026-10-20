# 联机服务器使用说明

`server.py` 是**纯 Python 3 标准库**脚本，不含任何二进制依赖，
电脑与手机（Termux）都能直接 `python3` 运行，无需编译、无需 root。

---

## 一、电脑开服

```bash
cd server
python3 server.py
```

默认监听 `0.0.0.0:19000`。启动后会打印本机局域网 IP：

```
[19:20:11] 客户端可填写的服务器地址：192.168.1.23
[19:20:11] 破绷战场服务器已启动：0.0.0.0:19000
[19:20:11] 广播频率 20Hz，最大人数 16
[19:20:11] 等待玩家接入 ...（Ctrl+C 停止）
```

手机端：打开 App → 多人模式 → 服务器地址填 `192.168.1.23`，端口 `19000` → 连接。

### 常用参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--host` | `0.0.0.0` | 监听地址 |
| `-p` / `--port` | `19000` | UDP 端口 |
| `--tick` | `20` | 快照广播频率（Hz），最大 60 |
| `--max-players` | `16` | 最大人数 |
| `-v` | 关 | 打印每一次命中详情 |

```bash
python3 server.py --port 20000 --tick 30 --max-players 8 -v
```

---

## 二、手机 Termux 开服

### 1. 安装

```bash
pkg update && pkg upgrade -y
pkg install python -y
```

### 2. 拿到脚本

```bash
# 方式 A：直接克隆仓库
pkg install git -y
git clone <你的仓库地址> && cd breakbind-battlefield/server

# 方式 B：把 server.py 传到手机，放到任意目录
```

### 3. 启动

```bash
cd <server.py 所在目录>
python3 server.py --port 19000
```

### 4. 保持后台运行

```bash
termux-wake-lock                     # 防止系统休眠断线
nohup python3 server.py --port 19000 > server.log 2>&1 &
tail -f server.log                   # 看日志
```

停止服务：

```bash
pkill -f server.py
termux-wake-unlock
```

> **关于通知栏**：Termux 常驻建议开启「后台运行」权限，
> 否则系统可能在几分钟后回收进程导致断线。

---

## 三、网络与端口

- **同一局域网**：手机开服后，其他设备填手机 IP 即可直连（最简单）。
- **跨网络（外网）**：UDP 需要端口转发
  - 路由器里把外网 UDP `19000` 转发到开服设备的局域网 IP
  - 不知道公网 IP 或没有公网地址时，推荐用 **ZeroTier / Tailscale**
    组一个虚拟局域网，大家填虚拟网 IP 就能连，不用折腾路由器。
- **防火墙**：确认开服设备的防火墙放行了对应 UDP 端口。

---

## 四、协议（供二次开发参考）

UDP + JSON，与 `scripts/NetworkManager.gd` 配套。

客户端 → 服务器：

| 消息 | 说明 |
|---|---|
| `{"t":"join","n":"昵称"}` | 加入战场 |
| `{"t":"inp","p":[x,y,z],"y":yaw,"pi":pitch,"hp":100,"st":0,"mv":1,"sh":0}` | 20Hz 状态上报 |
| `{"t":"shot","o":[x,y,z],"d":[dx,dy,dz]}` | 开枪（只做表现同步） |
| `{"t":"hit","tg":2,"dmg":25}` | 命中上报，服务器仲裁扣血 |
| `{"t":"ping","ts":毫秒}` | 心跳 |
| `{"t":"bye"}` | 离开 |

服务器 → 客户端：

| 消息 | 说明 |
|---|---|
| `{"t":"welcome","id":1}` | 分配玩家 id |
| `{"t":"snap","p":[{...}]}` | 20Hz 全场快照，客户端插值渲染 |
| `{"t":"shot","id":1,"o":[...],"d":[...]}` | 他人开枪 |
| `{"t":"hit","from":1,"to":2,"dmg":25}` | 命中广播 |
| `{"t":"pong","ts":毫秒}` | 心跳回包 |
| `{"t":"evt","k":"kill"/"join"/"leave"/"respawn",...}` | 事件 |

关键规则：

- 玩家 8 秒无上报自动踢出
- 血量归零后广播 `kill`，3 秒后服务器自动复活（广播 `respawn`）
- 伤害上限 200，防止异常包

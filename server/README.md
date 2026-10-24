# 联机服务器

纯 Node.js，零第三方依赖，不含任何 AI / 陪练机器人。

## 运行

```bash
node server.js
# 自定义端口
BB_PORT=20000 node server.js
```

默认 UDP 端口 **19000**，HTTP 状态页 **19001**。

## 手机 Termux 开服

```bash
pkg install nodejs
cd server
node server.js
```

后台常驻：

```bash
nohup node server.js > server.log 2>&1 &
```

查看状态页（同 WiFi 下用电脑浏览器打开手机 IP）：

```
http://手机IP:19001/
```

## 关于免费部署

服务器用 UDP，而绝大多数免费 PaaS（Railway / Render / Koyeb 免费档）
只放行 HTTP 入站，**UDP 不通**，所以放不了。

可行的免费方案：

| 平台 | 说明 |
|---|---|
| **Oracle Cloud 永久免费 ARM** | 就是一台真 VPS，长期免费，UDP 完全可用（推荐） |
| Fly.io | 需在 `fly.toml` 里显式声明 UDP 端口 |
| 自己的电脑 / Termux | 做内网联机足够 |

## 协议

客户端 -> 服务端：

| 类型 | 字段 | 说明 |
|---|---|---|
| `join` | id, name, x,y,z, yaw, pitch, stance | 加入房间 |
| `state` | id, x,y,z, yaw, pitch, stance | 上报自身状态（20Hz） |
| `hit` | id, target, dmg, hp | 命中上报 |
| `ping` | ts | 测延迟 |
| `query` | ts | 查询服务器信息 |
| `leave` | id | 离开 |

服务端 -> 客户端：

| 类型 | 说明 |
|---|---|
| `welcome` | 加入成功，含 tick 与人数上限 |
| `state` | 全场玩家快照 |
| `pong` | 心跳回应（含原 ts，用于算延迟） |
| `info` | 服务器信息（人数 / 上限 / 地图） |
| `hit` | 你被命中 |
| `needjoin` | 需要重新加入 |
| `reject` | 房间已满 |

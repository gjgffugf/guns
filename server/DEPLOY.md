# 服务器部署指南（免费平台怎么选）

完整调研报告见仓库根目录 `free-hosting.md`。

## 结论先说

**绝大多数免费平台不适合这个服务端**，原因不是它跑不动 Python，
而是它们**不放行自定义 TCP 端口的入站流量**——游戏服务端要监听
"WS 端口 + HTTP 状态页端口"，免费档普遍只给 80/443 或一个动态分配的端口。

```
## 最终推荐排序

### 第一名：Oracle Cloud Always Free Arm VM——适合“真正想长期免费、会一点 Linux”的用户

部署路径是注册验证后创建 Ubuntu Arm VM，配置公共子网、安全组、SSH；安装 Python 3、venv、git，把项目放入服务目录；使用 systemd 守护游戏进程，开放 19000、443、可选 UDP 端口；通过 Caddy/Nginx 或 Python TLS 提供 WebSocket 与状态页。状态页端口、TLS 证书、监控和防火墙都属于部署工作，不应依赖平台默认开放。

主要风险有五点：注册可能要求信用卡且存在验证失败；免费 Arm 容量可能暂时不足；连续低利用率有回收风险；默认只有 Arm 二进制兼容性，原生 C 扩展需适配 aarch64；公共 IP 与入站端口必须主动管理安全组。其价值在于它同时满足永久免费、完整常驻、任意端口和 Docker/原生 Python，是其余平台无法在零成本下复制的组合。

### 第二名：Fly.io——适合愿意每月付约 2.19 美元、希望免运维的用户

部署路径是安装 Fly CLI，创建 Dockerfile，把 Python 项目打包；用 `fly.toml` 分别定义 TCP 19000、TLS 443 与 UDP；通过 `fly deploy` 发布；以 `fly logs` 和健康检查观察。若不想付费，试用只能短期验证架构，不能承诺长期运行。[2]

Fly 的坑是端口配置与进程绑定必须一致，UDP 不能误加 HTTP handler，持续实例会按秒计费，出网另收费。它的优势是端口模型完整、Docker 部署简单、自动 TLS 与全球区域可选，是原始 TCP/UDP 游戏最接近“现代 PaaS”的托管选择。

### 第三名：Koyeb——适合免费常驻网页游戏或低频好友服

部署路径是准备 Git 仓库与 Dockerfile，创建免费 Web Service，让进程同时提供 `wss://` 与 HTTP 状态页；如确需裸 TCP，在端口配置中启用 TCP Proxy，把客户端连接地址设为动态代理域名和端口。保持至少一个实例运行，不要开启 scale-to-zero。[4][5]

Koyeb 的坑是免费资源只有 0.1 vCPU/512 MB，端口随机且可能变更，TCP Proxy 是预览功能，账号需保留有效支付方式。它适合 2–6 名玩家、每天低频运行；若想让玩家连接固定 `host:19000`，必须把端口和域名持久化设计写进客户端。

## 按用户类型直接选择

**纯免费、长期、少量好友、用户愿意装 VPN：Oracle VM + Tailscale/ZeroTier 双入口。** Oracle 提供永久服务器，Tailscale 解决临时 IPv4 NAT 或开发测试；ZeroTier 可作为备选。Oracle 主入口负责公网 WebSocket 和对外状态页，VPN 只在原始 TCP/UDP 需要时启用。

**纯免费、长期、希望普通网友零安装：Oracle VM + Cloudflare Tunnel。** 将游戏改为 WebSocket，Cloudflare 暴露域名，玩家只访问 `wss://`。不要在 Termux 手机上作为唯一长期节点；若只有手机，Cloudflared 也需保活，4G NAT 和后台杀进程仍会中断服务。

**愿意付少量费用、坚持原始 TCP/UDP：Fly.io。** 用 Fly 原生端口直接映射 19000 与 UDP，不依赖路径代理或动态 TCP Proxy。每月成本约从 2.19 美元起，不是免费，但运维和端口能力最干净。

**零预算、可容忍停机和休眠：Koyeb。** 不要使用 Render，因为 15 分钟休眠和唤醒会破坏联机；Koyeb 的免费 Web Service 更适合真实运行，但 TCP Proxy 端口需动态配置。若玩家不接受地址变化，则放弃裸 TCP，统一改 WebSocket。


## 一行命令跑起来（有机器就行）

```bash
# Python 版（Termux / 任何 Linux）
python3 server/server.py

# Node 版
node server/server.js
```

端口：WS 与 UDP 共用 `19000`，HTTP 状态页 `19001`。
环境变量：`BB_PORT` / `BB_HTTP_PORT` / `BB_MAX` / `BB_NAME`。

## 客户端里怎么填

服务器列表 → 添加，地址填主机名或 IP，端口填 **19000**。
客户端会自动把地址拼成 `ws://地址:19000`，
并访问 `http://地址:19001/info` 读取在线人数与上限。

**如果服务端部署在只放行 443 的平台**，把 WebSocket 反代到 443 后：
地址填 `wss://你的域名`（客户端识别 `wss://` 前缀后不再拼端口）。

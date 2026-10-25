# 免费平台部署自写 Python 游戏服务器：端口、常驻性与穿透方案调研

## 摘要

截至 2026 年 10 月，若“免费”严格定义为长期常驻、可控制自己的进程、并能监听自定义 TCP 端口，最现实的答案是 **Oracle Cloud Always Free Arm VM**：它按账号生命周期免费，最多可配置 2 个 OCPU、12 GB 内存，并能像普通服务器一样监听任意 TCP/UDP 端口；低利用率仍可能被回收。[1] Fly.io 技术上最适合 WebSocket 与自定义端口，可配置任意 TCP、UDP 和连续端口范围，但自 2024 年取消新账户常规免费额度，最便宜的常驻 256 MB Machine 约 2.19 美元/30 天。[2][3] Koyeb 免费档提供 1 个 Web Service，并能为公网 TCP 分配唯一域名和随机端口，但端口不是部署前可预测的 19000，且 TCP Proxy 与缩容到零不兼容。[4][5] Render、Cloud Run、Railway、Heroku、Cyclic、Glitch 都不适合裸自定义 TCP 长连接：Render 空闲 15 分钟休眠，Cloud Run 是请求驱动模型，Heroku 已结束免费档。[6][7][10][14][18]

如果玩家使用浏览器或能接受通过标准 WebSocket over TLS 接入，首选应是“一个进程同时服务 `/ws` 游戏通道与 HTTP 状态页”，再放到有原生端口能力的平台。没有 VPS 时，Oracle 是长期免费的首选；Fly 或 Koyeb 是以少量月费换取低运维成本的第二选择；家庭宽带/4G 下的 Termux 最稳妥免费方案是 Cloudflare Tunnel 暴露 WebSocket，或让所有玩家安装 Tailscale/ZeroTier；ngrok 免费 TCP 可给原生 TCP，但需信用卡验证且有月度连接限额。[12][13][15][16] Glitch 已于 2025 年 7 月 8 日停止项目托管，不能作为候选。[17]

## 先纠正一个前提：WebSocket 不必占用第二个端口

用户设想“一个 TCP 端口做 WebSocket，另一个 TCP 端口做 HTTP 状态页，可选 UDP”，这是可行架构，但不是免费 PaaS 条件下最容易成功的架构。WebSocket 握手本就是 HTTP `Upgrade` 请求，Cloudflare、Fly、Koyeb、Render 的边缘代理都能把安全域名上的 `/ws` 或 `/.websocket/` 升级为 WebSocket。这样只需一个标准端口：浏览器和绝大多数跨平台客户端使用 `wss://game.example.com/ws`，状态页使用 `https://game.example.com/status`。自定义客户端若只能做原始 TCP framing，才必须寻找公网 TCP 端口映射。

因此，选择顺序不应是“哪个免费平台刚好有 19000 端口”，而应是：

1. 先把协议统一到 TLS WebSocket；确认是否仍需要原始 TCP。
2. 若仍需要原始 TCP，只保留一个原始 TCP 端口和一个可选 UDP 端口，降低平台依赖。
3. 优先寻找原生 IPv4/IPv6 端口映射；没有时再用 TCP Proxy、Cloudflare WebSocket、ngrok 或成员 VPN。
4. 玩家是普通网友时避免强制安装客户端；朋友联机时 Tailscale/ZeroTier 能显著降低 NAT 成本。

## 平台总览：真正永久免费的常驻服务器只有 Oracle

下表不是简单罗列“有免费档”，而是按四项同时判断：进程是否常驻、免费是否持续、支付信息是否必须、公网协议暴露是否足够。评分只用于快速筛选，不是厂商性能测试。

| 平台 | 运行时模型 | 免费额度与持续性 | 信用卡/验证 | 常驻进程 | 自定义 TCP/UDP 公网暴露 |
|---|---|---|---|---|---|
| Oracle Cloud Always Free | 真实 VM | 账号生命周期内免费 | 信用卡用于身份/支付验证 | 是 | 任意 TCP/UDP，公网 IP 可选 |
| Fly.io | 容器化 Machine | 新账户无常规免费额度；短期试用 | 试用后必须绑卡 | 可常驻，但持续计费 | TCP、UDP、连续端口范围均可 |
| Koyeb | 容器化 Service | 1 个免费 Web Service | 需支付方式 | 是，scale-to-zero 需关闭 | 公网 TCP Proxy；域名与随机端口 |
| Render | Web Service | 每月 750 实例小时 | 支付方式影响超额后的服务状态 | 空闲 15 分钟休眠 | 基本仅 HTTP/HTTPS/WebSocket |
| Railway | 容器 | 新用户一次性 5 美元试用、30 天；后转每月 1 美元额度 | 需验证账户 | 有后台服务，持续运行耗额度 | 可监听 PORT，但免费档并非永久 |
| Google Cloud Run | 容器 | 有永久免费额度 | 需支付方式 | 可保持最低实例，但按使用计费 | 仅 HTTPS；不适合裸 TCP/UDP |
| AWS Free Tier | EC2 VM | 首 12 个月，每月 750 小时 | 需信用卡 | 是 | 任意 TCP/UDP |
| Azure Free Tier | VM | 首 12 个月，每月 750 小时 | 需信用卡 | 是 | 任意 TCP/UDP |
| Northflank | 容器 Service | 存在免费档信息，但本次未获得可稳定复核的官方规则 | 未查到确切信息 | 技术上可常驻 | 未查到确切公网端口规则 |
| Alwaysdata | 共享主机 | 免费档长期有效 | 信用卡/借记卡验证 | 可后台守护进程 | 未查到确切公网端口规则 |
| Serv00 | 共享主机 | 免费档长期有效 | 未查到确切信息 | 技术页面列有常驻能力 | 页面列出 TCP/UDP 端口，但公网映射未确认 |
| Replit | 云端工作区 | 免费档存在，但不是完整裸 VM | 可免卡创建免费模式 | 可运行后台任务 | 未查到确切公网自定义端口规则 |
| Cyclic | Serverless | 有免费档 | 未查到确切信息 | 不是长时常驻模型 | 面向 HTTP/WebSocket，不适合裸 TCP/UDP |
| Glitch | 原共享托管 | 已停止项目托管 | 已不适用 | 已不适用 | 已不适用 |
| FreeVPS | 社区 NAT KVM | 满足社区条件后免费，无时长保证 | 一般无需付款 | 是 | 20 个公网 NAT IPv4 端口、IPv6 |
| Hetzner | 云/虚拟服务器 | 无常规免费档 | 需付款 | 不适用 | 不适用 |
| Heroku | Dyno | 无免费 Dyno | 最低 Eco 5 美元/月共享 1,000 小时 | 无真正永久免费 | HTTP/S 路由为主 |

![常驻与长期免费适配评分](/data/workspace/dr:free-hosting/fig_residency.png)

*图 1：Oracle、AWS、Azure 最接近传统常驻服务器，但只有 Oracle 按账号生命周期免费。数据来源：Oracle、Render、Fly、AWS、Azure 官方文档 [1][3][6][9][10]*

[下载平台结构化数据](/data/workspace/dr:free-hosting/data_platforms.csv)

**只有 Oracle 同时具备“真实 VM、持续运行、永久免费”三项。** Oracle 明确把一部分 Ampere A1 资源定义为 Always Free，并说明这些资源在账号生命周期内免费；按页面规则可得到最多 2 个 OCPU、12 GB 内存。账户可以创建公共子网实例，也可以不给实例分配公共 IPv4 地址。[1] 这意味着它不只是“一个能跑脚本的沙箱”，而是可以安装 Python、systemd、防火墙、TLS 证书、Nginx/Uvicorn 或原生 `asyncio` 服务器，监听 19000、443、UDP 的完整服务器。其风险不在平台是否给端口，而在注册验证、Arm 容量、免费资源边界、安全组和回收政策。

**AWS 与 Azure 是“一年免费 VM”，不是长期免费。** AWS Free Tier 的 Linux t2.micro 或 t3.micro 为 12 个月内每月 750 小时；Azure 的 B1S、B2pts v2、B2ats v2 也以 750 小时/月、12 个月为边界。[9][10] 两者都能运行自定义服务器并开放安全组端口，适合短期项目、教学演示或用来验证架构，不应承诺给玩家“长期运行”。

## Oracle Cloud：唯一同时满足常驻、自定义端口和零月费的主线答案

**推荐做法是开一台 Arm Ubuntu 实例，把游戏与状态页放在同一进程或同一个 443/19000 设计中。** 若客户端支持浏览器化，使用一个进程提供 `wss://` 与状态页最省事；若客户端坚持原始 TCP，让服务器绑定 `0.0.0.0:19000` 和状态页端口，配置安全组、Ubuntu `ufw` 与进程守护即可。WebSocket 可交给 Nginx 反代，也可用 Python 原生处理；状态页可以是同一 asyncio 服务的 HTTP handler，或 Caddy/Nginx 静态文件加 JSON API。

Oracle 的 Arm 额度是可拆分的：2 OCPU、12 GB 内存可以组成一台 VM，也可以拆成两台小 VM。[1] 对小型 Python 游戏，常见选择是一台 2 OCPU/4–8 GB VM，剩余内存不必强行占满。生产上建议至少再做一次定期备份或手工镜像；免费档的回收逻辑会把连续低利用率视为空闲风险，因此心跳、监控、日志和真实玩家流量都有运维价值。

**Ampere 空闲回收是本次调研中最容易被忽略的“有免费但不保证常驻”条款。** Oracle 官方规定，在连续 7 天窗口内，A1 实例的 CPU 95 百分位利用率、网络利用率和内存利用率均低于 20% 时，可被视为空闲并被回收。[1] 一个每天只有几个玩家的实验服完全可能触线。缓解方法不是伪造无意义流量，而是：给服务配置自动重启，用外部健康监控检测服务而非持续制造连接，保存好自动部署脚本；被回收后依靠启动脚本重新拉起。也可把真正需要稳定性的状态页、房间列表放到成本可接受的小节点，游戏节点保持自动恢复。

**Oracle 是首选，但不是“注册即拿 VM”。** 常见现实障碍包括信用卡范围、注册验证、家庭区域容量、Always Free 资格镜像和公共子网配置。官方只说 Always Free 资格镜像没有授权费，并未承诺每个区域、每个时刻都有容量。[1] 应预先写好基础设施即代码或 shell 部署脚本，不要手工逐条配置后无法重建。

## Fly.io：端口能力最好，但已经不是免费答案

**Fly 的 `fly.toml` 可以暴露几乎任意 TCP/UDP 组合。** 官方配置文档允许设置 `internal_port`、`protocol`、外部 `port`，并用 `start_port` 和 `end_port` 暴露连续端口范围。例如，公开 TCP 19000 与 TLS 443、并把 UDP 5000 直接映射出去，可以写：

```toml
[[services]]
internal_port = 19000
protocol = "tcp"

[[services.ports]]
handlers = ["tls"]
port = 19000

[[services]]
internal_port = 443
protocol = "tcp"

[[services.ports]]
handlers = ["tls"]
port = 443

[[services]]
internal_port = 5000
protocol = "udp"

[[services.ports]]
port = 5000
```

应用实际监听端口必须与 `internal_port` 一致；UDP 的 `[[services.ports]]` 不设置 handler。[3] 这意味着用户原始需求中 TCP 19000、TCP 443 状态页、UDP 端口三项都可以在一个 app 中完成，比多数只代理 HTTP 的平台灵活。

**真正的障碍是价格。** Fly 官方明确说明新组织没有免费档或月度免费额度，新账户试用上限为 Machine 运行 2 小时或 7 天；试用无需信用卡，但试用后必须绑卡。[2] 最便宜的常驻 `shared-cpu-1x`、256 MB 实例在 iad 或 ewr 约 2.19 美元/30 天，另计北美与欧洲 0.02 美元/GB 出网。[2] 它比常见 5 美元 VPS 低，却不符合“完全免费长期运行”。

Fly 仍有资格成为推荐榜第 2 名，因为每月几美元能换来全球部署、IPv6、Anycast、TLS、Docker 部署和完整端口模型。WebSocket 可以走 `wss://<app>.fly.dev` 或自定义域名；若害怕平台对其 443 做 HTTP 语义处理，则保留 TCP 19000，而不是把游戏协议硬塞进 HTTP 路径。需要注意：持续运行的空闲实例仍在计费，不能靠缩容到零来同时满足“随时连接”。

## Koyeb：免费常驻不错，但 19000 只是内部端口

**Koyeb 的 TCP Proxy 能暴露非 HTTP 服务，但玩家连接的是动态代理域名和端口。** 启用后，Koyeb 会分配一个托管代理域名和一个动态生成的 TCP 端口，例如 `01.proxy.koyeb.app:2222`；端口一旦分配会跨部署保持，但禁用再启用 TCP Proxy 可能换新端口。[4] 因此服务端仍可监听 `0.0.0.0:19000`，客户端却不能假定公网地址也是 `host:19000`。

Koyeb 官方免费档允许每个组织拥有 1 个位于法兰克福或华盛顿、512 MB 内存、0.1 vCPU、2 GB SSD 的 Web Service；按官方说明，使用免费 Web Service 不会被收费，且平台支持原生 WebSocket。[5] 但 TCP Proxy 当前是公开预览，且“此刻不兼容 scale-to-zero”。[4] 用户若希望服务立即响应，应保持至少一个实例、不缩到零；这也意味着免费 Service 不能再用缩容省钱。

**Koyeb 的免费档是真正的低成本长时运行，而不是永久无条件的 2 OCPU 服务器。** 官方同时说明账号至少保留一种有效支付方式，删除支付方式需停用账号。[5] 对于 2–4 名朋友的低频游戏，1 个免费 Service 足够；对于数十玩家、房间分配、数据库和上传资源，512 MB/0.1 vCPU 很容易不足。若采用它，应在客户端实现版本协商、重连、地址更新和重连退避，因为代理端口可能变化。

## Render、Railway、Cloud Run、Heroku 与 Cyclic：适合网页接口，不适合裸游戏端口

**Render 的 15 分钟休眠直接否定“长期运行游戏服务器”。** 官方规定免费 Web 服务在 15 分钟没有入站流量后休眠，HTTP 请求或新 WebSocket 连接才会唤醒；唤醒约需一分钟，且运行中的 WebSocket 消息也计入活动流量判断。[6] 每月 750 免费实例小时、临时文件系统在重启或休眠时会丢失。Render 还明确不建议把免费实例用于生产。[6] 因而它只适合托管 HTTP 状态页，不适合托管需要随时接受玩家连接的游戏核心。

**Railway 的免费资源是试用额度和每月少量额度，不是无限常驻。** 新用户可获得 30 天内有效的一次性 5 美元试用额度；到期后转为每月 1 美元免费额度，额度不清零到下月。[7] 一个持续运行的小容器会持续扣减额度，超过后按用量计费。它技术上能运行 Python 进程，也可通过 `PORT` 提供 HTTP/WebSocket，但“常驻进程”与“不收钱”不能同时满足。

**Google Cloud Run 适合 HTTP/WebSocket，但仍是请求驱动模型。** Cloud Run 有永久免费额度，页面列出的 vCPU 与内存额度为每月 240,000 vCPU-seconds 和 450,000 GiB-seconds；不使用则不付费。[8] 官方也提供 WebSocket 文档。但游戏服务器需要会话长期保持时，应显式设置最低实例数，这会突破“不使用不付费”。Cloud Run 服务仍是通过 HTTPS 访问，不能把 19000 暴露成公网原始 TCP，也不能直接暴露 UDP。

**Heroku 应直接从候选名单删除。** Heroku 的 Eco 计划每月 5 美元、提供账户内共享的 1,000 Dyno 小时，基础 Dyno 全价约 7 美元/月；公开材料未显示当前有免费 Dyno。[10] 其 Classic Runtime 的端口路由也以 HTTP 风格为主，不适合把原始 TCP 游戏协议长期绑定到固定端口。

**Cyclic 是面向 AWS 无服务器原语的 JavaScript 平台，不是 Python 常驻游戏服务器。** 其免费档宣称不休眠，但架构以请求、API 网关和 Lambda 为中心；即便能运行部分 Python，也不应把它视为可以长期持有原始 socket 的 PaaS。[18] 它更适合无服务器 API 和前端托管。

## 仅开放 80/443 的平台如何变通

**首选变通不是开隧道，而是把游戏升级到 WebSocket。** 原始 TCP 游戏若本来就是文本或二进制帧，增加一次 HTTP `Upgrade` 头处理即可。服务器可在 443 同时提供：

- `wss://game.example.com/ws`：玩家连接；
- `https://game.example.com/status`：JSON 状态页；
- `https://game.example.com/`：静态监控页面。

路径代理并不改变 WebSocket 的二进制能力；RFC 6455 握手后传输的仍是应用定义的帧。Cloudflare 默认代理会处理 WebSocket 升级，客户端用标准浏览器 API 或 `websockets` 库即可连接。若状态页是低频读取、游戏是高频实时，建议把状态页做成缓存 JSON，游戏使用独立协议版本头。

**不能改客户端时，Koyeb TCP Proxy、Fly 原生端口或真实 VM 优于 HTTP 路径代理。** 把二进制游戏协议伪装成 HTTP 请求，会持续消耗代理、日志和缓存资源，并可能受到请求超时、body 限制或协议校验影响。Cloudflare 的免费 HTTP/HTTPS 代理最适合 Cloudflare Tunnel，而不适合任意 TCP/UDP；普通玩家不能仅输入 `host:19000` 连接。

**不要为了“任意端口”滥用 Cloudflare Spectrum。** 面向任意公网 TCP/UDP 的 Spectrum 属于商业产品，不属于免费计划。Cloudflare Tunnel 的正确免费用法是：域名托管在 Cloudflare，运行 `cloudflared tunnel` 建立从源机到 Cloudflare 边缘的出站隧道；公网用户通过 HTTPS/WebSocket 域名访问。纯原生 TCP/UDP 若要求所有客户端都先安装 cloudflared 或使用 WARP，则它实质变成成员专用中继。

## Termux 与无公网 IP：免费方案按玩家接受度分层

![内网穿透方案对外部玩家免装客户端的适配程度](/data/workspace/dr:free-hosting/fig_tunnels.png)

*图 2：Cloudflare 公网 HTTP/WebSocket 最适合网页玩家；纯 TCP/UDP 穿透常要求玩家安装客户端或使用成员制 VPN。数据来源：Cloudflare、ngrok、Tailscale 官方文档及 FreeVPS 官方规则 [4][12][13][15][16]*

**家庭宽带和 4G 的首要问题不是 CPU，而是地址与 NAT。** Termux 能运行 Python、pip、SSH、Cloudflared、Tailscale、ZeroTier 等工具，但运营商 NAT、运营商防火墙、IPv4 CGNAT、IPv6 防火墙、手机省电策略和 Termux 后台被杀都会切断游戏。手机不应只靠 Termux 前台进程：至少配置 `termux-wake-lock`、自启动、systemd 非托管方式或 Tasker/厂商白名单；更现实的是把服务器放在 Oracle、旧电脑或能长期供电的设备上，Termux 仅做临时联机或管理终端。

**Cloudflare Tunnel 最适合公开 WebSocket，但不要用它伪装原生 TCP。** 基本结构是：Termux 运行游戏，游戏监听 `127.0.0.1:19000`；Cloudflared 以 named tunnel 连接 Cloudflare；公网 `wss://game.example.com/ws` 被转发到本机 WebSocket 服务。无需公网 IP，只要出网、域名放在 Cloudflare，且隧道进程持续运行。免费计划没有公开固定的原生公网 TCP 端口；Cloudflared 的 `access tcp` 需要客户端运行 cloudflared，WARP 也是成员模型。[12]

Cloudflare 免费计划免费额度没有像传统 PaaS 那样公开明确统一的每月固定带宽上限，但受服务条款、滥用政策、请求体、缓存和代理约束；不能用“免费”推导为可无限转发游戏流量。对小型回合制、房间状态或低频实时游戏，WebSocket 通常可以；对高频率位置同步，应做应用层压缩、差量同步、tick 合并和断线重放，不能把所有输入无压缩广播。

**ngrok 免费 TCP 能直接暴露 19000，但更像开发测试工具。** 官方资料显示免费计划支持 HTTP/S 与 TCP；TCP 地址在信用卡验证后包含 1 个随机固定地址，额外地址按每小时约 0.005 美元收费，可使用包含额度。免费计划每月 TCP/TLS 连接限 5,000 次、每分钟 TCP 连接 100 次。[13] 这足以让少量玩家测试，却不适合每天反复重连、数十玩家长期游戏。免费计划使用开发域名时，端点在线小时不限；TCP 地址则不是无限的。

**Tailscale 和 ZeroTier 免费、稳定，但要求所有玩家加入网络。** Tailscale Personal 免费，面向非商业用途，最多 6 名用户，设备数量无限，支持 P2P、子网路由、ACL 和 MagicDNS。[15] 玩家安装客户端后可直接用 Tailscale IP 或名称连接 `100.x.x.x:19000`。ZeroTier 的社区信息称个人网络最多 100 台设备。[16] 优点是 NAT 穿透后流量可直连，原始 TCP/UDP 都可用，无需公网端口；缺点是首次加入、认证、移动端常驻和“为什么要点同意”都会提高玩家门槛。

**IPv6 直连在条件满足时最低延迟，但运营商依赖最强。** 若手机或家庭网关拿到公网 IPv6/64，服务器监听 IPv6，玩家也拥有 IPv6，那么玩家可直接连接 `[IPv6]:19000`。现实中还要放行 IPv6 防火墙入站、处理临时与稳定地址、DDNS、前缀续租、移动网络是否分配 IPv6 以及玩家端是否支持 IPv6。没有这些确认，不能把 IPv6 作为唯一入口。

**frp 公共节点和 FreeVPS 能暴露原生端口，但可信度与稳定性不是平台级。** frp 本身开源，但没有可靠的“公共免费 frp 节点”官方永久承诺；公共节点可能涉及日志、限速、端口回收和跑路风险。FreeVPS 是社区赞助的 NAT KVM：免费档提供 1 个 CPU 核心、1 GB 起内存、20 GB 磁盘、250 GB 带宽、20 个公网 IPv4 NAT 端口和 IPv6；同时要求满足社区参与条件、无 SLA，资源可能被回收。[16] 它适合技术用户做低成本实验，不适合无门槛长期游戏服务。

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

## 部署前的协议检查清单

服务器应读取端口配置，默认绑定 `0.0.0.0` 与 IPv6 `[::]`，显式打印实际监听地址；区分 `PORT`、内部端口、外部端口、服务发现端口。WebSocket 应验证 `Host`、`Origin`、协议版本和路径前缀；游戏连接应使用短期 token，避免把 `/ws` 直接暴露成无认证入口。状态页最好只返回必要房间数、版本、延迟和玩家上限，不返回完整内部地址或敏感日志。

连接层需要重连退避、应用层心跳、消息长度限制、版本协商、时间戳与幂等命令。Cloudflare 和 PaaS 的边缘代理可能关闭空闲连接，固定 15–25 秒的 WebSocket ping/pong 比默认系统设置更稳妥。日志不能记录玩家完整地址或敏感 token，systemd 重启次数应限制，避免崩溃循环放大日志和 CPU。

网络侧应测试四个场景：服务器主动出站是否正常；公网 IPv4、IPv6 是否可达；TCP 与 UDP 是否分别可达；玩家 NAT 后能否建立连接。只测 `curl 127.0.0.1` 不能证明端口映射成功。Fly、Koyeb、Cloudflare 三层网络各有自己的握手语义，应在部署当天记录连接时间、首字节、TLS 握手、重连次数和每小时流量。

## 未查到确切信息的项目

本次没有找到能够稳定复核的一手材料，明确证明以下事项：

- Alwaysdata 免费账户能否把自定义 TCP/UDP 端口直接暴露给公网，以及其防火墙/代理端口范围；只确认其有 SSH、后台进程与免费长期套餐。
- Serv00 免费账户的 3 个 TCP/UDP 端口是否对公网开放，还是仅供内部服务、SSH 隧道或面板管理；不能仅凭页面列出端口就承诺玩家可连接。
- Replit 当前免费模式能否让外部非平台客户端连接任意公网 TCP 端口；官方页面强调发布与访问令牌，未提供裸端口映射规则。
- Northflank 当前免费套餐的公网端口、信用卡要求和可持续性；网页与价格信息不足以形成可靠结论。
- Hetzner 当前存在无需付款、可持续使用的免费 VPS 或 Cloud 档；公开产品价格最低约 5.99 欧元/月起。
- Cyclic 当前官方 Python 运行模型能否维持 WebSocket 长连接，及其免费档持续时间和信用卡要求。

因此，上述平台没有被列入 Top 3。尤其是 Serv00 和 Alwaysdata，技术上值得创建测试账号，但测试时必须先验证 `bind()`、防火墙、外部 `nmap`/`nc`、WebSocket 升级和 24 小时稳定性，不能仅以“SSH 能运行脚本”作为公网端口可用的证据。

## 结论

**如果必须完全免费且长期运行，应把 Oracle Cloud Always Free 作为唯一主线。** 它要求用户接受 Linux、Arm、安全组、回收风险和注册验证，却真正提供 VM、任意端口和账号生命周期免费。[1] **如果“免费”可以放宽到每月 2 美元左右，Fly.io 是原始 TCP/UDP 游戏的最佳托管平台；** 若坚持零成本，则应把游戏迁移到 WebSocket，用 Cloudflare Tunnel 或 Koyeb。[2][3][4] **Render、Cloud Run、Heroku、Cyclic 和 Replit 更适合网页接口或短时任务，不应承担需要随时连接、长期保活的联机游戏核心。**

对 Termux 用户，最现实的结论是：手机可以作为客户端、管理端或临时穿透节点，但不应成为没有保活保障的唯一服务器。免费 VPN 方案能解决 NAT，却把门槛转嫁给玩家；Cloudflare Tunnel 能保留零安装体验，却要求协议是 HTTP/WebSocket。架构设计应在立项时同时决定端口、客户端、玩家门槛和运维责任，而不是在部署阶段希望平台“恰好开放 19000”。

## 引用来源

[1] https://docs.cloud.psn-pco.it/iaas/Content/FreeTier/resourceref.htm
> “All Oracle Cloud Infrastructure accounts … have a set of resources that are free of charge … for the life of the account.”

[2] https://docs.fly.io/about/pricing
> “New organizations don’t have a free tier or a monthly free usage allowance.”

[3] https://docs.fly.io/reference/configuration
> “port : An integer representing the external port to listen on (ports 1-65535).”

[4] https://www.koyeb.com/docs/run-and-scale/tcp-proxy
> “TCP Proxy lets you expose the TCP ports of your Services to the Internet.”

[5] http://koyeb.com/docs/faqs/pricing
> “Each organization has access to: One free web Service … with 512MB of RAM, 0.1 vCPU, and 2GB of SSD.”

[6] https://render.com/docs/free
> “Render spins down a Free web service that goes 15 minutes without receiving any inbound traffic.”

[7] https://docs.railway.com/reference/pricing/free-trial
> “The trial gives access to basic features for up to 30 days and includes a one-time grant of $5.”

[8] https://cloud.google.com/run
> “Cloud Run services can receive … messages from Pub/Sub … Using WebSockets Using gRPC.”

[9] https://aws.amazon.com/pm/ec2/
> “12 MONTHS FREE 750 hours per month of Linux … t2.micro or t3.micro.”

[10] https://devcenter.heroku.com/articles/usage-and-billing
> “The Eco dyno plan provides 1,000 dyno hours for $5 per month.”

[11] https://learn.microsoft.com/fil-ph/AZURE/cost-management-billing/manage/create-free-services
> “B1S, B2pts v2 … and B2ats v2 … burstable VMs that are usable for up to 750 hours per month.”

[12] https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
> “Cloudflare Tunnel runs a lightweight connector … creating an outbound-only connection.”

[13] https://dev-ngrok.com/docs/pricing-limits/how-ngrok-charges
> “Free Plan … HTTP/S, TCP (with credit card verification).”

[14] https://www.tailscale.com/pricing
> “Personal users have access to the free tier plan for non-commercial use, which will be free forever.”

[15] https://www.zerotier.net.cn/
> “免费版 最多 100 个设备 无限个人网络 基本管理功能 社区支持。”

[16] https://www.freevps.org/
> “Regular Community Standard Allocation FREE … Bandwidth 250GB on 150 Mbps port.”

[17] https://glitch.com/
> “on July 8th we ended project hosting.”

[18] https://www.cyclic.sh
> “Built and deployed with global scale enterprise grade serverless primitives.”

[19] https://www.koyeb.com
> “Native HTTP/2, WebSocket, and gRPC Support.”

[20] https://railway.com/pricing/
> “Your Hobby plan subscription includes $5 of usage per month.”

[21] https://www.replit.com
> “Free mode … Run one background task at a time.”

# Codex 与 Go 原生传输画像实测记录

> 采集时间：2026-09-17（Asia/Shanghai）
>
> 用途：验证官方 Codex 与 sub2api 第一阶段 `go-native-v1` 的 TLS、HTTP/2 和 WebSocket 传输差异。本文是一次版本化样本，不代表 OpenAI 对客户端指纹的公开契约。

## 1. 样本和方法

官方客户端样本：

```text
codex-cli 0.151.0
Codex Desktop/0.151.0 (Windows 10.0.26200; x86_64)
clientInfo: codex_exec/0.151.0
```

Go 基线样本：

```text
Go 1.26.7 windows/amd64
net/http + crypto/tls
github.com/coder/websocket v1.8.14
```

采集使用透明 HTTP CONNECT 隧道转发到 `tls.peet.ws`。隧道只读取并转发第一个 TLS ClientHello，不终止 TLS、不解密后续 HTTP，也不记录认证头和请求体。Codex 使用独立的无效占位 API key 和自定义 provider；没有发送真实 OpenAI/ChatGPT token，也没有调用模型或消耗账号额度。

`tls.peet.ws/api/all` 用于返回服务端看到的 TLS、HTTP/1.1 和 HTTP/2 信息。由于本机网络无法直连 `api.openai.com:443`，本次没有对 OpenAI 生产域名发起请求。JA3/JA4 由 ClientHello 字段构成，目标 SNI 的具体字符串不进入哈希，因此本次结果仍可用于比较客户端传输实现；TCP/IP 指纹和生产代理链不在本次结论范围内。

每类 Go 原生样本重复采集两次。Codex WebSocket 在一次任务中进行了两次 WS 建连并在失败后回退 HTTP，因此同时得到两份 WS 样本和一份 HTTP fallback 样本。

## 2. 结果总览

| 样本 | TLS | ALPN | HTTP | JA3 | JA4 |
| --- | --- | --- | --- | --- | --- |
| Codex HTTP transport-default | TLS 1.2 画像 | 无 | HTTP/1.1 | `6a5d235ee78c6aede6a61448b4e9ff1e` | `t12d180700_4b22cbed5bed_2dae41c691ec` |
| Codex WS rustls，第 1 次 | TLS 1.3/1.2 | 无 | HTTP/1.1 Upgrade | `2953499b248d1e248d751ee8fd17809b` | `t13d101000_61a7ad8aa9b6_f9531d972513` |
| Codex WS rustls，第 2 次 | TLS 1.3/1.2 | 无 | HTTP/1.1 Upgrade | `7dc4ad070e279f24b6764fd303db1fde` | `t13d101000_61a7ad8aa9b6_f9531d972513` |
| `go-native-v1/http-h2` | TLS 1.3/1.2 | `h2,http/1.1` | HTTP/2 | `03117a8ed39ef02427ebbc39f121275c` | `t13d1312h2_f57a46bbacb6_ab7e3b40a677` |
| `go-native-v1/ws-h1` | TLS 1.3/1.2 | 无 | HTTP/1.1 Upgrade | `9b7dcdf3f997f1fb7b4409c94cb7ef36` | `t13d131100_f57a46bbacb6_ab7e3b40a677` |
| 现有内置 Node.js 24.x uTLS | TLS 1.3/1.2 | 默认 `http/1.1` | HTTP/1.1 | `44f88fca027f27bab4bb08d4af15f23e` | `t13d1714h1_5b57614c22b0_7baf387fc6ff` |

最后一行来自仓库中已有的已标注采集值，本轮没有重新采集 Node.js 24.x。

## 3. Codex 0.151.0 实测

### 3.1 普通 HTTP

两次观察到的普通 HTTP ClientHello 一致：

```text
cipher suites:
49196,49195,49200,49199,49188,49187,49192,49191,
49162,49161,49172,49171,157,156,61,60,53,47

extensions:
0,10,11,13,35,23,65281

supported groups:
29,23,24

ALPN: none
```

该结果符合源码中 HTTP 默认使用 `reqwest` transport-default、Windows 构建使用平台 TLS 的行为。本样本不应命名为“Codex rustls HTTP 指纹”，也不能外推为 macOS 或 Linux Codex 的 HTTP 画像。

### 3.2 Responses WebSocket

WS 使用 rustls，两个 ClientHello 的 cipher suites、groups、signature algorithms 和归一化 JA4 一致，但 extension 顺序不同：

```text
sample 1 extensions:
11,5,43,51,45,35,23,0,13,10

sample 2 extensions:
11,45,51,13,5,35,10,0,23,43
```

因此两个 JA3 不同，而 JA4 相同。该结果说明不能给官方 Codex 固定一个 JA3 并把每次顺序变化视为身份漂移。用于账号画像时，应记录版本化 transport family 和归一化能力，原始 JA3 只适合诊断。

WS 两次都没有发送 ALPN，服务端按 HTTP/1.1 处理 Upgrade。主要能力为：

```text
cipher suites:
4866,4865,4867,49196,49195,52393,49200,49199,52392,255

supported versions:
772,771

supported groups:
4588,29,23,24

key shares:
4588,29
```

## 4. `go-native-v1` 实测

### 4.1 HTTP/2

两次采集的 JA3、JA4、ALPN 和 HTTP/2 SETTINGS 完全相同：

```text
JA3: 03117a8ed39ef02427ebbc39f121275c
JA4: t13d1312h2_f57a46bbacb6_ab7e3b40a677
ALPN: h2,http/1.1
negotiated protocol: h2
```

服务端记录的 HTTP/2 SETTINGS：

```text
ENABLE_PUSH = 0
INITIAL_WINDOW_SIZE = 4194304
MAX_FRAME_SIZE = 16384
MAX_HEADER_LIST_SIZE = 10485760
connection WINDOW_UPDATE = 1073741824
```

Akamai 风格指纹：

```text
2:0;4:4194304;5:16384;6:10485760|1073741824|0|a,m,p,s
hash: cbcbfae223bb97a0cc79109588321a5c
```

### 4.2 WebSocket

两次 Go WebSocket ClientHello 的 JA3/JA4 一致：

```text
JA3: 9b7dcdf3f997f1fb7b4409c94cb7ef36
JA4: t13d131100_f57a46bbacb6_ab7e3b40a677
ALPN: none
HTTP: HTTP/1.1 Upgrade
```

Go HTTP/2 和 Go WebSocket 的 cipher、group 和 signature algorithm 基础一致；差异主要来自 HTTP/2 路径包含 ALPN 扩展，而 WebSocket HTTP/1.1 路径不包含 ALPN。这是同一 transport family 内可以解释和测试的协议差异。

## 5. 对设计的结论

1. 官方 Codex 0.151.0 自身就没有跨 HTTP/WS 唯一的 JA3。普通 HTTP 使用平台默认 TLS，WS 使用 rustls；WS 的 extension 顺序还会变化。
2. 现有 Node.js 24.x uTLS 不对应本轮任何 Codex 样本，并且默认关闭 HTTP/2，不适合作为 OpenAI/Codex 隐式默认值。
3. `go-native-v1` 不伪装成 Codex transport，但 HTTP/2 与 WS 子画像稳定、来源明确、协议差异可解释，适合作为第一阶段生产基线。
4. `go-native-v1` 必须拆成同一 family 下的 `http-h2` 与 `ws-h1` 能力，不能要求二者拥有相同 JA3；二者必须共享账号、代理、证书策略和 generation。
5. 日志和连接池应记录 `transport_family=go-native-v1`、Go 版本、协议子画像、ALPN、实际协商协议、profile generation 和 egress generation。
6. 未来若实现 `codex-*` profile，必须同时采集目标平台的 HTTP 与 WS，并验证 HTTP/2/WS 行为；固定 JA3 或只复制 cipher/extension 列表不满足升级条件。

## 6. OpenAI 生产域名真实请求样本

### 6.1 采集边界

使用用户提供的 ChatGPT 授权文件分别执行一次最小 Responses 请求，模型为 `gpt-5.5`，用户输入为 `Reply with exactly OK.`。授权文件只在进程内读取；默认 `~/.codex/auth.json` 与当前桌面端登录均未修改。临时 CONNECT 代理通过本机 v2rayN 转发到生产域名，仍然只读取 TLS ClientHello，不终止 TLS，也不记录 Authorization、`ChatGPT-Account-ID`、Cookie、请求体或响应正文。

官方 Codex 使用 `codex.exe 0.151.0` 和自定义 provider 将 token、账号头从子进程环境变量注入。Go 样本使用 Go 1.26.7 `net/http`，请求头采用当前项目默认 Codex 身份三元组，请求体使用 `stream: true`、`store: false`。两次请求均成功并返回精确 `OK`。

官方 Codex 的认证文件位置和安全边界与 OpenAI 官方说明一致：ChatGPT 登录信息可缓存在 `~/.codex/auth.json`，该文件包含访问令牌，应按密码处理。参考：[OpenAI Codex Authentication](https://developers.openai.com/codex/auth)。

### 6.2 结果

| 样本 | 生产目标 | 结果 | HTTP/ALPN | JA3 | JA4 |
| --- | --- | --- | --- | --- | --- |
| 官方 Codex 0.151.0 | `chatgpt.com:443` | 成功，精确返回 `OK` | HTTP/1.1；ClientHello 无 ALPN | `6a5d235ee78c6aede6a61448b4e9ff1e` | `t12d180700_4b22cbed5bed_2dae41c691ec` |
| Go `go-native-v1/http-h2` | `chatgpt.com:443` | `200`，SSE 完成，精确返回 `OK` | HTTP/2；ALPN `h2,http/1.1`，协商 `h2` | `03117a8ed39ef02427ebbc39f121275c` | `t13d1312h2_f57a46bbacb6_ab7e3b40a677` |

官方 Codex 运行期间观察到两个 `chatgpt.com:443` TLS 连接，二者 JA3/JA4、cipher suites、extensions 和 ALPN 完全一致；同一进程同时尝试了插件目录请求，因此端到端 TLS 抓包不能把其中某一个连接单独归因为模型请求。模型调用成功这一点由 CLI 的 `turn.completed` 和精确输出 `OK` 确认。另有一个 `ab.chatgpt.com:443` 遥测连接，其 TLS 画像也相同，不属于模型响应连接。

Go 样本只建立一个 `chatgpt.com:443` TLS 连接。响应包含单个 `response.completed`，正文共 9415 字节；采样程序只输出事件类型计数和 `output_exactly_ok=true`，没有保存 SSE 正文。

### 6.3 与第一轮样本对比

生产域名结果与第一轮 `tls.peet.ws` 结果逐项一致：

- 官方 Codex Windows HTTP 的 JA3、JA4 和无 ALPN 行为完全一致；
- Go HTTP/2 的 JA3、JA4、ALPN 和实际 HTTP/2 协商完全一致；
- 更换 SNI、经本机代理链转发并使用真实 ChatGPT 授权，没有改变两种客户端各自的 TLS 画像；
- 官方 Codex 和 Go 之间仍存在明确的 TLS、ALPN 和 HTTP 版本差异，因此业务头统一不能让 Go 传输变成官方 Codex 传输。

生产样本的脱敏 ClientHello 记录保存在本机临时目录 `C:\tmp\codex-tls-capture\real-openai-2026-09-17-clienthello.jsonl`。其中另含一条采样前验证代理链路所用的未授权 `api.openai.com:443` 探针；该探针只得到预期的 `401`，没有携带本次授权。文件只含公开目标域名、时间、TLS 参数和 ClientHello 原始字节，不含任何应用层认证数据。

### 6.4 Linux 宿主机与 Docker 真实样本

在服务器 `192.168.2.150` 上增加两类生产样本：

| 来源 | 运行环境 | 请求结果 | 生产连接画像 |
| --- | --- | --- | --- |
| Linux 官方 Codex | Ubuntu 24.04.4 LTS、x86_64、`codex-cli 0.144.1` | 成功，精确返回 `OK` | TLS 1.3/1.2、无 ALPN、HTTP/1.1；JA3 `0b85eb0d4981e69064e40753e4f0ac5f`；JA4 `t13d301100_1d37bd780c83_8e6e362c5eac` |
| Docker Go | `ghcr.io/jhupo/sub2api:0.2.14`、Alpine 3.21.7、linux/amd64、Go 1.26.7 静态采样程序 | `200`、SSE 完成、精确返回 `OK` | TLS 1.3/1.2、ALPN `h2,http/1.1`、协商 HTTP/2；JA3 `03117a8ed39ef02427ebbc39f121275c`；JA4 `t13d1312h2_f57a46bbacb6_ab7e3b40a677` |

Docker 样本是在现有 sub2api 镜像中运行只读挂载的 Go 采样程序，用于验证容器 OS、Docker bridge、代理出口和 Go 原生传输。它没有经过线上业务容器的网关、调度或请求转换逻辑，不能替代业务链路集成测试。

Linux Codex 成功请求期间观察到两个 `chatgpt.com` 连接，二者 TLS 画像完全相同。进程还访问了 `github.com` 检查资源，并访问 `ab.chatgpt.com` 发送遥测；GitHub 连接使用另一套带 HTTP/2 ALPN 的 Node 传输画像，不属于模型请求画像。首次运行因 SSH 标准输入未关闭而停在读取附加输入阶段，只产生了一条 `ab.chatgpt.com` 预热记录，已排除出成功样本。

Linux 和 Docker 均通过服务器 sing-box `127.0.0.1:12334` 出口。Windows 本机 v2rayN 也解析到相同出口：

```text
IP: 45.143.130.200
Geo: San Jose, California, US
IP timezone: America/Los_Angeles
ASN: AS6233 xTom
```

Linux 宿主机和 Docker 容器自身时区均为 `UTC +0000`，Windows 本机时区为 `Asia/Shanghai`。三种样本没有发送客户端 IP 或时区请求头；上游直接可见的是代理出口 IP，并可据此推断洛杉矶时区，而不能从本次 Responses 请求判断宿主机时区。

### 6.5 三种来源的应用身份画像

应用层使用本地安全反向代理另行采集。代理只保存 header 名称、明确允许的非凭据 header 值、随机 ID 的截断 SHA-256，以及请求体字段结构、长度和哈希；Authorization、账号 ID、prompt、instructions 和响应正文没有写入日志。三类请求均得到上游 `200` 并完成。

| 项目 | Windows Codex Desktop 0.151.0 | Linux `codex exec` 0.144.1 | Docker Go 样本 |
| --- | --- | --- | --- |
| `User-Agent` | `Codex Desktop/0.151.0 (Windows 10.0.26200; x86_64) dumb (codex_exec; 0.151.0)` | `codex_exec/0.144.1 (Ubuntu 24.4.0; x86_64) unknown (codex_exec; 0.144.1)` | `codex-tui/0.146.0 (Ubuntu 22.4.0; x86_64) xterm-256color` |
| `originator` | `Codex Desktop` | `codex_exec` | `codex-tui` |
| `version` | 未发送 | 未发送 | `0.146.0` |
| `OpenAI-Beta` | 未发送 | 未发送 | `responses=experimental` |
| 会话头 | `session-id`、`thread-id`、`x-client-request-id`、`x-codex-turn-metadata`、`x-codex-window-id` | 同左 | 只有 `x-codex-window-id` |
| 请求体顶层字段 | `client_metadata`、`include`、`input`、`instructions`、`model`、`parallel_tool_calls`、`prompt_cache_key`、`reasoning`、`store`、`stream`、`text`、`tool_choice`、`tools` | 同左 | `input`、`instructions`、`model`、`store`、`stream` |
| `instructions` | 21,347 bytes，SHA-256 前 16 位 `c2a980bc28af132e` | 与 Windows 完全相同 | 28 bytes，SHA-256 前 16 位 `fa07597c3d9b25bd` |
| 工具画像 | 8 个：6 个本地工具，加 `tool_search`、`web_search` | 与 Windows 相同 | 无工具 |
| reasoning/include | `effort=medium`；`reasoning.encrypted_content` | 与 Windows 相同 | 无 |
| 请求体大小 | 37,020 bytes | 37,058 bytes | 202 bytes |

两份官方请求中，`thread-id`、`x-client-request-id` 与 `prompt_cache_key` 在各自请求内映射到同一稳定值；另有独立 `session-id`、turn metadata 和 window ID。两版官方 Codex 的 base instructions 哈希和长度完全相同，平台差异主要进入 UA、会话环境消息和传输层，而不是这份模型 base instructions。

Windows 样本来自 Codex Desktop 发起的 `codex_exec`，Linux 样本来自裸 `codex exec`；它们不能外推为交互式 `codex-tui` 的唯一 UA。真实证据说明官方客户端身份是一个组合：入口表面、版本、OS/架构、终端标签、session/thread/turn 关系、请求体能力和传输画像共同构成，不能只靠固定 UA、`originator`、`version` 三个字段表示。

### 6.6 对当前 Go 方案的直接结论

1. `go-native-v1` 的 TLS 与 HTTP/2 行为在 Windows 和 Docker/Linux 中保持一致，适合作为稳定、诚实的 Go 原生 transport family。
2. 当前 Docker Go 样本在应用层与官方 Codex 差异很大：它主动发送官方样本没有的 `version` 和 `OpenAI-Beta`，同时缺少官方样本实际存在的 session/thread/turn、`client_metadata`、`prompt_cache_key`、工具和 reasoning 结构。
3. 因此“完整身份画像”不应继续定义为 UA 三元组。第一阶段应把 `transport_family=go-native-v1` 与应用协议画像分开，并补齐真实的 session/thread/turn 映射、稳定 prompt cache key、请求能力字段和账号出口绑定。
4. 不应把 Linux Codex 的 TLS JA3 硬编码到 Go。Linux 官方 Codex 与 Go 的 cipher 数量、扩展、ALPN 和 HTTP 版本均不同；伪造部分字段反而会形成互相矛盾的画像。
5. IP/地域应由账号绑定代理决定，并在连接池、HTTP、WS、搜索、压缩和图片请求中共用同一 egress generation。不要伪造客户端 IP；请求里也不应增加与代理出口地域矛盾的时区头。

### 6.7 Codex 0.154.0 与多步 turn-state 实测

为消除 Windows 样本停留在 `0.151.0` 的版本缺口，本轮另行下载 npm `latest` 对应的 `@openai/codex 0.154.0`，没有替换本机已有安装。[OpenAI 官方 changelog](https://learn.chatgpt.com/docs/changelog) 将 `0.154.0` 标为 2026-09-09 发布；源码 tag `rust-v0.154.0` 指向提交 `6b9826e3aa83b1a5947db50f4332cb9c65f1b340`。

使用与 6.5 节相同的脱敏反向代理，向真实 `chatgpt.com` 发起了两组成功请求：

1. 单次模型请求成功并精确返回 `OK`；
2. 模型先生成一次 `exec_command` 调用，客户端形成 `function_call_output` 后再次请求，第二次请求成功完成同一 turn。

`0.154.0` 的单次请求仍使用：

```text
POST /backend-api/codex/responses
User-Agent: Codex Desktop/0.154.0 (Windows 10.0.26200; x86_64) dumb (codex_exec; 0.154.0)
originator: Codex Desktop
```

请求体顶层字段为：

```text
client_metadata, include, input, instructions, model,
parallel_tool_calls, prompt_cache_key, reasoning, store,
stream, text, tool_choice, tools
```

多步请求中的关联字段经截断 SHA-256 后如下；这里只比较相等关系，不保存原始 ID 或状态值：

| 字段 | 第一次请求 | 第一次响应 | 第二次请求 |
| --- | --- | --- | --- |
| `session_id` / `thread_id` / `prompt_cache_key` | `117998612ab01a4e` | - | `117998612ab01a4e` |
| `turn_id` | `c32c2f67f6ed25c4` | - | `c32c2f67f6ed25c4` |
| `root_turn_id` | `c32c2f67f6ed25c4` | - | `c32c2f67f6ed25c4` |
| `x-codex-turn-state` | 不存在 | `808616cbdce3ae47` | `808616cbdce3ae47` |
| `previous_response_id` | 不存在 | - | 不存在 |

这组样本直接证明了以下关系：

- 服务端在首次响应中返回的 `x-codex-turn-state`，被客户端在同一 turn 的下一次请求中原样回显；
- 同一工具 turn 内的 session、thread、prompt cache、turn、root turn 和 window 身份保持不变；
- 根 turn 满足 `root_turn_id == turn_id`；
- 在本次 `store=false` HTTP 工具续接中，客户端没有使用 `previous_response_id`，而是在 `input` 中追加 `function_call` 和 `function_call_output`，并重发完整历史。

首次 `200` 响应还实际包含了 `x-oai-request-id`、`x-codex-turn-state`、`x-models-etag`、套餐/credits，以及 primary/secondary 的 window、used-percent、reset-at、reset-after 等 `x-codex-*` 头。它们是服务端回传的运行状态，不属于客户端身份输入。sub2api 可以据此更新额度快照和 turn-state，但不应把这些响应值预先伪造进请求。

这也暴露出当前 sub2api 的确定不一致：`openai_codex_fingerprint.go` 的 session/full 模式会改写 `turn_id`，但不会同步改写 `root_turn_id`。对上述根 turn，经过当前收敛后会变成新的 `turn_id` 搭配旧的 `root_turn_id`。同类风险还覆盖 `parent_turn_id`、`parent_thread_id`、`forked_from_thread_id` 和 `context_window_id`。这些字段必须作为同一谱系快照映射，不能独立保留旧值。

### 6.8 遥测证据和可下结论的边界

稳定版 `rust-v0.154.0` 源码确认存在两条不同的遥测路径：

- OTLP metrics 默认端点为 `https://ab.chatgpt.com/otlp/v1/metrics`，使用公开的客户端 `statsig-api-key`。通用标签包含 `auth_mode`、`session_source`、`originator`、`service_name`、`model` 和 `app.version`，部分 turn 成本指标还带 `conversation.id`、`turn.id`；
- 产品 analytics 使用带登录认证的 `POST {chatgpt_base_url}/codex/analytics-events/events`。[OpenAI Codex 配置参考](https://learn.chatgpt.com/docs/config-file/config-reference) 明确提供机器或 profile 级 `analytics.enabled` 开关；源码中发送使用独立队列，队列满或 HTTP 失败只记录 warning，不会阻断 Responses 请求。

Windows 0.151.0 与 Linux 0.144.1 的端到端样本都真实观察到 `ab.chatgpt.com` 连接，因此“官方客户端会发送独立 metrics 流量”有源码和网络双重证据。标签又包含会话、客户端和部分 turn 标识，因此技术上可以与模型请求关联。

但现有证据不能证明 OpenAI 服务端把 metrics 或 analytics 用于账号封控、请求放行或客户端真伪判定。客户端源码、公开配置和本地抓包都看不到服务端决策；官方允许关闭 analytics 也说明不能把产品 analytics 当作硬性认证协议。本方案只能把遥测列为画像观察面和待测旁路，不能把“缺少遥测导致风控”写成事实，也不应为了模拟客户端而伪造遥测事件。

### 6.9 稳定版与最新 main 的边界

本轮生产请求使用当前稳定版 `0.154.0`。源码结论必须与未发布的 `main` 分开：

| 行为 | `rust-v0.154.0` | 2026-09-17 检查的 `main`（`3a589370a49ddf197de8e5ae03a92615bcad58bf`） |
| --- | --- | --- |
| 远程压缩 | 保留独立 `CompactClient` 和 `POST /responses/compact` | 独立 `CompactClient` 已删除，remote compaction v2 走普通 `/responses` 流程 |
| turn metadata 的 `analytics_enabled` | 未写入 Responses turn metadata | 已新增并随 Responses metadata 发送 |

因此设计文档可以同时覆盖两种压缩协议，但实现和验收必须按实际客户端版本选择，不能把 `main` 的未发布行为描述成 `0.154.0` 当前行为。

### 6.10 证据充分性判断

| 问题 | 当前证据 | 是否足够进入实现 |
| --- | --- | --- |
| HTTP/SSE 的客户端应用画像 | Windows、Linux、Docker 三来源，加 `0.154.0` 真实生产请求 | 足够 |
| 同一 turn 的工具续接和 `x-codex-turn-state` | `0.154.0` 两次连续真实请求，响应值与下一请求值哈希相等 | 足够 |
| 根 turn 谱系约束 | 真实请求中 flat/embedded 的 `root_turn_id == turn_id`，并有稳定版源码结构佐证 | 足够；已发现当前实现缺口 |
| Go 原生 transport 基线 | Windows 与 Docker/Linux 的 Go TLS、ALPN、HTTP/2 样本 | 足够采用 `go-native-v1` |
| 固定账号出口与时区策略 | 三来源均未发送客户端 IP/时区头，上游可见代理出口 | 足够确定“不伪造 IP、时区随出口配置” |
| Responses WebSocket 的生产状态连续性 | 公开协议、源码和测试较完整，但无真实生产请求 | 足够设计，不足以宣称线上字节级等价 |
| stable/main 压缩差异 | 两个源码 revision 已验证 | 足够设计版本分支；仍缺真实生产 compact 样本 |
| search、images、memory、realtime 配套请求 | 目前主要是源码和协议证据 | 足够做接口分类，不足以冻结真实出站画像 |
| macOS attestation | 只有源码与协议边界，没有 macOS arm64 真机样本 | 不足 |
| 遥测存在且可关联会话 | 源码、官方配置和 `ab.chatgpt.com` 网络连接互相印证 | 足够确认“存在和可关联” |
| 遥测/TLS 是否参与服务端风控 | 客户端侧无法观察服务端判定 | 不足，且不能通过重复抓包直接证明 |
| sub2api 完整链路的一致性 | 尚未对实现后的真实网关做同样的脱敏端到端捕获 | 不足；应作为实现后的验收项 |

继续重复采集相同的普通 HTTP `OK` 请求，证据收益已经很低。后续采样优先级应为：macOS arm64 attestation、Responses WebSocket 多步续接、stable compact、原生 search/image，以及实现后的 sub2api 全链路。服务端风控用途应通过受控 A/B 和长期错误率观察评估，不能从单次请求或客户端源码反推。

本轮脱敏样本保存在：

```text
C:\tmp\codex-tls-capture\linux-docker-openai-2026-09-17-clienthello.jsonl
C:\tmp\codex-tls-capture\windows-app-profile-2026-09-17.jsonl
C:\tmp\codex-tls-capture\linux-docker-app-profile-2026-09-17.jsonl
C:\tmp\codex-tls-capture\windows-app-profile-0154-2026-09-17.jsonl
C:\tmp\codex-tls-capture\windows-app-profile-0154-turn-state-2026-09-17.jsonl
```

服务器端采样进程、一次性容器和 `/dev/shm/codex-real-capture` 已删除；业务容器保持运行，服务器现有 Codex、sing-box 和 Docker 配置均未修改。

## 7. 未覆盖范围

- macOS arm64 Codex Desktop/CLI；
- Linux 交互式 `codex-tui`（本轮覆盖的是 `codex exec`）；
- 真实 sub2api 业务容器的网关、调度和请求转换全链路（本轮 Docker 样本是镜像内一次性 Go 采样程序）；
- OpenAI 生产域名上的 Responses WebSocket、压缩、原生搜索、图片、memory、realtime 和长会话传输；
- 产品 analytics 的真实发送载荷和失败行为；
- 生产 Linux 容器和账号代理出口的 TCP/IP 指纹；
- HTTPS 代理双层 TLS、SOCKS 代理及会终止 TLS 的代理；
- macOS 真实 attestation 和对应登录态相关头；
- OpenAI 服务端是否把 metrics、analytics、TLS 或应用字段用于风控和封控决策。

这些样本需要在不记录 token、Cookie、prompt 或响应正文的前提下另行采集。本轮按用户授权在服务器 `/dev/shm` 启动临时采样代理并运行一次性 Docker 容器；完成后已停止进程、删除容器和整个临时目录。没有安装系统软件、替换服务器 Codex、修改 sing-box 配置或改动现有业务容器。

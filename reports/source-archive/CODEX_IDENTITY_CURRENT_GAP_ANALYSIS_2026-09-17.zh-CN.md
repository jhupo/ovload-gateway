# Codex 真实画像与 sub2api 当前差异分析

> 日期：2026-09-17  
> 范围：OpenAI OAuth/Codex 出站身份、会话谱系、传输、账号出口和辅助请求  
> 性质：证据与现状总结，不是改造实现说明

## 1. 结论

现有证据已经足够支持身份画像和会话投影的主体改造，不需要继续重复采集普通 HTTP 单轮请求后再开始设计。已经能够确定的事实包括：

- 官方 Codex `0.154.0` 的 `/backend-api/codex/responses` 请求身份、主要 body 字段和 HTTP 行为；
- 同一工具 turn 的 session、thread、turn、root、window、prompt cache 和 `x-codex-turn-state` 连续性；
- `store=false` 场景通过完整历史和 `function_call_output` 续接，不依赖 `previous_response_id`；
- Windows、Linux 和 Docker/Go 三类来源的 TLS、ALPN、HTTP 版本和应用层差异；
- 固定账号出口、不伪造客户端 IP、时区跟随账号出口配置的设计边界；
- 当前 sub2api 在 turn 谱系、UA/version、窗口和状态 ownership 上的确定缺口。

证据还不足以证明 OpenAI 是否使用遥测、TLS 指纹或某个应用字段进行风控，也不足以宣称当前 Go 请求可以与官方 Rust 客户端字节级一致。后续设计不依赖这些未经证明的假设。

主体改造前仍需补的不是更多同类样本，而是实现后的 sub2api 全链路抓包。真实 Responses WebSocket 多步续接、stable compact、原生 search/image 和 macOS attestation 样本属于对应功能上线前的专项验收项。

## 2. 证据来源与等级

本分析以以下材料为准：

- `docs/CODEX_TRANSPORT_CAPTURE_2026-09-17.zh-CN.md`：Windows Codex Desktop/exec、Linux `codex exec`、Docker Go、TLS ClientHello、HTTP/WS 和 `0.154.0` 多步 turn-state 实测；
- `docs/CODEX_IDENTITY_EGRESS_PLAN.zh-CN.md`：此前对 session、thread、turn、压缩、搜索、图片和出口网络的协议整理；
- OpenAI Codex `rust-v0.154.0`，提交 `6b9826e3aa83b1a5947db50f4332cb9c65f1b340`；
- 2026-09-17 检查的 OpenAI Codex `main`，提交 `3a589370a49ddf197de8e5ae03a92615bcad58bf`；
- 当前工作区 sub2api 源码。

证据按以下等级使用：

| 等级 | 含义 | 可以支持的结论 |
| --- | --- | --- |
| A | 真实生产请求或响应的脱敏抓包，并有连续请求相互验证 | 当前稳定版线上实际行为 |
| B | 固定 revision 的官方源码、测试或官方文档 | 客户端设计与字段语义 |
| C | 当前 sub2api 源码和测试 | 当前项目实际实现 |
| D | issue、社区抓包或单点现象 | 形成待验证假设，不能单独作为协议事实 |

“服务端为何封控账号”不能从客户端源码或单次抓包直接证明。本文不会把相关推测提升为 A/B 级结论。

## 3. 官方 Codex 的已验证基线

### 3.1 应用身份

Windows Codex `0.154.0` 对真实生产 `/responses` 请求发送：

```text
User-Agent: Codex Desktop/0.154.0 (Windows 10.0.26200; x86_64) dumb (codex_exec; 0.154.0)
originator: Codex Desktop
```

该样本没有发送 `version`，也没有发送 `OpenAI-Beta`。因此不能再把 `User-Agent + originator + version` 视为所有 Codex 路由统一必需的三元组。正确模型应是：由一个规范 profile 提供字段值，再由每个 endpoint 的明确契约决定实际发送哪些字段。

`0.154.0` 请求体顶层实测字段为：

```text
client_metadata, include, input, instructions, model,
parallel_tool_calls, prompt_cache_key, reasoning, store,
stream, text, tool_choice, tools
```

这些是该版本和该请求能力下的实际集合，不代表所有操作都必须机械补齐相同字段。

### 3.2 session、thread、turn 和 window

同一工具 turn 的两次真实请求证明：

- `session_id`、`thread_id` 和 `prompt_cache_key` 保持不变；
- `turn_id` 和 `root_turn_id` 保持不变；
- 根 turn 满足 `root_turn_id == turn_id`；
- window 身份在同一 turn 内保持不变；
- 第一次响应返回的 `x-codex-turn-state` 在第二次请求中原样回显；
- `store=false` 的工具续接没有使用 `previous_response_id`，而是追加 `function_call` 和 `function_call_output` 后重发历史。

这说明这些字段构成一张有关联约束的谱系，不能按字段独立随机生成或只改写其中一部分。

### 3.3 响应状态

首次成功响应实测包含 `x-codex-turn-state`、`x-oai-request-id`、`x-models-etag`、套餐/credits，以及 primary/secondary 额度窗口头。它们是服务端返回的运行状态：

- `x-codex-turn-state` 可在同账号、同 turn 的下一请求中回显；
- 额度头可用于刷新账号快照；
- 这些值不能在请求前凭空构造；
- 状态归属必须至少绑定 credential、thread、turn 和 profile/egress generation。

### 3.4 传输与出口

实测支持以下结论：

- 官方 Rust Codex 与 Go 原生 TLS 在 cipher、扩展、ALPN 和 HTTP 行为上不同；
- Windows 与 Docker/Linux 的 Go 样本足够定义稳定 `go-native-v1` transport family；
- 只复制 JA3/JA4 或部分 TLS 字段会形成互相矛盾的画像；
- 官方样本没有通过应用请求伪造客户端 IP 或任意时区头；
- 上游看到的网络位置应由账号绑定的直连出口或代理出口决定；
- HTTP、SSE、WS、compact、search 和 image 必须共享同一账号出口快照。

因此第一阶段应使用稳定、可解释的 Go 原生传输画像，不模拟 Codex Rust TLS。

### 3.5 遥测和 attestation

官方源码与网络样本证明 Codex 存在独立 metrics/analytics 流量，且部分标签能关联 session 或 turn。但目前没有证据证明该流量参与请求放行或账号风控。产品 analytics 允许关闭，发送失败也不会阻断 Responses 请求。

当前项目的 live attestation 依赖 Apple Silicon macOS 和官方 ChatGPT App。Linux/Docker 不能真实生成该 token。正确边界是：只透传或调用真实宿主提供的 opaque attestation，不在 Linux 服务器伪造。

### 3.6 stable 与 main 的版本边界

| 行为 | `rust-v0.154.0` | 2026-09-17 的 `main` |
| --- | --- | --- |
| 远程压缩 | 独立 `POST /responses/compact` | remote compaction v2 走普通 `/responses` |
| `analytics_enabled` | 不在 Responses turn metadata 中 | 已加入 turn metadata |

实现必须通过明确的客户端能力版本选择协议，不能把未发布 `main` 行为当作 stable fallback。

## 4. 当前 sub2api 的实现

### 4.1 UA 和版本

当前编译期默认值位于 `backend/internal/service/openai_gateway_service.go`：

```text
codex-tui/0.146.0 (Ubuntu 22.4.0; x86_64) xterm-256color
originator: codex-tui
version: 0.146.0
```

`backend/internal/service/openai_codex_identity.go` 会把解析出的 `User-Agent`、`originator` 和 `version` 作为固定三元组应用到推理请求；合成探测还会补：

```text
OpenAI-Beta: responses=experimental
```

系统设置同时存在：

```text
openai_codex_user_agent
openai_codex_client_version
openai_codex_client_version_synced
openai_codex_version_auto_sync_enabled
```

账号 credentials 还可以通过 `GetOpenAIUserAgent()` 提供账号级 UA override；shadow 与母账号同时有值时又有一层选择顺序。因此当前实际来源包括账号 override、系统完整 UA、手动版本、同步版本和编译期默认值。

虽然当前解析器会尝试保持 UA 内部版本和 `version` 一致，但这些来源没有形成一个带 generation 的原子 profile，且真实 `0.154.0 /responses` 本身不发送 `version`。统一客户端身份时应由系统 profile policy 唯一决定客户端模板，账号只保留 installation、会话投影和出口差异。

### 4.2 已有账号命名空间和 attempt 快照

`backend/internal/service/openai_codex_account_identity.go` 和 `backend/internal/service/openai_codex_attempt_identity.go` 已经提供了比旧指纹模式更合理的部分基础：

- shadow 会先解析到真实 credential account；
- API key、credential namespace 和入站原始 ID 共同参与确定性映射；
- 同一 selected account attempt 内的客户端身份是不可变快照；
- 同账号 transport retry 会复用该快照；
- HTTP body、headers、embedded metadata 和 prompt cache 已有统一改写入口。

这部分仍不是完整 projection：

- 生命周期主要绑定当前请求的 `gin.Context`；
- 映射字段列表仍不包含 root、parent、fork 和 context window；
- 字段按 `kind + raw value` 分别派生，无法验证整个谱系关系；
- 与旧 fingerprint 模式叠加后，后者仍可能覆盖为随机 turn；
- 没有 profile/egress generation，也没有跨实例 ownership。

重构时应把这两处职责并入统一 envelope 和 projection store，保留 credential namespace 与 attempt 不可变快照的原则，不再在其上叠加另一层指纹改写。

### 4.3 指纹收敛

`backend/internal/service/openai_codex_fingerprint.go` 提供：

```text
off / device / session / full
```

当前 `session/full` 行为存在确定问题：

- 每次请求创建新的 `turn_id`；
- `window_id` 固定为 `thread_id:0`；
- 没有持久 session/thread/turn projection；
- 只改写 installation、session、thread、turn 和 window 的部分载体；
- 不同步映射 `root_turn_id`、`parent_turn_id`、`parent_thread_id`、`forked_from_thread_id`、`context_window_id`。

对实测根 turn，当前代码会产生“新 `turn_id` + 旧 `root_turn_id`”，直接破坏 `root_turn_id == turn_id`。这不是画像精度不足，而是谱系约束错误。

### 4.4 `instructions` 和系统消息

当前 `backend/internal/service/openai_codex_transform.go` 的行为是：

- 把入站 `role=system` 文本提升到 `instructions`，并按转换路径保留为 `developer` 或无损移除；
- 合成 Responses 请求在 `instructions` 为空时，调用 `CodexBaseInstructionsForModel` 自动补对应模型的 Codex base instructions；
- GPT-6 Astra、GPT-5.6、GPT-5.5、GPT-5.2 和 GPT-5.1 已有独立 prompt family；
- prompt registry 意外为空时回退到通用 `You are a helpful coding assistant.`；
- 原始 passthrough 路径跳过默认 prompt 注入，并对显式空或非字符串 `instructions` 做拒绝检查。

真实 `0.154.0` 样本确认官方请求包含 `instructions`，官方源码也能提供版本化 base prompt。现有“合成请求按模型自动补全、passthrough 保留客户端原值”的方向可以保留；通用占位提示词和未固定上游 revision 的 prompt 更新不够严谨。`instructions` 属于模型/endpoint capability，不属于安装身份或网络指纹，后续应单独版本化和测试。

### 4.5 turn-state

`backend/internal/service/openai_codex_turn_state.go` 已具备以下正确基础：

- 转发响应中的 `x-codex-turn-state`；
- 记录状态由哪个账号铸造；
- failover 时剥离已知属于其他账号的状态；
- 对并发完成顺序做了有限处理。

当前不足是：

- provenance 只在进程内；
- key 主要由 API key、客户端 session 和 state hash 组成；
- 没有统一 credential/thread/turn/operation ownership；
- 进程重启或跨实例后不能完整恢复归属；
- 与 response ID、WS lane、compact 和工具续接的归属不是同一个状态模型。

### 4.6 出口、代理和 TLS

当前已有可用基础：

- 账号可绑定代理；
- shadow 账号继承母账号代理；
- HTTP/WS 和 TLS profile 基础设施；
- 默认 `account_proxy` 连接池隔离；
- 代理质量和出口信息探测；
- quota reset timezone 配置。

当前缺少：

- 账号级 `egress_generation`；
- proxy/direct route、UA profile、TLS family、locale/timezone 的原子快照；
- 代理变更后对旧连接、旧 turn-state 和旧 response ownership 的统一失效；
- 出站身份 timezone 与 quota reset timezone 的语义分离；
- OpenAI/Codex 默认 transport family 的唯一、可观测选择。

quota reset timezone 只解释额度重置展示，不等于客户端所在地，也不能代替账号出口 timezone。

### 4.7 协议路径

当前仓库已有较完整的功能基础：

- Responses HTTP/SSE；
- Responses WebSocket v2、连接池、lane 和重连；
- `/responses/compact`；
- `/v1/alpha/search` 专用请求构造；
- hosted search/image、独立 Images API、模型清单、额度和探测；
- 响应头额度解析；
- 多种 Chat/Responses/Anthropic 协议转换。

核心差距不是“缺少这些 endpoint”，而是各路径没有从同一份不可变的 account profile、egress snapshot 和 operation ownership 出发。协议转换、重试和 failover 后可能重新推断身份或重新生成 ID，导致一条逻辑请求在不同路径上的归属不一致。

## 5. 差异矩阵

| 维度 | 官方/目标约束 | 当前项目 | 判断 | 影响 |
| --- | --- | --- | --- | --- |
| `/responses` 头 | `0.154.0` 实测为 UA + originator | 统一补 UA + originator + version；探测补 Beta | 确定不一致 | 应改为 endpoint contract |
| UA 来源 | 一个完整客户端 profile | 账号 override、完整 UA、手动版本、同步版本和编译期值共同解析 | 结构缺口 | 更新时不能原子切换 |
| turn ID | 同一工具 turn 保持不变 | session/full 每请求随机生成 | 确定错误 | 续接身份漂移 |
| root turn | 根 turn 中 root 等于 turn | 改 turn、不改 root | 确定错误 | 谱系自相矛盾 |
| parent/fork | 全部引用同一映射命名空间 | 未整体投影 | 确定缺口 | 分叉/续接可能串线 |
| window | 随 context window 生命周期变化 | 固定 `thread:0` | 确定缺口 | 压缩后仍表现为旧窗口 |
| prompt cache | 同线程/窗口稳定 | 没有统一 projection 作为唯一来源 | 结构缺口 | 缓存命中不稳定 |
| `instructions` | passthrough 保留；合成路径按已验证模型 family 补全 | 已按模型补全，但未知 family 使用通用占位符 | 部分正确 | prompt 来源需要版本化 |
| turn-state | 同 credential + turn 回显 | 有账号 provenance，但仅进程内 | 部分正确 | 重启/多实例归属丢失 |
| response ownership | 与账号、thread、turn、lane 绑定 | 多处 sticky/state 各自维护 | 结构缺口 | failover/WS 容易混用状态 |
| 出口 | 账号固定 route/generation | 有账号代理，无 egress generation | 部分正确 | 代理切换后旧连接仍可能复用 |
| 时区 | 与账号出口配置同源 | 只有 quota reset timezone 等分散概念 | 确定缺口 | 地域画像无法审计 |
| TLS | 稳定、诚实的 transport family | TLS profile 可配置，默认路径不够统一 | 结构缺口 | HTTP/WS 可能呈现不同族 |
| compact | stable/main 能力明确选择 | 现有 compact/fallback 路径较多 | 需收束 | 不能把两代协议混作 fallback |
| search/image | 继承账号 profile/egress，并有 operation 归属 | endpoint 已有，ownership 分散 | 结构缺口 | 辅助请求可能脱离父 turn |
| 遥测 | 独立、可关闭、用途未知 | 不模拟官方产品 analytics | 当前边界正确 | 不应为“补画像”伪造 |
| attestation | 只接受真实 Apple 宿主 token | 平台实现仅支持真实 macOS 条件 | 当前边界正确 | Linux 不应伪造 |

## 6. 可以保留的能力

改造不需要重写整个网关。以下基础应保留并接入统一模型：

- 账号代理绑定、shadow 继承和代理质量探测；
- HTTP upstream、WebSocket v2、连接池和 lane 基础设施；
- 账号并发、额度响应头解析和调度器；
- turn-state 的响应提取、账号 provenance 和跨账号剥离原则；
- credential namespace、账号来源解析和 attempt 不可变快照；
- 合成路径按模型补全 Codex base instructions，并无损提升系统消息；
- `/responses/compact`、alpha search、image、models 和 probe 的 endpoint 实现；
- Chat/Responses/Anthropic 的协议转换能力；
- TLS profile 服务，但 Codex 默认选用稳定 `go-native-v1`；
- 敏感信息脱敏和现有请求日志设施。

需要替换的是这些能力上方的身份、谱系和 ownership 模型，而不是它们各自的协议功能。

## 7. 必须修复的确定问题

以下问题已有 A+C 或 B+C 级证据，可直接进入实现：

1. 删除每请求随机 `turn_id` 的行为，同一逻辑 turn 必须复用同一投影。
2. 将 root、parent、fork、context window 作为整体映射，禁止只改写 `turn_id`。
3. 删除固定 `thread_id:0` 窗口，压缩成功后创建新 context window。
4. `/responses` 不再全局强制发送 `version` 和 `OpenAI-Beta`；由 endpoint contract 控制。
5. 将 UA、originator、版本、平台和 locale 编译成一个不可变应用 profile generation。
6. 将 proxy/direct route、出口地域、timezone 和 transport family 归入一个 egress generation。
7. 把 turn-state、response ID、WS lane、compact 和工具续接统一到 operation ownership。
8. 让 HTTP、SSE、WS、compact、search、image、models 和 probe 使用同一个 profile/egress snapshot。
9. 删除 `off/device/session/full` 四套运行语义，切换为唯一 projection 模型。

## 8. 不能据此下结论的事项

以下内容仍是未知项，不能写进业务规则：

- “没有官方遥测就会被封号或降权”；
- “某个 JA3/JA4 一定是风控条件”；
- “伪造 macOS UA 就必须同时伪造 attestation”；
- “所有官方版本和平台都发送完全相同的 header/body”；
- “未发布 main 的 remote compaction v2 已在线上替代 stable compact”；
- “Responses WebSocket 在线上与本地源码测试字节级一致”；
- “某个 429/502/503 单独证明身份画像被识别”。

这些问题只能通过受控 A/B、长期错误率、专项平台样本或服务端公开资料继续评估。

## 9. 改造输入条件

开始改造时应固定以下输入：

- 首个目标协议版本为 `rust-v0.154.0` stable；
- transport family 为 `go-native-v1`；
- profile 与 egress 采用 generation 快照，活动 turn 不热切换；
- 下游 API key/user scope 与上游 credential account 分开建模；
- 所有外部 ID 只存 hash 或加密值，日志只输出截断摘要；
- 旧四档指纹模式和旧多来源 UA 设置不进入新运行时；
- stable compact 与未来 remote compaction v2 用能力枚举选择，不做静默 fallback；
- 实现后必须重复现有脱敏抓包流程，验证真正经过 sub2api 的全链路。

具体表结构、请求顺序、删除范围、迁移和验收见独立文档：

`docs/CODEX_IDENTITY_REFACTOR_PLAN_2026-09-17.zh-CN.md`

# Codex 统一身份画像与行为轨迹改造方案

> 日期：2026-09-17  
> 目标基线：OpenAI Codex `rust-v0.154.0` stable  
> 传输基线：`go-native-v1`  
> 性质：独立实施方案

## 1. 目标

本方案把当前分散在 UA、指纹收敛、sticky、turn-state、WS、compact、search、image 和代理路径中的状态，收束为一条统一请求生命周期：

```text
下游逻辑会话
  -> operation 分类
  -> 上游账号选择
  -> identity/profile generation 快照
  -> egress generation 快照
  -> session/thread/turn projection
  -> endpoint contract 渲染
  -> HTTP/WS transport
  -> response/turn-state ownership 落库
```

改造后的核心性质是：同一账号对上游保持稳定的客户端画像和出口；不同下游用户仍拥有独立的 session/thread/turn；同一逻辑 turn 的重试、工具续接、压缩和 WS lane 使用同一组投影；账号切换时不携带旧账号的 opaque 状态。

本方案不保留 `off/device/session/full` 四套旧语义，不保留旧 UA 多来源运行时，也不增加新旧双轨或兼容 fallback。开发可以分阶段完成，但生产只进行一次完整切换。

## 2. 设计原则

1. **一个应用 profile 来源**：UA、originator、Core 版本、clientInfo、平台、架构和 locale 必须由同一个规范 profile 产生。
2. **endpoint 决定发送字段**：profile 提供值，endpoint contract 决定是否发送；不能全局强补 `version` 或 `OpenAI-Beta`。
3. **账号画像稳定、用户会话隔离**：多个下游用户可以共用账号画像和出口，但不能共用同一个 thread/turn。
4. **谱系整体映射**：session、thread、turn、root、parent、fork、window 和 prompt cache 作为有约束的图映射。
5. **状态有明确 owner**：turn-state、response ID、WS lane 和 compact 结果必须归属 credential + projection + generation。
6. **出口是画像的一部分**：代理、直连路由、出口地域、timezone 和连接池代次一起快照。
7. **Go 原生传输**：第一版固定 `go-native-v1`，不局部模仿 Rust TLS 或 macOS attestation。
8. **未知项不进入规则**：不根据遥测、JA3 或社区推测增加伪造字段。
9. **失败要显式**：无法安全续接时返回可诊断错误，不猜测旧 turn 或跨账号回放 opaque 状态。
10. **一次切换**：数据库迁移、后端、前端和配置删除在同一发布完成。

## 3. 目标架构

### 3.1 核心组件

新增六个逻辑组件：

| 组件 | 职责 |
| --- | --- |
| `CodexOperationClassifier` | 在协议转换前识别 generate、continue、compact、search、image、models、probe 等操作 |
| `CodexProfileCompiler` | 将 managed/custom 配置编译为不可变 identity profile |
| `CodexEgressResolver` | 为 credential account 解析固定 route、proxy、timezone 和 egress generation |
| `CodexProjectionStore` | 原子创建和读取 session/thread/turn/window 投影 |
| `CodexOwnershipStore` | 维护 operation、response、turn-state、WS lane 和账号归属 |
| `CodexEndpointRenderer` | 按 endpoint contract 从同一快照生成 headers、metadata 和 body |

现有 scheduler、HTTP upstream、WS v2、compact、search、image 和协议转换继续使用，但只能消费上述组件生成的 `CodexOperationEnvelope`，不能自行重新计算身份字段。

现有 `openai_codex_account_identity.go` 的 credential namespace 和 `openai_codex_attempt_identity.go` 的 attempt 不可变快照应直接演进为 projection/envelope 的输入。新实现不能保留“account identity 一层、fingerprint 一层、endpoint 再补一层”的叠加改写。

### 3.2 多用户和账号的关系

系统 profile policy 是所有 Codex OAuth 账号唯一的客户端模板来源。不同账号使用相同 UA、originator、平台和能力模板，但各自拥有 installation、会话投影和出口。账号级任意 UA override 被删除。

多名下游用户使用同一个 OAuth 账号时，上游看到：

- 相同的 installation/profile generation；
- 相同的 UA、originator、平台、locale 和 transport family；
- 相同的固定账号出口、出口地域和 egress generation；
- 不同的 session/thread/turn projection；
- 各自稳定的 prompt cache/window 轨迹；
- 不会互相使用对方的 response ID 或 turn-state。

因此“统一客户端身份”不等于把所有请求压成同一个 session。账号级稳定字段与用户级会话字段必须分层。

## 4. 统一运行对象

每个上游 attempt 在调度完成后生成一次不可变对象：

```go
type CodexOperationEnvelope struct {
    OperationID          UUID
    Kind                 CodexOperationKind
    EndpointContract     CodexEndpointContract

    ClientScopeHash      []byte
    LogicalSessionHash   []byte
    LogicalThreadHash    []byte
    LogicalTurnHash      []byte

    RoutedAccountID      int64
    CredentialAccountID  int64
    ProfileID            UUID
    PolicyGeneration     int64
    ProfileGeneration    int64
    EgressRouteID        UUID
    EgressGeneration     int64

    SessionProjectionID  UUID
    ThreadProjectionID   UUID
    TurnProjectionID     *UUID
    WindowNumber         int

    Transport            CodexTransportKind
    WSLaneID             *string
    Replayability        Replayability
    AttemptedCredentials []int64
}
```

约束：

- envelope 在一次 attempt 内只创建一次；
- header、body、flat metadata、embedded turn metadata、日志和 ownership 都读取同一 envelope；
- retry 不重新分类逻辑请求；
- 同账号 retry 复用 projection；
- 跨账号 retry 创建新账号命名空间的 projection，并清除旧账号 opaque state；
- `AttemptedCredentials` 阻止 scheduler 把同一 operation 立即分回已经失败的账号。

## 5. 数据模型

### 5.1 `codex_identity_profiles`

账号的不可变客户端身份代次：

| 字段 | 说明 |
| --- | --- |
| `id` | profile UUID |
| `credential_account_id` | 实际持有 OAuth 凭据的账号；shadow 指向母账号凭据命名空间 |
| `generation` | 账号内单调递增 |
| `policy_generation` | 当前系统 profile policy 的不可变代次 |
| `source` | `managed` 或 `custom` |
| `client_family` | 例如 `codex-tui`、`Codex Desktop` |
| `core_version` | UA 主版本 |
| `client_info_name/version` | UA 尾部 clientInfo，允许为空 |
| `os_family/os_version/arch/terminal` | 规范化的平台字段 |
| `user_agent` | 编译后的完整 UA |
| `originator` | 从同一 UA profile 推导 |
| `locale` | 账号应用 locale，例如 `en-US` |
| `installation_id` | 账号 profile 稳定 installation ID |
| `capabilities` | stable compact、WS、search/image 等明确能力集合 |
| `created_at/retired_at` | 代次生命周期 |

约束：

- 唯一键 `(credential_account_id, generation)`，并保证每个账号对同一 `policy_generation` 只有一条记录；
- 同一账号只有一个未 retired profile；
- 表中记录一经启用不可原地修改，设置变化创建下一 generation；
- profile generation 更新默认复用原 installation ID；只有 credential 身份明确变化时才创建新 installation；
- `user_agent`、`originator`、版本和 clientInfo 必须通过同一 parser/compiler 校验；
- profile 不存 token、Cookie 或 attestation。

### 5.2 `codex_egress_snapshots`

账号的不可变网络出口代次：

| 字段 | 说明 |
| --- | --- |
| `id` | egress route UUID |
| `credential_account_id` | 凭据账号 |
| `generation` | 账号内单调递增 |
| `route_kind` | `direct` 或 `proxy` |
| `proxy_id` | 代理路由，直连为空 |
| `exit_ip_hash` | 最近确认出口 IP 的带盐 hash |
| `country/region/city` | 出口探测结果 |
| `timezone` | 自动推导或管理员确认的 IANA timezone |
| `timezone_source` | `proxy_probe`、`direct_probe` 或 `manual` |
| `transport_family` | `go-native-v1` |
| `pool_namespace` | 连接池隔离 key 的稳定部分 |
| `created_at/retired_at` | 代次生命周期 |

proxy/direct route、TLS family 或出口 timezone 变化都创建新 generation。旧连接池按旧 generation 排空，不能接收新 operation。

### 5.3 `codex_session_projections`

将下游逻辑 session 映射到某个账号代次下的上游 session：

| 字段 | 说明 |
| --- | --- |
| `id` | projection UUID |
| `client_scope_hash` | API key/user scope 的带盐 hash |
| `logical_session_hash` | 入站稳定 session key 的带盐 hash |
| `credential_account_id` | 上游凭据账号 |
| `profile_generation` | 固定身份代次 |
| `egress_generation` | 固定出口代次 |
| `upstream_session_id` | 网关生成的 UUID |
| `created_at/last_seen_at/expires_at` | 生命周期 |

唯一键：

```text
(client_scope_hash, logical_session_hash, credential_account_id,
 profile_generation, egress_generation)
```

原始 API key、token 和完整 session ID 不落日志。数据库中如需可逆值必须加密；仅用于匹配时存 hash。

### 5.4 `codex_thread_projections`

| 字段 | 说明 |
| --- | --- |
| `id` | projection UUID |
| `session_projection_id` | 所属 session |
| `logical_thread_hash` | 下游逻辑 thread key |
| `upstream_thread_id` | 上游 thread UUID |
| `parent_thread_projection_id` | 父 thread，可空 |
| `forked_from_thread_projection_id` | fork 来源，可空 |
| `prompt_cache_key` | 当前 thread/window 的稳定 cache key |
| `current_window_number` | 从 0 单调递增 |
| `current_context_window_id` | 当前 context window UUID |
| `created_at/last_seen_at/expires_at` | 生命周期 |

根 thread 的初始关系按 `0.154.0` 验证规则生成；parent/fork 只能引用同 credential/profile/egress 命名空间内的 projection。

### 5.5 `codex_turn_projections`

| 字段 | 说明 |
| --- | --- |
| `id` | projection UUID |
| `thread_projection_id` | 所属 thread |
| `logical_turn_hash` | 下游逻辑 turn key |
| `upstream_turn_id` | 上游 turn UUID |
| `root_turn_projection_id` | root turn；根 turn 指向自身 |
| `parent_turn_projection_id` | 父 turn，可空 |
| `context_window_id` | 创建时固定的 window |
| `state` | `active/succeeded/failed/cancelled/expired` |
| `created_at/last_seen_at/expires_at` | 生命周期 |

约束：

- 根 turn 的 `root_turn_projection_id == id`；
- 渲染后的根 turn满足 `root_turn_id == turn_id`；
- 工具续接、同请求 retry 和 WS reconnect 复用同一 turn projection；
- 新用户消息创建新 turn；
- 所有 parent/root 引用必须属于同一 thread namespace；
- turn TTL 到期后不猜测恢复。

### 5.6 `codex_operation_ownership`

该表统一当前分散的 sticky、turn-state 和 response ownership：

| 字段 | 说明 |
| --- | --- |
| `operation_id` | 网关 operation UUID |
| `kind` | generate/continue/compact/search/image 等 |
| `credential_account_id` | 状态铸造账号 |
| `profile_generation/egress_generation` | 状态铸造代次 |
| `thread_projection_id/turn_projection_id` | 逻辑归属 |
| `transport` | HTTP/SSE/WS |
| `connection_id/lane_id` | WS 时记录，其他为空 |
| `upstream_response_id_hash` | 上游 response ID hash |
| `turn_state_hash` | `x-codex-turn-state` hash |
| `encrypted_turn_state` | 需要回显时加密存储 |
| `status` | active/terminal/unknown/cancelled |
| `expires_at` | 状态 TTL |

热点 ownership 可缓存在 Redis，但数据库或共享存储必须是多实例的权威来源。内存缓存只加速，不决定跨账号安全。

## 6. profile 配置和 UI

### 6.1 单一 profile 编译器

系统设置只保留一个“Codex 客户端身份”对象，提供两种输入方式：

- `managed`：默认。选择客户端模板，Core 版本跟随已验证的最新 stable；同步成功后编译完整新 profile generation。
- `custom`：管理员填写完整 UA；parser 从 UA 推导 originator、Core 版本、平台和 clientInfo，版本不会再被自动替换。

这不是两套运行逻辑。两种输入都必须先编译成同一个 system profile policy generation，再为每个 credential account 生成同代次 `codex_identity_profiles` 记录。网关只读取编译结果。运行时不存在“先读账号 UA，再读完整 UA，失败再读版本，最后回退常量”的链。

系统 policy 变更时，先为所有可用 credential account 生成候选 profile；全部校验成功后再原子切换 active `policy_generation`。这样不会出现一部分账号使用新 UA、另一部分账号仍使用旧 UA 的窗口。

UI 应显示：

- 当前 source、完整 UA、originator、Core/clientInfo 版本；
- transport family、profile generation 和启用时间；
- managed 模式的最新 stable 版本和上次同步状态；
- custom 模式的解析预览和校验错误；
- endpoint contract 摘要，例如 `/responses` 不发送 `version`。

账号编辑页删除“Codex 指纹收敛”四档选择和账号级 UA override，只显示当前 policy/profile generation、installation 摘要、固定出口、timezone 和 projection 健康状态。

### 6.2 自动版本更新

managed 模式的更新顺序：

1. 后台任务获取官方 stable 版本；
2. 校验版本格式和允许的发布渠道；
3. 使用选定模板为所有 credential account 编译完整候选 profile；
4. 执行 fixture/contract 自检，并确认每个账号都有候选记录；
5. 原子切换 active policy generation；
6. 新 session/turn 使用新 generation，活动 turn 在 TTL 内保持原 generation；
7. 旧 generation 无活动 ownership 后 retired。

不能只替换 UA 中的数字，也不能让 Core 版本和 clientInfo 版本分别更新。

## 7. egress 和 timezone

### 7.1 固定路由

每个 credential account 必须有一个 active egress snapshot：

- 绑定代理时，HTTP、SSE、WS、compact、search、image、models、quota、OAuth refresh 和 probe 都使用同一 proxy route；
- 未绑定代理时，使用该服务节点的固定 direct route；
- 禁止在请求级随机选择出口；
- shadow 账号复用母账号 credential 和 egress namespace；
- proxy 变更创建下一 generation，并关闭旧 generation 的空闲连接。

连接池 key 至少包含：

```text
credential_account_id
profile_generation
egress_generation
target_host
transport_family
protocol_capability
```

### 7.2 IP 与来源头

- 不向 OpenAI 发送下游 `X-Forwarded-For`、`X-Real-IP`、`Forwarded` 或伪造客户端 IP；
- 上游实际看到的 IP 由直连或代理决定；
- 日志记录 route ID、generation 和脱敏出口摘要，不记录代理凭据；
- 本地 search provider 如果使用不同出口，必须记录 `effective_search_route_id`，不能冒充 hosted search。

### 7.3 timezone 和 locale

- timezone 默认从代理/direct 出口探测结果推导；
- 管理员可明确覆盖，但必须记录 `timezone_source=manual`；
- locale 是 profile 属性，默认选择与出口地区合理匹配的稳定值；
- timezone 只写入官方协议已有的位置，不发明 `X-Timezone` 等请求头；
- quota reset timezone 继续只服务额度展示，与出站身份 timezone 分开命名和存储。

## 8. 请求处理顺序

所有入口使用相同顺序：

1. **读取原始请求**：限制大小，提取 transport、endpoint 和必要的入站 session/thread hints。
2. **分类 operation**：在 Chat/Responses/Anthropic 转换前生成稳定 `operation_id` 和 `kind`。
3. **生成 client scope**：使用 API key/user ID 与入站稳定会话标识计算 hash；不使用 IP 作为用户身份。
4. **解析逻辑谱系**：识别 root、parent、fork、continue、compact 和工具续接关系。
5. **调度账号**：sticky ownership 优先；新 operation 才进行普通调度。
6. **解析 credential**：shadow 路由统一到真实 credential account。
7. **获取快照**：一次读取 active identity profile 和 egress snapshot。
8. **原子获取 projection**：通过唯一约束和事务创建 session/thread/turn/window。
9. **构建 envelope**：后续步骤只传 envelope，不传散落 ID。
10. **协议转换**：转换器保留 operation 和 projection，不重新推断。
11. **endpoint 渲染**：统一写 UA、originator、metadata、cache key 和谱系字段。
12. **获取并发槽与连接**：按 credential + generation 选择 HTTP/WS transport。
13. **发送并处理响应**：在首个语义响应、turn-state 或 response ID 出现时建立 ownership。
14. **提交终态**：更新 usage、window、operation status 和 TTL；仅 terminal success 推进 compact window。

## 9. endpoint contract

### 9.1 Responses HTTP/SSE

- 使用 envelope 中的 profile、session/thread/turn/window；
- OAuth `/backend-api/codex/responses` 按 stable `0.154.0` contract 发送 UA 和 originator；
- 不发送全局 `version` 或 `OpenAI-Beta`；
- 原始 passthrough 的非空 `instructions` 原样保留，不替换为网关身份提示词；
- Chat/Messages 等合成路径在缺少 `instructions` 时，按映射后的模型 family 自动补入固定官方 revision 的 Codex base instructions；
- system/developer 内容必须无损提升，不能重复拼接或改变顺序；
- 未映射到已验证 prompt family 的合成模型直接报配置错误，不使用 `You are a helpful coding assistant.` 等通用占位符；
- body、flat metadata 和 embedded turn metadata 引用同一 projection；
- 同一工具 turn 的下一请求回显同 owner 的 `x-codex-turn-state`；
- `store=false` 不凭空构造 `previous_response_id`。

### 9.2 Responses WebSocket

- WS 握手和帧内 operation 使用同一 profile/egress generation；
- `(connection_id, lane_id)` 对应一个 active operation owner；
- 同 lane FIFO，不同 lane 允许交错；
- Ping/Pong 不创建 turn、不占模型 operation 槽；
- reconnect 只在相同 credential/profile/egress namespace 内恢复；
- 无归属帧、乱序终态或未知 response ID 使连接退出连接池；
- 在真实生产多步 WS 抓包完成前，只宣称协议实现符合源码约束，不宣称字节级等价。

### 9.3 compact

能力枚举只允许显式选择：

```text
compact_v1_endpoint       # stable 0.154.0: /responses/compact
remote_compaction_v2      # 对应明确支持该能力的未来版本
```

- stable profile 只使用 `compact_v1_endpoint`；
- v2 不作为 v1 失败后的 fallback；
- compact 继承 thread、profile 和 egress；
- terminal success 且返回恰好一个合法 compaction item 后，事务性增加 window number 并创建新 context window ID；
- compact response ID 不写成普通 generation 的 `last_response_id`；
- compact 失败不推进窗口。

### 9.4 search

- Responses hosted `web_search` 属于当前 turn，继承当前账号出口；
- `/v1/alpha/search` 创建 search 子 operation，继承父 thread/profile/egress，但使用专用 body contract；
- alpha search 不携带 Responses 专用 turn-state、prompt cache 或 response chain 字段；
- 本地 search emulation 使用独立 provider route，并在 ownership 中记录父 operation 和实际出口；
- 搜索 location、locale 和 timezone 从同一 profile/egress snapshot 解析。

### 9.5 image

- Responses hosted image generation 属于当前 turn；
- 独立 Images API 创建 image 子 operation，继承 credential/profile/egress；
- batch/异步 image task 一旦上游接受，后续轮询固定原账号和 generation；
- input image、tool output image 和生成图片在协议转换中保持顺序、引用和 detail；
- 图片 keepalive 不创建新 turn，也不作为首个语义输出。

### 9.6 models、quota、auth 和 probe

- models、quota 和 auth 使用相同 active profile/egress snapshot，但各自拥有专用 header/body contract；
- `client_version` 只在该 endpoint 的官方 schema 明确需要时从 profile 读取，不能演变成全局 `version` header；
- OAuth refresh 和 whoami 使用 UA + originator 的凭据面 contract；
- probe 使用独立 diagnostic operation 和专用 projection，不伪装成普通用户 thread；
- probe 不能补官方 stable 样本不存在的实验 header。

## 10. failover、重试和状态清理

### 10.1 同账号重试

以下情况可在相同 credential/profile/egress namespace 内复用 projection：

- 发送前的本地连接失败；
- 明确可重试且响应尚未建立 terminal ownership；
- WS reconnect；
- 同一工具 turn 的客户端继续请求。

重试次数、退避和并发槽由现有策略控制，但 retry 不创建新 turn ID。

### 10.2 跨账号 failover

跨账号时必须：

1. 将旧 credential 加入 envelope 的 attempted set；
2. scheduler 排除本 operation 已失败账号，防止再次分回形成循环；
3. 选择新 credential 后获取新的 profile/egress snapshot；
4. 在新账号命名空间创建 session/thread/turn projection；
5. 删除旧账号 `x-codex-turn-state`、response ID、connection/lane 和 opaque cache state；
6. 只有请求包含可重放完整历史时才重建；
7. 无法重放时结束 operation，并返回明确错误。

下游可以继续使用同一个逻辑 thread，但两个账号对应不同的上游 projection。不得让一个上游 thread ID 在多个 credential namespace 中复用。

### 10.3 ownership 建立后的限制

出现以下任一信号后，operation 已有上游 owner：

- `x-codex-turn-state`；
- 上游 response ID；
- 首个模型语义事件；
- tool call；
- compact/image/search task ID。

owner 建立后，取消、轮询、工具输出和续接都先路由原账号。只有完整历史可重放且协议允许创建新上游 turn 时，才可进行显式重建；不能把旧 opaque 状态带到新账号。

## 11. 并发和原子性

- projection 使用数据库唯一约束保证只创建一条；
- 并发请求争用同一 projection 时，一个事务创建，其余读取胜出记录；
- turn/window 更新使用行锁或 compare-and-swap version；
- `x-codex-turn-state` 更新按服务端事件序号或明确的 request attempt 顺序提交；
- WS lane 的 active owner 在共享存储中原子占用和释放；
- 账号并发按 active generation/compact/image operation 计数，不按 Ping/Pong 或连接数量计数；
- profile 或 egress 更新不修改正在运行的 envelope；
- 新 generation 不复用旧 generation 的空闲连接。

## 12. 代码改造范围

### 12.1 新增

建议新增以下模块，最终文件名可随仓库分层调整：

```text
backend/internal/service/openai_codex_operation.go
backend/internal/service/openai_codex_profile.go
backend/internal/service/openai_codex_egress.go
backend/internal/service/openai_codex_projection.go
backend/internal/service/openai_codex_ownership.go
backend/internal/service/openai_codex_endpoint_contract.go
backend/internal/repository/codex_projection_repository.go
backend/internal/repository/codex_ownership_repository.go
```

新增 migration、repository model、admin API 和 UI profile 编辑器。

### 12.2 接入现有能力

重点修改：

- `openai_gateway_forward.go` 和各 Chat/Messages bridge：在转换前创建 operation，在发送前消费 envelope；
- `openai_ws_*`：连接池、lane、reconnect 和 response boundary 绑定 ownership；
- compact/search/image/models/probe：改用 endpoint contract；
- scheduler/sticky：使用 ownership 和 attempted credential set；
- upstream transport：pool key 加入 profile/egress generation；
- account/proxy 管理：变化时创建 egress generation；
- 设置服务：只管理统一 profile source 和编译结果。

### 12.3 删除

同一发布中删除：

- `openai_codex_fingerprint.go` 的 `off/device/session/full` 运行逻辑；
- `codex_fingerprint_mode` 和 `codex_fingerprint_seed` 的 UI、API、cache 和测试；
- `disable_codex_identity_enforcement` 开关；
- `openai_codex_user_agent`、`openai_codex_client_version`、`openai_codex_client_version_synced`、`openai_codex_version_auto_sync_enabled` 的旧运行时读取链；
- 账号 credentials 中的 OpenAI UA override 及其编辑 UI；
- 固定 `thread_id:0` window；
- `/responses` 全局 `version` header；
- probe 强补 `OpenAI-Beta: responses=experimental`；
- 转换后重新生成 turn ID 或重新猜 operation 的路径；
- `instructions` registry 缺失时的通用占位 prompt；
- 只存在于单进程内的 turn-state 权威归属；
- stable compact 与 v2 的静默 fallback。

可以保留 migration 审计记录和数据库备份，但旧设置不作为运行时 fallback。

## 13. 数据迁移和切换

### 13.1 一次性迁移规则

发布迁移程序读取旧配置一次：

- 先扫描所有账号级 UA override；全部为空时继续，全部相同且系统 UA 为空时可将该值提升为系统 custom policy；存在多个不同值或与系统 UA 冲突时迁移失败，并列出需要统一的账号；
- `openai_codex_user_agent` 非空且能完整解析：创建 `source=custom` system policy；Core/clientInfo 版本全部从 UA 推导；
- 完整 UA 为空且旧手动 client version 非空：用原默认 TUI 模板编译一个完整固定 UA，并创建 `source=custom` system policy；
- 完整 UA 和手动版本都为空：创建 `source=managed` system policy；只有通过本发布 capability allowlist 的 synced stable 才可使用，否则使用本发布捆绑的 `0.154.0` stable；
- 显式且有效的账号 `openai_device_id` 可迁移为 installation ID；
- `codex_fingerprint_mode` 和通用 fingerprint seed 不映射为新模式；
- 账号代理生成 egress generation 1；直连账号生成 direct generation 1；
- shadow 账号指向母账号 credential/profile/egress namespace。

任何无法解析的完整 UA 都使迁移失败并列出账号/设置位置，不能静默回退。

### 13.2 原子切换

切换顺序：

1. 进入短暂维护窗口，停止创建新 Codex operation；
2. 等待活动 operation 到达上限时间并排空；
3. 备份 settings、accounts、proxy 和 sticky/turn-state 相关数据；
4. 执行 schema 和一次性数据迁移；
5. 部署只认识新模型的后端和前端；
6. 清空旧 Codex HTTP/WS 空闲连接池；
7. 开放流量并执行 probe 与小流量真实请求；
8. 验证后删除旧 setting 和 account extra 数据。

生产环境不存在双写、双读或新旧模式切换开关。

## 14. 实施顺序

实现可以按以下顺序在开发分支推进，但只有全部完成后才发布：

1. 固化 `0.154.0` 脱敏 fixture、endpoint contracts 和谱系不变量测试。
2. 增加 profile、egress、projection、ownership schema 和 repository。
3. 实现 operation classifier 和 immutable envelope。
4. 实现 profile compiler、managed stable 同步和 custom parser。
5. 实现 projection 原子创建与整体 metadata 渲染。
6. 将 Responses HTTP/SSE 接入统一路径。
7. 将 WS connection/lane/reconnect 接入 ownership。
8. 接入 compact、search、image、models、quota、auth 和 probe contracts。
9. 修改 scheduler/failover，加入 attempted credential set 和跨账号状态清理。
10. 修改连接池 key 和账号 proxy generation。
11. 完成 UI、一次性迁移并删除旧设置、旧四档模式和旧代码。
12. 运行全量测试、脱敏端到端抓包和小流量验证。

## 15. 测试方案

### 15.1 不变量测试

- 根 turn：`root_turn_id == turn_id`；
- 工具续接：两次请求的 session/thread/turn/root/window/cache 全部相等；
- child/fork：所有 parent/root 引用能在相同 namespace 解析；
- compact：成功后 window +1，失败不推进；
- 同逻辑输入经 HTTP/SSE/WS 和协议转换后 projection 不变；
- `/responses` fixture 不包含 `version` 和 `OpenAI-Beta`；
- 自定义 UA 的 originator/Core/clientInfo 全部由 parser 唯一确定。
- 每个允许的合成模型都映射到固定官方 revision 的 prompt family；passthrough instructions 保持字节内容不变。

### 15.2 并发测试

- 100 个并发请求获取同一 session/thread/turn 只创建一条 projection；
- profile 更新与活动 turn 并发时，活动 turn 保持旧 generation，新 turn 使用新 generation；
- proxy 更新后新请求不进入旧连接池；
- WS 多 lane 交错不会串 response、turn-state 或 usage；
- failover 后 scheduler 不会把同 operation 分回 attempted account；
- 多实例重启后 ownership 仍能路由原账号。

### 15.3 协议测试

- Responses generate、tool continuation、cancel 和 error stream；
- WS prewarm、generate、reconnect、cancel、无归属帧；
- stable `/responses/compact`；
- alpha/hosted/local search；
- hosted/standalone/batch image；
- models、quota、OAuth refresh 和 diagnostic probe；
- Chat Completions、Anthropic Messages 与 Responses 互转。

### 15.4 真实抓包验收

经过真实 sub2api 链路重新采集：

- HTTP/SSE header、body key 和 metadata 相等关系；
- 两步工具续接与 `x-codex-turn-state`；
- Go ClientHello、ALPN、HTTP/2 和连接复用；
- 账号代理出口 IP、timezone 和 HTTP/WS 一致性；
- stable compact；
- Responses WebSocket 多步续接；
- search/image 对应 endpoint；
- 日志中无 token、Cookie、完整 prompt、完整 state 或代理凭据。

抓包验收比较协议关系和稳定画像，不追求与 Rust ClientHello 字节相同。

## 16. 可观测性

每个 operation 记录以下脱敏字段：

```text
operation_id
operation_kind
client_scope_hash_prefix
credential_account_id
profile_generation
egress_generation
session/thread/turn projection hash prefix
window_number
transport + endpoint contract
connection/lane hash prefix
attempt_index + attempted credential count
ownership transition
actual TLS backend + ALPN + HTTP version
```

需要的指标：

- projection 创建冲突和命中率；
- turn-state/response ownership miss；
- 跨账号状态剥离次数；
- profile/egress generation 使用分布；
- HTTP/WS/compact/search/image 的错误率和 TTFT；
- failover 后同账号重新命中次数，目标为 0；
- 连接池跨 generation 拒绝次数；
- endpoint contract fixture 偏差。

日志不得记录 access/refresh token、Cookie、完整 turn-state、完整 response ID、完整 prompt、图片正文或代理密码。

## 17. 回滚边界

本方案不提供运行时旧逻辑 fallback。发布失败时采用发布级回滚：

1. 停止新 Codex operation；
2. 保存新模型诊断数据；
3. 恢复切换前数据库备份；
4. 回滚到旧二进制和前端；
5. 清空新旧 Codex 连接池后恢复流量。

不能只回滚二进制而保留已删除的旧设置状态，也不能让旧 binary 读取新 projection 表后猜测行为。回滚演练必须在发布前完成。

## 18. 完成定义

满足以下条件才视为改造完成：

- 运行时只有一个 identity/profile/egress/projection 模型；
- 旧四档指纹模式、旧配置键、旧 UI 和旧兼容读取全部删除；
- 所有 Codex endpoint 都通过 `CodexOperationEnvelope`；
- HTTP/SSE/WS/compact/search/image/models/probe 使用相同 profile/egress snapshot；
- 根、parent、fork、window 和工具续接不变量全部通过；
- turn-state、response ID 和 WS lane 有跨实例 ownership；
- 账号切换不会携带旧账号 opaque 状态，也不会在同 operation 中循环选回失败账号；
- 默认 transport 是可观测的 `go-native-v1`；
- 代理变化会增加 egress generation 并隔离旧连接；
- managed/custom 都只编译为同一个不可变 profile；
- 全量测试通过；
- 真实 sub2api 全链路抓包通过；
- 小流量观察期内没有 projection 冲突、ownership 丢失或跨账号状态污染。

## 19. 后续证据任务

以下采样不阻塞主体改造，但会阻塞对应能力宣称完成：

| 样本 | 用途 | 阻塞范围 |
| --- | --- | --- |
| 真实生产 Responses WS 多步续接 | 验证 lane、reconnect 和 turn-state | WS 完整验收 |
| stable `0.154.0` compact | 验证 `/responses/compact` 真实字段 | compact 完整验收 |
| 原生 search/image | 冻结辅助 endpoint 画像 | 对应 endpoint 完整验收 |
| macOS arm64 + 官方 App | 验证真实 attestation 边界 | macOS attestation 支持 |
| 改造后 sub2api 全链路 | 验证实现与设计一致 | 整体发布 |

遥测或 TLS 是否参与服务端风控不作为完成条件。该问题只能作为长期受控观测课题，不能通过伪造遥测或局部 TLS 指纹来验证。

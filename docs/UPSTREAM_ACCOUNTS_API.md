# Upstream account management

The operator accounts screen uses the existing `/api/admin/accounts` resource
API, not customer keys or a local fixture store. Platform
`provider_accounts.read` grants authorize reads; mutations require
`provider_accounts.manage`, a live management cookie, exact Origin and CSRF.

The UI offers four platforms: OpenAI, Claude, Gemini and Grok. Each platform
has OAuth and API Key access methods. OpenAI uses the `openai`/`openai_api`
adapters; Grok uses `xai`/`xai_api`. Claude and Gemini share their adapter ID
between access methods. No raw JSON/file input is exposed in the dialog.
Provider-owned import endpoints remain available for programmatic use.

`web/src/lib/upstream-platforms.ts` owns platform names, order, access methods,
API defaults and adapter-to-platform conversion. Feature modules consume this
catalog rather than defining their own lists. `UpstreamPlatformSelect` shares
form selection; table filters reuse the existing data-table controls. Account,
group, proxy, usage, monitoring, channel and price views use the same catalog.
Codex-specific settings remain in their own tab.

Management platform filters include both adapters for OpenAI and Grok across
usage details, analytics, errors, user rankings, monitoring and system logs.
Explicit legacy `openai_api`/`xai_api` API filters remain exact. Pricing and
execution retain adapter IDs: editing a platform's API price must not overwrite
its OAuth price. Price filters group adapters by platform, while rows and the
editor retain the applicable access method.

API accounts use named Base URL and API Key inputs shared with the connection
editor. Defaults include each provider's API version path. The editor accepts
an optional replacement key; leaving it empty preserves the encrypted credential.
Keys remain only in the dialog state and write request, never in URLs or caches;
switching providers or authorization methods clears the entered key. OAuth callback
input is also cleared on completion and remains bound to the initiating session.
Authorization can contact the upstream and never retries automatically.

The standard API form submits one exact provider import object containing
`schema_version: 1`, `name`, `base_url` and `api_key`. It exposes no OAuth or
WebSocket option. The API key stays only in dialog state and the write request.
See [standard API provider](STANDARD_API_PROVIDER.md) for endpoint, catalog,
proxy and protocol constraints. No existing account is reassigned automatically.

| Method | Resource | Behavior |
| --- | --- | --- |
| GET | `/accounts?page=...&pageSize=...` | Server-paged directory, search and status/provider filters |
| GET | `/accounts/detail?accountId=...` | Safe account projection and allowlisted connection configuration |
| POST | `/accounts/import` | Provider-native JSON with explicit group, concurrency and weight settings |
| POST | `/accounts/oauth/start` | Begin an owner-bound provider authorization flow |
| POST | `/accounts/oauth/complete` | Complete the flow with its callback and settings |
| POST | `/accounts/update` | Replace enabled state, notes, capacity, weight, model policy, memberships and proxy selection at a required `configRevision` |
| POST | `/accounts/batch-update` | Apply explicit fields at a required `configRevision`; the whole batch is atomic |
| POST | `/accounts/delete` | Explicit provider and account IDs; permanent deletion |
| POST | `/accounts/refresh` | Explicit upstream credential refresh; no automatic replay |
| POST | `/accounts/quota/refresh` | Explicit supported upstream quota refresh |
| GET | `/accounts/models?accountId=...` | Actual known model IDs from the selected provider |
| GET | `/accounts/personal-info?accountId=...` | Supported provider profile statistics and subscription; independent profile errors remain visible |
| GET | `/accounts/quota-forecast?accountId=...` | Server-computed quota forecast with explicit source, incomplete evidence and unavailable reasons |
| GET | `/accounts/reset-credits?accountId=...` | Supported provider reset credits and the observed available count |
| POST | `/accounts/reset-credits` | Confirmed consumption with `accountId`, optional `creditId`, and a UUID-v4 `redeemRequestId` reused for an uncertain retry |

The credential export HTTP route is removed. List/detail/model APIs do not
return access tokens, refresh tokens, API keys, proxy credentials or raw native
credential documents. The database adapter owns encryption at rest.
API-key connection settings expose only base URL and transport; the editor can
submit a replacement API key without reading the current key. Empty replacement
input preserves the current key. OAuth accounts expose transport only.
Rotation dispatch uses the stored account's provider, never a client-selected
provider. Standard API rotations accept the flat provider document
`{base_url, transport: "http", api_key?}`; an omitted key preserves the current
credential. Credential and settings changes share the existing CAS/audit commit.

The directory retains at most one page of 50 rows; requests are canceled when
filters or the authenticated owner change. Mutations are fenced by the current
session, never retried automatically, and show success only after a confirmed
server result. Directory pages and each safe account projection return
`configRevision` from a stable configuration read. Detail reads fence account
settings and allowlisted connection configuration against that same revision.
Both update endpoints require a positive `configRevision`; no omitted-version
write is accepted. The existing configuration/audit transaction locks the shared
configuration row and rejects a stale revision with HTTP 409 before modifying
settings, credentials or memberships. A combined connection/settings edit uses
the same check and transaction. Operators must reload after a conflict; the
browser never silently rebases a stale editor. Credential import and OAuth are
explicit external side effects.
After a confirmed settings, connection, enabled-state, credential, quota, import,
OAuth completion or deletion change, the browser cancels older account reads
and invalidates the directory, safe details and model catalogs for the initiating
management session. The configuration revision is shared, so details for other
accounts in that session also become stale. A changed session cannot refresh or
apply the previous owner's result. Cache refresh failures do not turn a confirmed
write into a failed write, and no credential material is stored in these caches.
Search, provider, status and group filters use the route's actual search state.
Each categorical facet selects one backend-supported value and resets paging.

Group and saved-proxy selectors load bounded server pages. Operators can search
the respective directories without loading an unbounded catalog. Missing
selected entries are retained by ID and are never silently unassigned.
Unknown usage, capacity and quota values remain unknown. Procurement cost
observations are separate from customer retail charges; this screen does not
activate automatic billing.

The account details dialog preserves the usage, profile, forecast and reset
panels, with an additional real model catalog view. It remains full screen on
mobile, internally scrolls its content, and retains fixed close/refresh actions.
Provider capabilities gate profile, subscription, quota and reset-credit calls;
unsupported sections keep their original containers with an unavailable state.
There are no fabricated activity cells, quota forecasts, token ratios, success
rates or reset balances. Native profile calendars and returned daily usage are
the only sources for activity views. Missing counts stay unknown. Forecast USD
is an explicitly labeled server estimate, separate from exact observed USD
amounts and retail charges.

Queries consume cancellation signals and include the authenticated owner in
their cache keys. Profile refresh refetches the personal-information read; it
does not rotate account credentials. Quota refresh uses its explicit capability
and management permission. Consuming a reset credit requires confirmation and
the existing management/CSRF contract. An uncertain consumption retains its
original command and UUID in a bounded owner-scoped memory map, including after
the dialog is reopened; retry never selects another card or silently creates a
new command. Successful consumption refreshes the account and credit views.
Changing the authenticated owner fences late results and discards that owner's
in-memory intents. No real reset consumption is performed during UI validation.


## 账号管理补全（2026-11-11）

- `POST /accounts/update` 支持可选 `name`：1～512 UTF-8 字节，不能全空白、含控制字符或首尾空格；省略保留名称。名称与连接设置、分组、调度参数及审计共享事务，修订冲突整体回滚。
- 前端批量编辑调用现有 `POST /accounts/batch-update`，只提交选定的一个项目，支持启停、并发、权重、分组替换、代理和模型策略；选择范围为当前页。
- 账号分组选项查询使用 `platform=all,<provider>`；混合平台批量分组只允许未限定平台的组，服务端仍执行平台约束。
- 行菜单连接测试使用 `GET /accounts/connection-test?accountId=...&modelId=...` 的 SSE。只在用户启动后调用，关闭弹窗取消读取；只有 `test_complete` 成功事件才视为通过，断流不能当成成功。
- 菜单和详情页按账号能力隐藏不支持的资料/预测/重置功能；Gemini 的模型额度窗口不参与周/月额度预测。
- Claude/Gemini OAuth 账号支持额度刷新：Claude `/api/oauth/usage`，Gemini `v1internal:retrieveUserQuota`。请求使用账号出站代理和现有 OAuth 刷新链路，响应有超时和大小限制。
- 额度写入已有账号额度存储端口并带凭据修订校验。列表只读已保存观测，不触发上游；失败保留旧快照。缺少百分比保持未知，模型窗口触顶不直接冻结整个账号。API Key 账号不宣称订阅额度能力。

参考：[sub2api 账号额度服务](https://github.com/Wei-Shaw/sub2api/blob/main/backend/internal/service/account_usage_service.go)、[Gemini CLI 额度处理](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/config.ts)。真实 OAuth 授权、真实上游额度响应和模型请求仍需要有效账号进行环境验收。


### 平台与接入方式

管理界面以 OpenAI、Claude、Gemini、Grok 四个平台组织账号，各平台均支持 OAuth 和 API Key。存储仍保留适配器身份：OpenAI OAuth=`openai`、API Key=`openai_api`；Grok OAuth=`xai`、API Key=`xai_api`；Claude/Gemini 使用各自 provider 和 `authenticationKind` 区分接入方式。账号目录 `provider=openai`/`xai` 包括对应 API Key 账号，分组的平台约束也按平台匹配。

Gemini OAuth 使用 Antigravity CLI 的 Code Assist 授权流程，回调地址为 `https://antigravity.google/oauth-callback`。服务端按授权时绑定的账号出站代理执行令牌交换、用户资料读取和项目初始化；选择直接连接时不继承系统代理。Google 长任务省略 `done` 时视为尚未完成，继续轮询。授权日志只记录阶段、固定错误分类和 HTTP 状态，不记录授权码、令牌、完整链接或上游响应正文。网络失败、授权码拒绝及项目初始化失败返回各自的安全提示。

`POST /api/admin/accounts/models/preview` 接受与账号导入相同的 `provider`、`data`、`outboundProxyId`，仅查询模型，不持久化账号、凭据、分组或配置版本。API Key 的 `data` 为 `{schema_version:1,name,api_key,base_url}`。调用所填上游的模型列表接口（Claude/Gemini 按原生协议认证和分页），返回 `{models:[{id,label}]}`。需要账号管理权限和 CSRF；保留 HTTPS、DNS/代理策略、并发及响应体限制，密钥只在请求体和上游认证头中传递。

已保存账号使用 `/accounts/models/refresh` 同步其授权可用模型；OAuth 新增完成后自动同步。账号的模型选择是对上游模型目录的进一步限制，不允许绕过上游支持列表。


### Account connection test models and media

`POST /api/admin/accounts/connection-test/models` accepts `{ "accountId": "..." }`, refreshes the provider model catalog, and returns `{ "models": [{ "id": "...", "label": "...", "kind": "text" | "image" }] }` inside the management envelope. Choices are provider-owned and include only implemented test paths. OpenAI OAuth adds its native image models on a copy of the test list; this does not modify the shared text catalog or an API Key account's upstream catalog.

`POST /api/admin/accounts/connection-test` accepts `{ "accountId": "...", "modelId": "...", "prompt"?: "..." }` and returns SSE. The management session, CSRF and step-up rules apply. The legacy GET entry remains compatible. Prompt length is limited to 2,000 characters; an empty image prompt uses the server default. Media uses the existing account probe, selected account, provider credentials and outbound proxy. Image probes route to the registered provider endpoint rather than the text model catalog.

In addition to `content`, `error`, and `test_complete`, the response may include `{ "type": "image", "image_url": "data:image/png;base64,..." }`. PNG/JPEG/WebP data and HTTPS image URLs are projected from provider output; raw provider payloads are never sent as image events. A successful image test requires at least one valid image. Native response collection and individual image sizes are bounded. Closing the dialog aborts the request.

Current media test capability: OpenAI OAuth image generation. API Key, Gemini and Grok image tests and Compact tests are not advertised because these test paths are not implemented by the current providers. Text connection tests continue to use each provider's existing OAuth/API Key execution path. These unsupported entries must not be exposed by guessing capabilities in the frontend.

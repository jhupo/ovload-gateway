# 分组管理接口

分组是上游账号的路由与计费资源，不是用户组织。管理端沿用
`/api/admin/account-groups`、`/options`、`/create`、`/update`、`/enable`、
`/disable`、`/delete`。查询需要 `provider_accounts.read`，写入需要
`provider_accounts.manage`；浏览器写请求还需要会话和 CSRF 校验。

## 查询与保存

列表支持名称搜索、状态、平台、公开/私有、名称/创建时间排序和分页（每页最多 200）。
`platform` 可为逗号分隔的 `all,openai,openai_api,xai,claude,gemini`；`all`
表示未限定平台的分组。`visibility` 可为 `public,private`。筛选在数据库执行，
列表、总数和选项使用相同条件。平台限制同时用于账号成员和运行时路由。

更新提交完整分组字段与 `configRevision`。过期修订返回 409；配置、审计和
修订在同一事务提交，再发布运行时快照。账号成员在账号管理中维护。

## 权限与限额

`visibility` 默认为 `private`，需要用户授权；公开分组对有效用户开放，但显式拒绝优先。
停用分组会阻止新请求。撤销授权会撤销该用户绑定分组的密钥。

`controls` 示例：

```json
{
  "allowLive": true,
  "requestsPerMinute": 60,
  "userOverrides": {
    "00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002": {
      "multiplierBps": 8000,
      "requestsPerMinute": 20
    }
  }
}
```

用户索引为 `tenant_id/user_id`，保存时验证用户归属。最多 256 个专属项，
两个值不能同时为空；空值继承，数值 0 为显式配置。

RPM 是同一用户在此分组内所有密钥共享的每分钟上限，范围 0～1000000。
0 不增加分组限制；专属 RPM 替换分组默认 RPM，不会绕过全局、租户、用户和密钥限额。
Redis 原子准入同时检查这些范围，启动恢复按请求保存的分组归属恢复计数。

`allowLive` 默认为 true；关闭后阻止新 Live/Realtime HTTP 会话与 WebSocket
连接。挂断接口仍可清理已有会话。图片权限独立沿用 `allowImageGeneration`。

## 路由与计费

`modelRoutes` 仅做请求模型到目标模型的一次别名映射；null 或空映射均继承账号目录，
未匹配的模型也由账号支持模型列表判定，不把分组映射当作模型白名单。
Fast 模式沿用现有分组策略。

默认使用网关模型价格，`pricing.modelPrices` 可覆盖单个模型的输入、输出、缓存读取和
缓存写入价格。删除覆盖后恢复继承，不改变全局标准价格。价格为 USD/百万 Token；
保留其他维度（如搜索、音频和图片）的独立计费规则。

`retailMultiplierBps` 为基础倍率（10000 = 1 倍，最高 100 倍）；用户专属倍率
替换基础倍率，再叠加高低峰时段倍率。`pricing.peak` 为 null 时不启用高低峰；
启用后使用配置时区，开始时间包含、结束时间不包含，支持跨午夜。
服务端验证组合倍率不超过上限。

请求冻结所使用的价格和倍率；修改分组不会改变已经预占的请求结算。
列表用量显示今日、昨日、累计值，容量显示当前占用和账号配置容量，不使用模拟数据。

## 验证

`tests/deploy/groups_verify.py` 使用临时分组验证查询、修订、权限、配置持久化、
Live/Realtime 入口和恢复继承；结束后清理临时记录。
`tests/deploy/groups_ui.cjs` 验证真实页面的创建、筛选、编辑、专属设置和移动端布局。
Redis 集成测试覆盖跨密钥共享分组 RPM、跨用户/分组隔离、零限额及计数恢复。

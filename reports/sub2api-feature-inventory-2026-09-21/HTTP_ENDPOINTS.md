# HTTP endpoint registration inventory

[Main catalogue](README.md) · Source version **0.2.34**, commit `4b9488732a560797446ee677517adbd6581c8d60`. Static source inventory; not runtime verification.

This is a complete static registry for the seven server route files, page-handler routes, and setup-only routes. Counts are registrations, not independent product features. Shared aliases remain separate rows. `/setup/status` occurs in both startup modes, accounting for 698 rows versus 697 distinct method/path pairs. There were no unresolved route groups in extraction.

Authentication is inherited through route groups/middleware and is not fully expressible as a single annotation here. Admin routes normally require admin authorization; plugin UI assets use a short-lived UI token. User routes normally require a user session. Gateway routes use API-key authentication plus platform/group admission. Auth/payment callback/public settings routes have their own public/session/signature rules. Consult the linked registration function for exact middleware; an administrative prefix is not itself an access-control proof.

| Registration source | Rows |
| --- | --- |
| [backend/internal/server/routes/admin.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go>) | 421 |
| [backend/internal/server/routes/auth.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go>) | 59 |
| [backend/internal/server/routes/common.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/common.go>) | 4 |
| [backend/internal/server/routes/gateway.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go>) | 107 |
| [backend/internal/server/routes/model_plaza.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/model_plaza.go>) | 1 |
| [backend/internal/server/routes/payment.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go>) | 38 |
| [backend/internal/server/routes/user.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go>) | 61 |
| [backend/internal/handler/page_handler.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/page_handler.go>) | 3 |
| [backend/internal/setup/handler.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/setup/handler.go>) | 4 |

Key conditions: data-management operations are deprecated; async images and batch queues are gated; media/audio/Live endpoints require compatible providers/accounts; plugin UI is capability-token-gated; model plaza has an enable/login policy. Feature annotations below are reminders, not a replacement for handler validation.

## backend/internal/server/routes/admin.go

### RegisterAdminRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/plugin-ui/:token/*path` | h.Admin.Plugin.ServeUIAsset | normal server; Short-lived plugin UI token | [25](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:25>) |

### registerPromptAuditRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/prompt-audit/config` | h.Admin.PromptAudit.GetConfig | normal server; See group middleware and handler | [141](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:141>) |
| PUT | `/api/v1/admin/prompt-audit/config` | h.Admin.PromptAudit.UpdateConfig | normal server; See group middleware and handler | [142](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:142>) |
| POST | `/api/v1/admin/prompt-audit/endpoints/probe` | h.Admin.PromptAudit.ProbeEndpoint | normal server; See group middleware and handler | [143](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:143>) |
| GET | `/api/v1/admin/prompt-audit/runtime` | h.Admin.PromptAudit.GetRuntime | normal server; See group middleware and handler | [144](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:144>) |
| GET | `/api/v1/admin/prompt-audit/events` | h.Admin.PromptAudit.ListEvents | normal server; See group middleware and handler | [145](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:145>) |
| GET | `/api/v1/admin/prompt-audit/events/:id` | h.Admin.PromptAudit.GetEvent | normal server; See group middleware and handler | [146](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:146>) |
| DELETE | `/api/v1/admin/prompt-audit/events/:id` | h.Admin.PromptAudit.DeleteEvent | normal server; See group middleware and handler | [147](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:147>) |
| POST | `/api/v1/admin/prompt-audit/events/batch-delete` | h.Admin.PromptAudit.BatchDelete | normal server; See group middleware and handler | [148](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:148>) |
| POST | `/api/v1/admin/prompt-audit/events/delete-preview` | h.Admin.PromptAudit.DeletePreview | normal server; See group middleware and handler | [149](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:149>) |
| POST | `/api/v1/admin/prompt-audit/events/delete-by-filter` | h.Admin.PromptAudit.DeleteByFilter | normal server; See group middleware and handler | [150](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:150>) |

### registerAuditLogRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/audit-logs` | h.Admin.AuditLog.List | normal server; See group middleware and handler | [157](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:157>) |
| GET | `/api/v1/admin/audit-logs/:id` | h.Admin.AuditLog.Get | normal server; See group middleware and handler | [158](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:158>) |
| POST | `/api/v1/admin/audit-logs/clear` | h.Admin.AuditLog.Clear | normal server; See group middleware and handler | [160](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:160>) |

### registerAdminComplianceRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/compliance` | h.Admin.Compliance.GetStatus | normal server; See group middleware and handler | [167](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:167>) |
| POST | `/api/v1/admin/compliance/accept` | h.Admin.Compliance.Accept | normal server; See group middleware and handler | [168](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:168>) |

### registerContentModerationRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/risk-control/config` | h.Admin.ContentModeration.GetConfig | normal server; See group middleware and handler | [175](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:175>) |
| PUT | `/api/v1/admin/risk-control/config` | h.Admin.ContentModeration.UpdateConfig | normal server; See group middleware and handler | [176](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:176>) |
| POST | `/api/v1/admin/risk-control/api-keys/test` | h.Admin.ContentModeration.TestAPIKeys | normal server; See group middleware and handler | [177](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:177>) |
| GET | `/api/v1/admin/risk-control/status` | h.Admin.ContentModeration.GetStatus | normal server; See group middleware and handler | [178](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:178>) |
| GET | `/api/v1/admin/risk-control/logs` | h.Admin.ContentModeration.ListLogs | normal server; See group middleware and handler | [179](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:179>) |
| POST | `/api/v1/admin/risk-control/users/:user_id/unban` | h.Admin.ContentModeration.UnbanUser | normal server; See group middleware and handler | [180](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:180>) |
| DELETE | `/api/v1/admin/risk-control/hashes` | h.Admin.ContentModeration.DeleteFlaggedHash | normal server; See group middleware and handler | [181](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:181>) |
| DELETE | `/api/v1/admin/risk-control/hashes/all` | h.Admin.ContentModeration.ClearFlaggedHashes | normal server; See group middleware and handler | [182](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:182>) |

### registerAdminAPIKeyRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| PUT | `/api/v1/admin/api-keys/:id` | h.Admin.APIKey.UpdateGroup | normal server; See group middleware and handler | [189](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:189>) |

### registerOpsRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/ops/concurrency` | h.Admin.Ops.GetConcurrencyStats | normal server; See group middleware and handler | [197](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:197>) |
| GET | `/api/v1/admin/ops/user-concurrency` | h.Admin.Ops.GetUserConcurrencyStats | normal server; See group middleware and handler | [198](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:198>) |
| GET | `/api/v1/admin/ops/account-availability` | h.Admin.Ops.GetAccountAvailability | normal server; See group middleware and handler | [199](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:199>) |
| GET | `/api/v1/admin/ops/realtime-traffic` | h.Admin.Ops.GetRealtimeTrafficSummary | normal server; Provider/voice capability checks | [200](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:200>) |
| GET | `/api/v1/admin/ops/alert-rules` | h.Admin.Ops.ListAlertRules | normal server; See group middleware and handler | [203](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:203>) |
| POST | `/api/v1/admin/ops/alert-rules` | h.Admin.Ops.CreateAlertRule | normal server; See group middleware and handler | [204](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:204>) |
| PUT | `/api/v1/admin/ops/alert-rules/:id` | h.Admin.Ops.UpdateAlertRule | normal server; See group middleware and handler | [205](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:205>) |
| DELETE | `/api/v1/admin/ops/alert-rules/:id` | h.Admin.Ops.DeleteAlertRule | normal server; See group middleware and handler | [206](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:206>) |
| GET | `/api/v1/admin/ops/alert-events` | h.Admin.Ops.ListAlertEvents | normal server; See group middleware and handler | [207](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:207>) |
| GET | `/api/v1/admin/ops/alert-events/:id` | h.Admin.Ops.GetAlertEvent | normal server; See group middleware and handler | [208](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:208>) |
| PUT | `/api/v1/admin/ops/alert-events/:id/status` | h.Admin.Ops.UpdateAlertEventStatus | normal server; See group middleware and handler | [209](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:209>) |
| POST | `/api/v1/admin/ops/alert-silences` | h.Admin.Ops.CreateAlertSilence | normal server; See group middleware and handler | [210](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:210>) |
| GET | `/api/v1/admin/ops/email-notification/config` | h.Admin.Ops.GetEmailNotificationConfig | normal server; See group middleware and handler | [213](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:213>) |
| PUT | `/api/v1/admin/ops/email-notification/config` | h.Admin.Ops.UpdateEmailNotificationConfig | normal server; See group middleware and handler | [214](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:214>) |
| GET | `/api/v1/admin/ops/runtime/alert` | h.Admin.Ops.GetAlertRuntimeSettings | normal server; See group middleware and handler | [219](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:219>) |
| PUT | `/api/v1/admin/ops/runtime/alert` | h.Admin.Ops.UpdateAlertRuntimeSettings | normal server; See group middleware and handler | [220](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:220>) |
| GET | `/api/v1/admin/ops/runtime/logging` | h.Admin.Ops.GetRuntimeLogConfig | normal server; See group middleware and handler | [221](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:221>) |
| PUT | `/api/v1/admin/ops/runtime/logging` | h.Admin.Ops.UpdateRuntimeLogConfig | normal server; See group middleware and handler | [222](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:222>) |
| POST | `/api/v1/admin/ops/runtime/logging/reset` | h.Admin.Ops.ResetRuntimeLogConfig | normal server; See group middleware and handler | [223](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:223>) |
| GET | `/api/v1/admin/ops/advanced-settings` | h.Admin.Ops.GetAdvancedSettings | normal server; See group middleware and handler | [227](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:227>) |
| PUT | `/api/v1/admin/ops/advanced-settings` | h.Admin.Ops.UpdateAdvancedSettings | normal server; See group middleware and handler | [228](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:228>) |
| GET | `/api/v1/admin/ops/settings/metric-thresholds` | h.Admin.Ops.GetMetricThresholds | normal server; See group middleware and handler | [233](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:233>) |
| PUT | `/api/v1/admin/ops/settings/metric-thresholds` | h.Admin.Ops.UpdateMetricThresholds | normal server; See group middleware and handler | [234](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:234>) |
| GET | `/api/v1/admin/ops/ws/qps` | h.Admin.Ops.QPSWSHandler | normal server; See group middleware and handler | [240](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:240>) |
| GET | `/api/v1/admin/ops/errors` | h.Admin.Ops.GetErrorLogs | normal server; See group middleware and handler | [244](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:244>) |
| GET | `/api/v1/admin/ops/errors/:id` | h.Admin.Ops.GetErrorLogByID | normal server; See group middleware and handler | [245](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:245>) |
| PUT | `/api/v1/admin/ops/errors/:id/resolve` | h.Admin.Ops.UpdateErrorResolution | normal server; See group middleware and handler | [246](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:246>) |
| GET | `/api/v1/admin/ops/request-errors` | h.Admin.Ops.ListRequestErrors | normal server; See group middleware and handler | [249](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:249>) |
| GET | `/api/v1/admin/ops/request-errors/:id` | h.Admin.Ops.GetRequestError | normal server; See group middleware and handler | [250](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:250>) |
| GET | `/api/v1/admin/ops/request-errors/:id/upstream-errors` | h.Admin.Ops.ListRequestErrorUpstreamErrors | normal server; See group middleware and handler | [251](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:251>) |
| PUT | `/api/v1/admin/ops/request-errors/:id/resolve` | h.Admin.Ops.ResolveRequestError | normal server; See group middleware and handler | [252](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:252>) |
| GET | `/api/v1/admin/ops/ingress-rejections` | h.Admin.Ops.ListIngressRejects | normal server; See group middleware and handler | [255](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:255>) |
| GET | `/api/v1/admin/ops/ingress-rejections/health` | h.Admin.Ops.GetIngressRejectHealth | normal server; See group middleware and handler | [256](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:256>) |
| GET | `/api/v1/admin/ops/auth-cache-invalidation/health` | h.Admin.Ops.GetAuthCacheInvalidationHealth | normal server; See group middleware and handler | [257](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:257>) |
| GET | `/api/v1/admin/ops/live-balance-outbox/health` | h.Admin.Ops.GetLiveBalanceAdjustmentOutboxHealth | normal server; Live capability + platform-dependent attestation | [258](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:258>) |
| GET | `/api/v1/admin/ops/scheduler-freshness/health` | h.Admin.Ops.GetSchedulerFreshnessHealth | normal server; See group middleware and handler | [259](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:259>) |
| GET | `/api/v1/admin/ops/upstream-errors` | h.Admin.Ops.ListUpstreamErrors | normal server; See group middleware and handler | [262](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:262>) |
| GET | `/api/v1/admin/ops/upstream-errors/:id` | h.Admin.Ops.GetUpstreamError | normal server; See group middleware and handler | [263](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:263>) |
| PUT | `/api/v1/admin/ops/upstream-errors/:id/resolve` | h.Admin.Ops.ResolveUpstreamError | normal server; See group middleware and handler | [264](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:264>) |
| GET | `/api/v1/admin/ops/requests` | h.Admin.Ops.ListRequestDetails | normal server; See group middleware and handler | [267](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:267>) |
| GET | `/api/v1/admin/ops/system-logs` | h.Admin.Ops.ListSystemLogs | normal server; See group middleware and handler | [270](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:270>) |
| POST | `/api/v1/admin/ops/system-logs/cleanup` | h.Admin.Ops.CleanupSystemLogs | normal server; See group middleware and handler | [271](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:271>) |
| GET | `/api/v1/admin/ops/system-logs/health` | h.Admin.Ops.GetSystemLogIngestionHealth | normal server; See group middleware and handler | [272](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:272>) |
| GET | `/api/v1/admin/ops/dashboard/snapshot-v2` | h.Admin.Ops.GetDashboardSnapshotV2 | normal server; See group middleware and handler | [275](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:275>) |
| GET | `/api/v1/admin/ops/dashboard/overview` | h.Admin.Ops.GetDashboardOverview | normal server; See group middleware and handler | [276](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:276>) |
| GET | `/api/v1/admin/ops/dashboard/throughput-trend` | h.Admin.Ops.GetDashboardThroughputTrend | normal server; See group middleware and handler | [277](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:277>) |
| GET | `/api/v1/admin/ops/dashboard/latency-histogram` | h.Admin.Ops.GetDashboardLatencyHistogram | normal server; See group middleware and handler | [278](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:278>) |
| GET | `/api/v1/admin/ops/dashboard/error-trend` | h.Admin.Ops.GetDashboardErrorTrend | normal server; See group middleware and handler | [279](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:279>) |
| GET | `/api/v1/admin/ops/dashboard/error-distribution` | h.Admin.Ops.GetDashboardErrorDistribution | normal server; See group middleware and handler | [280](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:280>) |
| GET | `/api/v1/admin/ops/dashboard/openai-token-stats` | h.Admin.Ops.GetDashboardOpenAITokenStats | normal server; See group middleware and handler | [281](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:281>) |

### registerDashboardRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/dashboard/snapshot-v2` | h.Admin.Dashboard.GetSnapshotV2 | normal server; See group middleware and handler | [288](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:288>) |
| GET | `/api/v1/admin/dashboard/stats` | h.Admin.Dashboard.GetStats | normal server; See group middleware and handler | [289](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:289>) |
| GET | `/api/v1/admin/dashboard/realtime` | h.Admin.Dashboard.GetRealtimeMetrics | normal server; Provider/voice capability checks | [290](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:290>) |
| GET | `/api/v1/admin/dashboard/trend` | h.Admin.Dashboard.GetUsageTrend | normal server; See group middleware and handler | [291](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:291>) |
| GET | `/api/v1/admin/dashboard/models` | h.Admin.Dashboard.GetModelStats | normal server; See group middleware and handler | [292](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:292>) |
| GET | `/api/v1/admin/dashboard/groups` | h.Admin.Dashboard.GetGroupStats | normal server; See group middleware and handler | [293](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:293>) |
| GET | `/api/v1/admin/dashboard/api-keys-trend` | h.Admin.Dashboard.GetAPIKeyUsageTrend | normal server; See group middleware and handler | [294](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:294>) |
| GET | `/api/v1/admin/dashboard/users-trend` | h.Admin.Dashboard.GetUserUsageTrend | normal server; See group middleware and handler | [295](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:295>) |
| GET | `/api/v1/admin/dashboard/users-ranking` | h.Admin.Dashboard.GetUserSpendingRanking | normal server; See group middleware and handler | [296](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:296>) |
| POST | `/api/v1/admin/dashboard/users-usage` | h.Admin.Dashboard.GetBatchUsersUsage | normal server; See group middleware and handler | [297](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:297>) |
| POST | `/api/v1/admin/dashboard/api-keys-usage` | h.Admin.Dashboard.GetBatchAPIKeysUsage | normal server; See group middleware and handler | [298](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:298>) |
| GET | `/api/v1/admin/dashboard/user-breakdown` | h.Admin.Dashboard.GetUserBreakdown | normal server; See group middleware and handler | [299](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:299>) |
| POST | `/api/v1/admin/dashboard/aggregation/backfill` | h.Admin.Dashboard.BackfillAggregation | normal server; See group middleware and handler | [300](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:300>) |

### registerUserManagementRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/users` | h.Admin.User.List | normal server; See group middleware and handler | [307](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:307>) |
| GET | `/api/v1/admin/users/:id` | h.Admin.User.GetByID | normal server; See group middleware and handler | [308](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:308>) |
| POST | `/api/v1/admin/users/:id/auth-identities` | h.Admin.User.BindAuthIdentity | normal server; See group middleware and handler | [309](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:309>) |
| POST | `/api/v1/admin/users` | h.Admin.User.Create | normal server; See group middleware and handler | [310](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:310>) |
| PUT | `/api/v1/admin/users/:id` | h.Admin.User.Update | normal server; See group middleware and handler | [311](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:311>) |
| DELETE | `/api/v1/admin/users/:id` | h.Admin.User.Delete | normal server; See group middleware and handler | [312](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:312>) |
| POST | `/api/v1/admin/users/:id/balance` | h.Admin.User.UpdateBalance | normal server; See group middleware and handler | [313](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:313>) |
| GET | `/api/v1/admin/users/:id/api-keys` | h.Admin.User.GetUserAPIKeys | normal server; See group middleware and handler | [314](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:314>) |
| GET | `/api/v1/admin/users/:id/usage` | h.Admin.User.GetUserUsage | normal server; See group middleware and handler | [315](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:315>) |
| GET | `/api/v1/admin/users/:id/balance-history` | h.Admin.User.GetBalanceHistory | normal server; See group middleware and handler | [316](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:316>) |
| POST | `/api/v1/admin/users/:id/replace-group` | h.Admin.User.ReplaceGroup | normal server; See group middleware and handler | [317](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:317>) |
| GET | `/api/v1/admin/users/:id/rpm-status` | h.Admin.User.GetUserRPMStatus | normal server; See group middleware and handler | [318](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:318>) |
| POST | `/api/v1/admin/users/batch-concurrency` | h.Admin.User.BatchUpdateConcurrency | normal server; See group middleware and handler | [319](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:319>) |
| POST | `/api/v1/admin/users/batch-limits` | h.Admin.User.BatchUpdateLimits | normal server; See group middleware and handler | [320](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:320>) |
| GET | `/api/v1/admin/users/:id/platform-quotas` | h.Admin.User.GetUserPlatformQuotas | normal server; See group middleware and handler | [321](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:321>) |
| PUT | `/api/v1/admin/users/:id/platform-quotas` | h.Admin.User.UpdateUserPlatformQuotas | normal server; See group middleware and handler | [322](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:322>) |
| POST | `/api/v1/admin/users/:id/platform-quotas/reset` | h.Admin.User.ResetUserPlatformQuotaWindow | normal server; See group middleware and handler | [323](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:323>) |
| GET | `/api/v1/admin/users/:id/attributes` | h.Admin.UserAttribute.GetUserAttributes | normal server; See group middleware and handler | [326](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:326>) |
| PUT | `/api/v1/admin/users/:id/attributes` | h.Admin.UserAttribute.UpdateUserAttributes | normal server; See group middleware and handler | [327](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:327>) |

### registerGroupRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/groups` | h.Admin.Group.List | normal server; See group middleware and handler | [334](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:334>) |
| GET | `/api/v1/admin/groups/all` | h.Admin.Group.GetAll | normal server; See group middleware and handler | [335](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:335>) |
| GET | `/api/v1/admin/groups/usage-summary` | h.Admin.Group.GetUsageSummary | normal server; See group middleware and handler | [336](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:336>) |
| GET | `/api/v1/admin/groups/capacity-summary` | h.Admin.Group.GetCapacitySummary | normal server; See group middleware and handler | [337](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:337>) |
| GET | `/api/v1/admin/groups/live-capability` | h.Admin.Group.GetLiveCapability | normal server; Live capability + platform-dependent attestation | [338](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:338>) |
| PUT | `/api/v1/admin/groups/sort-order` | h.Admin.Group.UpdateSortOrder | normal server; See group middleware and handler | [339](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:339>) |
| GET | `/api/v1/admin/groups/:id/models-list-candidates` | h.Admin.Group.GetModelsListCandidates | normal server; See group middleware and handler | [340](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:340>) |
| GET | `/api/v1/admin/groups/:id/composite-routes` | h.Admin.Group.ListCompositeRoutes | normal server; See group middleware and handler | [341](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:341>) |
| POST | `/api/v1/admin/groups/:id/composite-routes` | h.Admin.Group.CreateCompositeRoute | normal server; See group middleware and handler | [342](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:342>) |
| POST | `/api/v1/admin/groups/:id/composite-routes/preview` | h.Admin.Group.PreviewCompositeRoute | normal server; See group middleware and handler | [343](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:343>) |
| PUT | `/api/v1/admin/groups/:id/composite-routes/:route_id` | h.Admin.Group.UpdateCompositeRoute | normal server; See group middleware and handler | [344](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:344>) |
| DELETE | `/api/v1/admin/groups/:id/composite-routes/:route_id` | h.Admin.Group.DeleteCompositeRoute | normal server; See group middleware and handler | [345](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:345>) |
| GET | `/api/v1/admin/groups/:id` | h.Admin.Group.GetByID | normal server; See group middleware and handler | [346](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:346>) |
| POST | `/api/v1/admin/groups` | h.Admin.Group.Create | normal server; See group middleware and handler | [347](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:347>) |
| POST | `/api/v1/admin/groups/:id/duplicate` | h.Admin.Group.Duplicate | normal server; See group middleware and handler | [348](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:348>) |
| PUT | `/api/v1/admin/groups/:id` | h.Admin.Group.Update | normal server; See group middleware and handler | [349](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:349>) |
| DELETE | `/api/v1/admin/groups/:id` | h.Admin.Group.Delete | normal server; See group middleware and handler | [350](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:350>) |
| GET | `/api/v1/admin/groups/:id/stats` | h.Admin.Group.GetStats | normal server; See group middleware and handler | [351](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:351>) |
| GET | `/api/v1/admin/groups/:id/rate-multipliers` | h.Admin.Group.GetGroupRateMultipliers | normal server; See group middleware and handler | [352](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:352>) |
| PUT | `/api/v1/admin/groups/:id/rate-multipliers` | h.Admin.Group.BatchSetGroupRateMultipliers | normal server; See group middleware and handler | [353](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:353>) |
| DELETE | `/api/v1/admin/groups/:id/rate-multipliers` | h.Admin.Group.ClearGroupRateMultipliers | normal server; See group middleware and handler | [354](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:354>) |
| PUT | `/api/v1/admin/groups/:id/rpm-overrides` | h.Admin.Group.BatchSetGroupRPMOverrides | normal server; See group middleware and handler | [355](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:355>) |
| DELETE | `/api/v1/admin/groups/:id/rpm-overrides` | h.Admin.Group.ClearGroupRPMOverrides | normal server; See group middleware and handler | [356](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:356>) |
| GET | `/api/v1/admin/groups/:id/api-keys` | h.Admin.Group.GetGroupAPIKeys | normal server; See group middleware and handler | [357](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:357>) |

### registerAccountRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/accounts` | h.Admin.Account.List | normal server; See group middleware and handler | [364](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:364>) |
| GET | `/api/v1/admin/accounts/upstream-billing-probe/settings` | h.Admin.Account.GetUpstreamBillingProbeSettings | normal server; See group middleware and handler | [365](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:365>) |
| PUT | `/api/v1/admin/accounts/upstream-billing-probe/settings` | h.Admin.Account.UpdateUpstreamBillingProbeSettings | normal server; See group middleware and handler | [366](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:366>) |
| POST | `/api/v1/admin/accounts/upstream-billing-probe/batch` | h.Admin.Account.ProbeUpstreamBillingBatch | normal server; See group middleware and handler | [367](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:367>) |
| GET | `/api/v1/admin/accounts/ollama-cloud-usage/settings` | h.Admin.Account.GetOllamaCloudUsageSettings | normal server; See group middleware and handler | [368](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:368>) |
| PUT | `/api/v1/admin/accounts/ollama-cloud-usage/settings` | h.Admin.Account.UpdateOllamaCloudUsageSettings | normal server; See group middleware and handler | [369](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:369>) |
| GET | `/api/v1/admin/accounts/:id` | h.Admin.Account.GetByID | normal server; See group middleware and handler | [370](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:370>) |
| POST | `/api/v1/admin/accounts` | h.Admin.Account.Create | normal server; See group middleware and handler | [371](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:371>) |
| POST | `/api/v1/admin/accounts/:id/duplicate` | h.Admin.Account.Duplicate | normal server; See group middleware and handler | [372](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:372>) |
| POST | `/api/v1/admin/accounts/check-mixed-channel` | h.Admin.Account.CheckMixedChannel | normal server; See group middleware and handler | [373](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:373>) |
| POST | `/api/v1/admin/accounts/import/codex-session` | h.Admin.Account.ImportCodexSession | normal server; See group middleware and handler | [374](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:374>) |
| POST | `/api/v1/admin/accounts/sync/crs` | h.Admin.Account.SyncFromCRS | normal server; See group middleware and handler | [375](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:375>) |
| POST | `/api/v1/admin/accounts/sync/crs/preview` | h.Admin.Account.PreviewFromCRS | normal server; See group middleware and handler | [376](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:376>) |
| PUT | `/api/v1/admin/accounts/:id` | h.Admin.Account.Update | normal server; See group middleware and handler | [377](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:377>) |
| PUT | `/api/v1/admin/accounts/:id/upstream-billing-probe` | h.Admin.Account.SetUpstreamBillingProbeEnabled | normal server; See group middleware and handler | [378](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:378>) |
| POST | `/api/v1/admin/accounts/:id/upstream-billing-probe` | h.Admin.Account.ProbeUpstreamBilling | normal server; See group middleware and handler | [379](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:379>) |
| GET | `/api/v1/admin/accounts/:id/ollama-cloud-usage` | h.Admin.Account.GetOllamaCloudUsage | normal server; See group middleware and handler | [380](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:380>) |
| PUT | `/api/v1/admin/accounts/:id/ollama-cloud-usage/session` | h.Admin.Account.SaveOllamaCloudUsageSession | normal server; See group middleware and handler | [381](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:381>) |
| DELETE | `/api/v1/admin/accounts/:id/ollama-cloud-usage/session` | h.Admin.Account.DeleteOllamaCloudUsageSession | normal server; See group middleware and handler | [382](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:382>) |
| PUT | `/api/v1/admin/accounts/:id/ollama-cloud-usage/auto-refresh` | h.Admin.Account.SetOllamaCloudUsageAutoRefresh | normal server; See group middleware and handler | [383](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:383>) |
| POST | `/api/v1/admin/accounts/:id/ollama-cloud-usage/refresh` | h.Admin.Account.RefreshOllamaCloudUsage | normal server; See group middleware and handler | [384](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:384>) |
| DELETE | `/api/v1/admin/accounts/:id` | h.Admin.Account.Delete | normal server; See group middleware and handler | [385](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:385>) |
| POST | `/api/v1/admin/accounts/:id/test` | h.Admin.Account.Test | normal server; See group middleware and handler | [386](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:386>) |
| POST | `/api/v1/admin/accounts/:id/recover-state` | h.Admin.Account.RecoverState | normal server; See group middleware and handler | [387](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:387>) |
| POST | `/api/v1/admin/accounts/:id/refresh` | h.Admin.Account.Refresh | normal server; See group middleware and handler | [388](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:388>) |
| POST | `/api/v1/admin/accounts/:id/apply-oauth-credentials` | h.Admin.Account.ApplyOAuthCredentials | normal server; See group middleware and handler | [389](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:389>) |
| POST | `/api/v1/admin/accounts/:id/set-privacy` | h.Admin.Account.SetPrivacy | normal server; See group middleware and handler | [390](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:390>) |
| GET | `/api/v1/admin/accounts/:id/stats` | h.Admin.Account.GetStats | normal server; See group middleware and handler | [391](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:391>) |
| POST | `/api/v1/admin/accounts/:id/clear-error` | h.Admin.Account.ClearError | normal server; See group middleware and handler | [392](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:392>) |
| POST | `/api/v1/admin/accounts/:id/revert-proxy-fallback` | h.Admin.Account.RevertProxyFallback | normal server; See group middleware and handler | [393](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:393>) |
| GET | `/api/v1/admin/accounts/:id/usage` | h.Admin.Account.GetUsage | normal server; See group middleware and handler | [394](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:394>) |
| GET | `/api/v1/admin/accounts/:id/today-stats` | h.Admin.Account.GetTodayStats | normal server; See group middleware and handler | [395](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:395>) |
| POST | `/api/v1/admin/accounts/usage/batch` | h.Admin.Account.GetBatchUsage | normal server; See group middleware and handler | [396](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:396>) |
| POST | `/api/v1/admin/accounts/today-stats/batch` | h.Admin.Account.GetBatchTodayStats | normal server; See group middleware and handler | [397](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:397>) |
| POST | `/api/v1/admin/accounts/:id/clear-rate-limit` | h.Admin.Account.ClearRateLimit | normal server; See group middleware and handler | [398](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:398>) |
| POST | `/api/v1/admin/accounts/:id/reset-quota` | h.Admin.Account.ResetQuota | normal server; See group middleware and handler | [399](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:399>) |
| GET | `/api/v1/admin/accounts/:id/temp-unschedulable` | h.Admin.Account.GetTempUnschedulable | normal server; See group middleware and handler | [400](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:400>) |
| DELETE | `/api/v1/admin/accounts/:id/temp-unschedulable` | h.Admin.Account.ClearTempUnschedulable | normal server; See group middleware and handler | [401](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:401>) |
| POST | `/api/v1/admin/accounts/:id/schedulable` | h.Admin.Account.SetSchedulable | normal server; See group middleware and handler | [402](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:402>) |
| POST | `/api/v1/admin/accounts/models/sync-upstream-preview` | h.Admin.Account.SyncUpstreamModelsPreview | normal server; See group middleware and handler | [403](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:403>) |
| GET | `/api/v1/admin/accounts/:id/models` | h.Admin.Account.GetAvailableModels | normal server; See group middleware and handler | [404](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:404>) |
| POST | `/api/v1/admin/accounts/:id/models/sync-upstream` | h.Admin.Account.SyncUpstreamModels | normal server; See group middleware and handler | [405](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:405>) |
| POST | `/api/v1/admin/accounts/batch` | h.Admin.Account.BatchCreate | normal server; See group middleware and handler | [406](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:406>) |
| GET | `/api/v1/admin/accounts/data` | h.Admin.Account.ExportData | normal server; See group middleware and handler | [408](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:408>) |
| POST | `/api/v1/admin/accounts/data` | h.Admin.Account.ImportData | normal server; See group middleware and handler | [409](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:409>) |
| POST | `/api/v1/admin/accounts/batch-update-credentials` | h.Admin.Account.BatchUpdateCredentials | normal server; See group middleware and handler | [410](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:410>) |
| POST | `/api/v1/admin/accounts/bulk-update` | h.Admin.Account.BulkUpdate | normal server; See group middleware and handler | [411](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:411>) |
| POST | `/api/v1/admin/accounts/batch-delete` | h.Admin.Account.BatchDelete | normal server; See group middleware and handler | [412](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:412>) |
| POST | `/api/v1/admin/accounts/batch-clear-error` | h.Admin.Account.BatchClearError | normal server; See group middleware and handler | [413](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:413>) |
| POST | `/api/v1/admin/accounts/batch-refresh` | h.Admin.Account.BatchRefresh | normal server; See group middleware and handler | [414](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:414>) |
| GET | `/api/v1/admin/accounts/antigravity/default-model-mapping` | h.Admin.Account.GetAntigravityDefaultModelMapping | normal server; See group middleware and handler | [417](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:417>) |
| POST | `/api/v1/admin/accounts/:id/shadow` | h.Admin.OpenAIOAuth.CreateShadow | normal server; See group middleware and handler | [420](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:420>) |
| POST | `/api/v1/admin/accounts/generate-auth-url` | h.Admin.OAuth.GenerateAuthURL | normal server; See group middleware and handler | [423](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:423>) |
| POST | `/api/v1/admin/accounts/generate-setup-token-url` | h.Admin.OAuth.GenerateSetupTokenURL | normal server; See group middleware and handler | [424](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:424>) |
| POST | `/api/v1/admin/accounts/exchange-code` | h.Admin.OAuth.ExchangeCode | normal server; See group middleware and handler | [425](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:425>) |
| POST | `/api/v1/admin/accounts/exchange-setup-token-code` | h.Admin.OAuth.ExchangeSetupTokenCode | normal server; See group middleware and handler | [426](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:426>) |
| POST | `/api/v1/admin/accounts/cookie-auth` | h.Admin.OAuth.CookieAuth | normal server; See group middleware and handler | [427](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:427>) |
| POST | `/api/v1/admin/accounts/setup-token-cookie-auth` | h.Admin.OAuth.SetupTokenCookieAuth | normal server; See group middleware and handler | [428](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:428>) |

### registerAnnouncementRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/announcements` | h.Admin.Announcement.List | normal server; See group middleware and handler | [435](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:435>) |
| POST | `/api/v1/admin/announcements` | h.Admin.Announcement.Create | normal server; See group middleware and handler | [436](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:436>) |
| GET | `/api/v1/admin/announcements/:id` | h.Admin.Announcement.GetByID | normal server; See group middleware and handler | [437](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:437>) |
| PUT | `/api/v1/admin/announcements/:id` | h.Admin.Announcement.Update | normal server; See group middleware and handler | [438](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:438>) |
| DELETE | `/api/v1/admin/announcements/:id` | h.Admin.Announcement.Delete | normal server; See group middleware and handler | [439](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:439>) |
| GET | `/api/v1/admin/announcements/:id/read-status` | h.Admin.Announcement.ListReadStatus | normal server; See group middleware and handler | [440](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:440>) |

### registerOpenAIOAuthRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/admin/openai/generate-auth-url` | h.Admin.OpenAIOAuth.GenerateAuthURL | normal server; See group middleware and handler | [447](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:447>) |
| POST | `/api/v1/admin/openai/exchange-code` | h.Admin.OpenAIOAuth.ExchangeCode | normal server; See group middleware and handler | [448](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:448>) |
| POST | `/api/v1/admin/openai/refresh-token` | h.Admin.OpenAIOAuth.RefreshToken | normal server; See group middleware and handler | [449](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:449>) |
| POST | `/api/v1/admin/openai/accounts/:id/refresh` | h.Admin.OpenAIOAuth.RefreshAccountToken | normal server; See group middleware and handler | [450](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:450>) |
| POST | `/api/v1/admin/openai/create-from-oauth` | h.Admin.OpenAIOAuth.CreateAccountFromOAuth | normal server; See group middleware and handler | [451](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:451>) |
| POST | `/api/v1/admin/openai/create-from-codex-pat` | h.Admin.OpenAIOAuth.CreateAccountFromCodexPAT | normal server; See group middleware and handler | [452](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:452>) |
| GET | `/api/v1/admin/openai/accounts/:id/quota` | h.Admin.OpenAIOAuth.QueryQuota | normal server; See group middleware and handler | [453](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:453>) |
| POST | `/api/v1/admin/openai/accounts/:id/quota/refresh` | h.Admin.OpenAIOAuth.RefreshQuota | normal server; See group middleware and handler | [454](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:454>) |
| POST | `/api/v1/admin/openai/accounts/:id/reset-quota` | h.Admin.OpenAIOAuth.ResetQuota | normal server; See group middleware and handler | [455](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:455>) |

### registerGeminiOAuthRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/admin/gemini/oauth/auth-url` | h.Admin.GeminiOAuth.GenerateAuthURL | normal server; See group middleware and handler | [462](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:462>) |
| POST | `/api/v1/admin/gemini/oauth/exchange-code` | h.Admin.GeminiOAuth.ExchangeCode | normal server; See group middleware and handler | [463](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:463>) |
| GET | `/api/v1/admin/gemini/oauth/capabilities` | h.Admin.GeminiOAuth.GetCapabilities | normal server; See group middleware and handler | [464](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:464>) |

### registerAntigravityOAuthRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/admin/antigravity/oauth/auth-url` | h.Admin.AntigravityOAuth.GenerateAuthURL | normal server; See group middleware and handler | [471](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:471>) |
| POST | `/api/v1/admin/antigravity/oauth/exchange-code` | h.Admin.AntigravityOAuth.ExchangeCode | normal server; See group middleware and handler | [472](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:472>) |
| POST | `/api/v1/admin/antigravity/oauth/refresh-token` | h.Admin.AntigravityOAuth.RefreshToken | normal server; See group middleware and handler | [473](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:473>) |

### registerGrokOAuthRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/grok/oauth/capabilities` | h.Admin.GrokOAuth.GetCapabilities | normal server; See group middleware and handler | [480](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:480>) |
| POST | `/api/v1/admin/grok/oauth/auth-url` | h.Admin.GrokOAuth.GenerateAuthURL | normal server; See group middleware and handler | [481](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:481>) |
| POST | `/api/v1/admin/grok/oauth/exchange-code` | h.Admin.GrokOAuth.ExchangeCode | normal server; See group middleware and handler | [482](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:482>) |
| POST | `/api/v1/admin/grok/oauth/refresh-token` | h.Admin.GrokOAuth.RefreshToken | normal server; See group middleware and handler | [483](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:483>) |
| POST | `/api/v1/admin/grok/oauth/sso-token` | h.Admin.GrokOAuth.ValidateSSOToken | normal server; See group middleware and handler | [484](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:484>) |
| POST | `/api/v1/admin/grok/oauth/password` | h.Admin.GrokOAuth.AuthorizePassword | normal server; See group middleware and handler | [485](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:485>) |
| POST | `/api/v1/admin/grok/oauth/create-from-oauth` | h.Admin.GrokOAuth.CreateAccountFromOAuth | normal server; See group middleware and handler | [486](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:486>) |
| POST | `/api/v1/admin/grok/sso-to-oauth` | h.Admin.GrokOAuth.CreateAccountsFromSSO | normal server; See group middleware and handler | [487](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:487>) |
| POST | `/api/v1/admin/grok/oauth/reconcile` | h.Admin.GrokOAuth.ReconcileOAuthAccounts | normal server; See group middleware and handler | [488](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:488>) |
| POST | `/api/v1/admin/grok/accounts/:id/refresh` | h.Admin.GrokOAuth.RefreshAccountToken | normal server; See group middleware and handler | [489](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:489>) |
| GET | `/api/v1/admin/grok/accounts/:id/quota` | h.Admin.GrokOAuth.QueryQuota | normal server; See group middleware and handler | [490](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:490>) |
| POST | `/api/v1/admin/grok/accounts/:id/reset-quota` | h.Admin.GrokOAuth.ResetQuota | normal server; See group middleware and handler | [491](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:491>) |
| GET | `/api/v1/admin/grok/runtime-sanity` | h.Admin.GrokOAuth.RuntimeSanity | normal server; See group middleware and handler | [492](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:492>) |

### registerCNProviderRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/cn-providers/accounts/:id/quota` | h.Admin.CNProvider.QueryQuota | normal server; See group middleware and handler | [501](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:501>) |
| GET | `/api/v1/admin/cn-providers/accounts/:id/balance` | h.Admin.CNProvider.QueryBalance | normal server; See group middleware and handler | [503](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:503>) |

### registerProxyRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/proxies` | h.Admin.Proxy.List | normal server; See group middleware and handler | [510](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:510>) |
| GET | `/api/v1/admin/proxies/all` | h.Admin.Proxy.GetAll | normal server; See group middleware and handler | [511](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:511>) |
| GET | `/api/v1/admin/proxies/data` | h.Admin.Proxy.ExportData | normal server; See group middleware and handler | [513](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:513>) |
| POST | `/api/v1/admin/proxies/data` | h.Admin.Proxy.ImportData | normal server; See group middleware and handler | [514](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:514>) |
| GET | `/api/v1/admin/proxies/:id` | h.Admin.Proxy.GetByID | normal server; See group middleware and handler | [515](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:515>) |
| POST | `/api/v1/admin/proxies` | h.Admin.Proxy.Create | normal server; See group middleware and handler | [516](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:516>) |
| PUT | `/api/v1/admin/proxies/:id` | h.Admin.Proxy.Update | normal server; See group middleware and handler | [517](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:517>) |
| DELETE | `/api/v1/admin/proxies/:id` | h.Admin.Proxy.Delete | normal server; See group middleware and handler | [518](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:518>) |
| POST | `/api/v1/admin/proxies/:id/test` | h.Admin.Proxy.Test | normal server; See group middleware and handler | [519](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:519>) |
| POST | `/api/v1/admin/proxies/:id/quality-check` | h.Admin.Proxy.CheckQuality | normal server; See group middleware and handler | [520](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:520>) |
| GET | `/api/v1/admin/proxies/:id/stats` | h.Admin.Proxy.GetStats | normal server; See group middleware and handler | [521](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:521>) |
| GET | `/api/v1/admin/proxies/:id/accounts` | h.Admin.Proxy.GetProxyAccounts | normal server; See group middleware and handler | [522](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:522>) |
| POST | `/api/v1/admin/proxies/batch-delete` | h.Admin.Proxy.BatchDelete | normal server; See group middleware and handler | [523](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:523>) |
| POST | `/api/v1/admin/proxies/batch` | h.Admin.Proxy.BatchCreate | normal server; See group middleware and handler | [524](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:524>) |

### registerRedeemCodeRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/redeem-codes` | h.Admin.Redeem.List | normal server; See group middleware and handler | [531](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:531>) |
| GET | `/api/v1/admin/redeem-codes/stats` | h.Admin.Redeem.GetStats | normal server; See group middleware and handler | [532](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:532>) |
| GET | `/api/v1/admin/redeem-codes/export` | h.Admin.Redeem.Export | normal server; See group middleware and handler | [533](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:533>) |
| GET | `/api/v1/admin/redeem-codes/:id` | h.Admin.Redeem.GetByID | normal server; See group middleware and handler | [534](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:534>) |
| POST | `/api/v1/admin/redeem-codes/create-and-redeem` | h.Admin.Redeem.CreateAndRedeem | normal server; See group middleware and handler | [535](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:535>) |
| POST | `/api/v1/admin/redeem-codes/generate` | h.Admin.Redeem.Generate | normal server; See group middleware and handler | [536](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:536>) |
| DELETE | `/api/v1/admin/redeem-codes/:id` | h.Admin.Redeem.Delete | normal server; See group middleware and handler | [537](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:537>) |
| POST | `/api/v1/admin/redeem-codes/batch-delete` | h.Admin.Redeem.BatchDelete | normal server; See group middleware and handler | [538](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:538>) |
| POST | `/api/v1/admin/redeem-codes/batch-update` | h.Admin.Redeem.BatchUpdate | normal server; See group middleware and handler | [539](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:539>) |
| POST | `/api/v1/admin/redeem-codes/:id/expire` | h.Admin.Redeem.Expire | normal server; See group middleware and handler | [540](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:540>) |

### registerPromoCodeRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/promo-codes` | h.Admin.Promo.List | normal server; See group middleware and handler | [547](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:547>) |
| GET | `/api/v1/admin/promo-codes/:id` | h.Admin.Promo.GetByID | normal server; See group middleware and handler | [548](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:548>) |
| POST | `/api/v1/admin/promo-codes` | h.Admin.Promo.Create | normal server; See group middleware and handler | [549](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:549>) |
| PUT | `/api/v1/admin/promo-codes/:id` | h.Admin.Promo.Update | normal server; See group middleware and handler | [550](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:550>) |
| DELETE | `/api/v1/admin/promo-codes/:id` | h.Admin.Promo.Delete | normal server; See group middleware and handler | [551](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:551>) |
| GET | `/api/v1/admin/promo-codes/:id/usages` | h.Admin.Promo.GetUsages | normal server; See group middleware and handler | [552](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:552>) |

### registerSettingsRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/settings` | h.Admin.Setting.GetSettings | normal server; See group middleware and handler | [559](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:559>) |
| PUT | `/api/v1/admin/settings` | h.Admin.Setting.UpdateSettings | normal server; See group middleware and handler | [560](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:560>) |
| POST | `/api/v1/admin/settings/test-smtp` | h.Admin.Setting.TestSMTPConnection | normal server; See group middleware and handler | [561](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:561>) |
| POST | `/api/v1/admin/settings/send-test-email` | h.Admin.Setting.SendTestEmail | normal server; See group middleware and handler | [562](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:562>) |
| GET | `/api/v1/admin/settings/email-templates` | h.Admin.Setting.ListEmailTemplates | normal server; See group middleware and handler | [563](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:563>) |
| POST | `/api/v1/admin/settings/email-template-preview` | h.Admin.Setting.PreviewEmailTemplate | normal server; See group middleware and handler | [564](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:564>) |
| GET | `/api/v1/admin/settings/email-templates/:event/:locale` | h.Admin.Setting.GetEmailTemplate | normal server; See group middleware and handler | [565](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:565>) |
| PUT | `/api/v1/admin/settings/email-templates/:event/:locale` | h.Admin.Setting.UpdateEmailTemplate | normal server; See group middleware and handler | [566](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:566>) |
| POST | `/api/v1/admin/settings/email-templates/:event/:locale/restore-official` | h.Admin.Setting.RestoreOfficialEmailTemplate | normal server; See group middleware and handler | [567](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:567>) |
| GET | `/api/v1/admin/settings/upstream-state` | h.Admin.Setting.GetUpstreamStateSettings | normal server; See group middleware and handler | [568](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:568>) |
| PUT | `/api/v1/admin/settings/upstream-state` | h.Admin.Setting.SetUpstreamStateSettings | normal server; See group middleware and handler | [569](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:569>) |
| GET | `/api/v1/admin/settings/upstream-state/matrix` | h.Admin.Setting.UpstreamStateMatrix | normal server; See group middleware and handler | [570](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:570>) |
| PUT | `/api/v1/admin/settings/upstream-state/pair` | h.Admin.Setting.SetUpstreamStatePair | normal server; See group middleware and handler | [571](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:571>) |
| PUT | `/api/v1/admin/settings/upstream-state/state` | h.Admin.Setting.SetUpstreamState | normal server; See group middleware and handler | [572](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:572>) |
| POST | `/api/v1/admin/settings/upstream-state/refresh` | h.Admin.Setting.RefreshUpstreamState | normal server; See group middleware and handler | [573](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:573>) |
| GET | `/api/v1/admin/settings/admin-api-key` | h.Admin.Setting.GetAdminAPIKey | normal server; See group middleware and handler | [575](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:575>) |
| POST | `/api/v1/admin/settings/admin-api-key/regenerate` | h.Admin.Setting.RegenerateAdminAPIKey | normal server; See group middleware and handler | [576](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:576>) |
| DELETE | `/api/v1/admin/settings/admin-api-key` | h.Admin.Setting.DeleteAdminAPIKey | normal server; See group middleware and handler | [577](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:577>) |
| GET | `/api/v1/admin/settings/overload-cooldown` | h.Admin.Setting.GetOverloadCooldownSettings | normal server; See group middleware and handler | [579](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:579>) |
| PUT | `/api/v1/admin/settings/overload-cooldown` | h.Admin.Setting.UpdateOverloadCooldownSettings | normal server; See group middleware and handler | [580](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:580>) |
| GET | `/api/v1/admin/settings/rate-limit-429-cooldown` | h.Admin.Setting.GetRateLimit429CooldownSettings | normal server; See group middleware and handler | [582](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:582>) |
| PUT | `/api/v1/admin/settings/rate-limit-429-cooldown` | h.Admin.Setting.UpdateRateLimit429CooldownSettings | normal server; See group middleware and handler | [583](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:583>) |
| GET | `/api/v1/admin/settings/panel-rate-limit` | h.Admin.Setting.GetPanelRateLimitSettings | normal server; See group middleware and handler | [585](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:585>) |
| PUT | `/api/v1/admin/settings/panel-rate-limit` | h.Admin.Setting.UpdatePanelRateLimitSettings | normal server; See group middleware and handler | [586](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:586>) |
| GET | `/api/v1/admin/settings/stream-timeout` | h.Admin.Setting.GetStreamTimeoutSettings | normal server; See group middleware and handler | [588](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:588>) |
| PUT | `/api/v1/admin/settings/stream-timeout` | h.Admin.Setting.UpdateStreamTimeoutSettings | normal server; See group middleware and handler | [589](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:589>) |
| GET | `/api/v1/admin/settings/rectifier` | h.Admin.Setting.GetRectifierSettings | normal server; See group middleware and handler | [591](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:591>) |
| PUT | `/api/v1/admin/settings/rectifier` | h.Admin.Setting.UpdateRectifierSettings | normal server; See group middleware and handler | [592](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:592>) |
| GET | `/api/v1/admin/settings/beta-policy` | h.Admin.Setting.GetBetaPolicySettings | normal server; See group middleware and handler | [594](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:594>) |
| PUT | `/api/v1/admin/settings/beta-policy` | h.Admin.Setting.UpdateBetaPolicySettings | normal server; See group middleware and handler | [595](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:595>) |
| GET | `/api/v1/admin/settings/web-search-emulation` | h.Admin.Setting.GetWebSearchEmulationConfig | normal server; See group middleware and handler | [597](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:597>) |
| PUT | `/api/v1/admin/settings/web-search-emulation` | h.Admin.Setting.UpdateWebSearchEmulationConfig | normal server; See group middleware and handler | [598](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:598>) |
| POST | `/api/v1/admin/settings/web-search-emulation/test` | h.Admin.Setting.TestWebSearchEmulation | normal server; See group middleware and handler | [599](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:599>) |
| POST | `/api/v1/admin/settings/web-search-emulation/reset-usage` | h.Admin.Setting.ResetWebSearchUsage | normal server; See group middleware and handler | [600](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:600>) |
| GET | `/api/v1/admin/access-blocks/settings` | h.Admin.AccessBlock.GetSettings | normal server; See group middleware and handler | [604](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:604>) |
| PATCH | `/api/v1/admin/access-blocks/settings` | h.Admin.AccessBlock.UpdateSettings | normal server; See group middleware and handler | [605](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:605>) |
| GET | `/api/v1/admin/access-blocks` | h.Admin.AccessBlock.List | normal server; See group middleware and handler | [606](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:606>) |
| POST | `/api/v1/admin/access-blocks` | h.Admin.AccessBlock.Add | normal server; See group middleware and handler | [607](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:607>) |
| POST | `/api/v1/admin/access-blocks/remove` | h.Admin.AccessBlock.Remove | normal server; See group middleware and handler | [608](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:608>) |

### registerDataManagementRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/data-management/agent/health` | h.Admin.DataManagement.GetAgentHealth | normal server; Deprecated: disabled health / operation errors | [615](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:615>) |
| GET | `/api/v1/admin/data-management/config` | h.Admin.DataManagement.GetConfig | normal server; Deprecated: disabled health / operation errors | [616](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:616>) |
| PUT | `/api/v1/admin/data-management/config` | h.Admin.DataManagement.UpdateConfig | normal server; Deprecated: disabled health / operation errors | [617](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:617>) |
| GET | `/api/v1/admin/data-management/sources/:source_type/profiles` | h.Admin.DataManagement.ListSourceProfiles | normal server; Deprecated: disabled health / operation errors | [618](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:618>) |
| POST | `/api/v1/admin/data-management/sources/:source_type/profiles` | h.Admin.DataManagement.CreateSourceProfile | normal server; Deprecated: disabled health / operation errors | [619](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:619>) |
| PUT | `/api/v1/admin/data-management/sources/:source_type/profiles/:profile_id` | h.Admin.DataManagement.UpdateSourceProfile | normal server; Deprecated: disabled health / operation errors | [620](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:620>) |
| DELETE | `/api/v1/admin/data-management/sources/:source_type/profiles/:profile_id` | h.Admin.DataManagement.DeleteSourceProfile | normal server; Deprecated: disabled health / operation errors | [621](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:621>) |
| POST | `/api/v1/admin/data-management/sources/:source_type/profiles/:profile_id/activate` | h.Admin.DataManagement.SetActiveSourceProfile | normal server; Deprecated: disabled health / operation errors | [622](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:622>) |
| POST | `/api/v1/admin/data-management/s3/test` | h.Admin.DataManagement.TestS3 | normal server; Deprecated: disabled health / operation errors | [623](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:623>) |
| GET | `/api/v1/admin/data-management/s3/profiles` | h.Admin.DataManagement.ListS3Profiles | normal server; Deprecated: disabled health / operation errors | [624](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:624>) |
| POST | `/api/v1/admin/data-management/s3/profiles` | h.Admin.DataManagement.CreateS3Profile | normal server; Deprecated: disabled health / operation errors | [626](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:626>) |
| PUT | `/api/v1/admin/data-management/s3/profiles/:profile_id` | h.Admin.DataManagement.UpdateS3Profile | normal server; Deprecated: disabled health / operation errors | [627](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:627>) |
| DELETE | `/api/v1/admin/data-management/s3/profiles/:profile_id` | h.Admin.DataManagement.DeleteS3Profile | normal server; Deprecated: disabled health / operation errors | [628](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:628>) |
| POST | `/api/v1/admin/data-management/s3/profiles/:profile_id/activate` | h.Admin.DataManagement.SetActiveS3Profile | normal server; Deprecated: disabled health / operation errors | [629](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:629>) |
| POST | `/api/v1/admin/data-management/backups` | h.Admin.DataManagement.CreateBackupJob | normal server; Deprecated: disabled health / operation errors | [630](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:630>) |
| GET | `/api/v1/admin/data-management/backups` | h.Admin.DataManagement.ListBackupJobs | normal server; Deprecated: disabled health / operation errors | [631](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:631>) |
| GET | `/api/v1/admin/data-management/backups/:job_id` | h.Admin.DataManagement.GetBackupJob | normal server; Deprecated: disabled health / operation errors | [632](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:632>) |

### registerBackupRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/backups/s3-config` | h.Admin.Backup.GetS3Config | normal server; See group middleware and handler | [640](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:640>) |
| PUT | `/api/v1/admin/backups/s3-config` | h.Admin.Backup.UpdateS3Config | normal server; See group middleware and handler | [642](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:642>) |
| POST | `/api/v1/admin/backups/s3-config/test` | h.Admin.Backup.TestS3Connection | normal server; See group middleware and handler | [643](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:643>) |
| GET | `/api/v1/admin/backups/image-storage` | h.Admin.Backup.GetImageStorageConfig | normal server; See group middleware and handler | [646](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:646>) |
| PUT | `/api/v1/admin/backups/image-storage` | h.Admin.Backup.UpdateImageStorageConfig | normal server; See group middleware and handler | [648](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:648>) |
| POST | `/api/v1/admin/backups/image-storage/test` | h.Admin.Backup.TestImageStorageConnection | normal server; See group middleware and handler | [649](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:649>) |
| GET | `/api/v1/admin/backups/schedule` | h.Admin.Backup.GetSchedule | normal server; See group middleware and handler | [652](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:652>) |
| PUT | `/api/v1/admin/backups/schedule` | h.Admin.Backup.UpdateSchedule | normal server; See group middleware and handler | [653](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:653>) |
| POST | `/api/v1/admin/backups` | h.Admin.Backup.CreateBackup | normal server; See group middleware and handler | [656](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:656>) |
| GET | `/api/v1/admin/backups` | h.Admin.Backup.ListBackups | normal server; See group middleware and handler | [657](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:657>) |
| GET | `/api/v1/admin/backups/:id` | h.Admin.Backup.GetBackup | normal server; See group middleware and handler | [658](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:658>) |
| DELETE | `/api/v1/admin/backups/:id` | h.Admin.Backup.DeleteBackup | normal server; See group middleware and handler | [659](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:659>) |
| GET | `/api/v1/admin/backups/:id/download-url` | h.Admin.Backup.GetDownloadURL | normal server; See group middleware and handler | [661](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:661>) |
| POST | `/api/v1/admin/backups/:id/restore` | h.Admin.Backup.RestoreBackup | normal server; See group middleware and handler | [664](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:664>) |

### registerSystemRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/system/version` | h.Admin.System.GetVersion | normal server; See group middleware and handler | [671](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:671>) |
| GET | `/api/v1/admin/system/check-updates` | h.Admin.System.CheckUpdates | normal server; See group middleware and handler | [672](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:672>) |
| GET | `/api/v1/admin/system/update-status/:operation_id` | h.Admin.System.GetUpdateStatus | normal server; See group middleware and handler | [673](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:673>) |
| GET | `/api/v1/admin/system/rollback-versions` | h.Admin.System.GetRollbackVersions | normal server; See group middleware and handler | [674](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:674>) |
| POST | `/api/v1/admin/system/update` | h.Admin.System.PerformUpdate | normal server; See group middleware and handler | [675](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:675>) |
| POST | `/api/v1/admin/system/rollback` | h.Admin.System.Rollback | normal server; See group middleware and handler | [676](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:676>) |
| POST | `/api/v1/admin/system/restart` | h.Admin.System.RestartService | normal server; See group middleware and handler | [677](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:677>) |

### registerSubscriptionRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/subscriptions` | h.Admin.Subscription.List | normal server; See group middleware and handler | [684](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:684>) |
| GET | `/api/v1/admin/subscriptions/:id` | h.Admin.Subscription.GetByID | normal server; See group middleware and handler | [685](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:685>) |
| GET | `/api/v1/admin/subscriptions/:id/progress` | h.Admin.Subscription.GetProgress | normal server; See group middleware and handler | [686](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:686>) |
| POST | `/api/v1/admin/subscriptions/assign` | h.Admin.Subscription.Assign | normal server; See group middleware and handler | [687](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:687>) |
| POST | `/api/v1/admin/subscriptions/bulk-assign` | h.Admin.Subscription.BulkAssign | normal server; See group middleware and handler | [688](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:688>) |
| POST | `/api/v1/admin/subscriptions/:id/extend` | h.Admin.Subscription.Extend | normal server; See group middleware and handler | [689](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:689>) |
| POST | `/api/v1/admin/subscriptions/:id/reset-quota` | h.Admin.Subscription.ResetQuota | normal server; See group middleware and handler | [690](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:690>) |
| POST | `/api/v1/admin/subscriptions/:id/revoke` | h.Admin.Subscription.Revoke | normal server; See group middleware and handler | [691](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:691>) |
| POST | `/api/v1/admin/subscriptions/:id/restore` | h.Admin.Subscription.Restore | normal server; See group middleware and handler | [692](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:692>) |
| DELETE | `/api/v1/admin/subscriptions/:id` | h.Admin.Subscription.Revoke | normal server; See group middleware and handler | [693](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:693>) |
| GET | `/api/v1/admin/subscription-plans/:id/subscriptions` | h.Admin.Subscription.ListByPlan | normal server; See group middleware and handler | [697](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:697>) |
| GET | `/api/v1/admin/users/:id/subscriptions` | h.Admin.Subscription.ListByUser | normal server; See group middleware and handler | [700](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:700>) |

### registerUsageRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/usage` | h.Admin.Usage.List | normal server; See group middleware and handler | [706](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:706>) |
| GET | `/api/v1/admin/usage/stats` | h.Admin.Usage.Stats | normal server; See group middleware and handler | [707](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:707>) |
| GET | `/api/v1/admin/usage/search-users` | h.Admin.Usage.SearchUsers | normal server; See group middleware and handler | [708](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:708>) |
| GET | `/api/v1/admin/usage/search-api-keys` | h.Admin.Usage.SearchAPIKeys | normal server; See group middleware and handler | [709](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:709>) |
| GET | `/api/v1/admin/usage/cleanup-tasks` | h.Admin.Usage.ListCleanupTasks | normal server; See group middleware and handler | [710](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:710>) |
| POST | `/api/v1/admin/usage/cleanup-tasks` | h.Admin.Usage.CreateCleanupTask | normal server; See group middleware and handler | [711](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:711>) |
| POST | `/api/v1/admin/usage/cleanup-tasks/:id/cancel` | h.Admin.Usage.CancelCleanupTask | normal server; See group middleware and handler | [712](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:712>) |

### registerUserAttributeRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/user-attributes` | h.Admin.UserAttribute.ListDefinitions | normal server; See group middleware and handler | [719](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:719>) |
| POST | `/api/v1/admin/user-attributes` | h.Admin.UserAttribute.CreateDefinition | normal server; See group middleware and handler | [720](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:720>) |
| POST | `/api/v1/admin/user-attributes/batch` | h.Admin.UserAttribute.GetBatchUserAttributes | normal server; See group middleware and handler | [721](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:721>) |
| PUT | `/api/v1/admin/user-attributes/reorder` | h.Admin.UserAttribute.ReorderDefinitions | normal server; See group middleware and handler | [722](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:722>) |
| PUT | `/api/v1/admin/user-attributes/:id` | h.Admin.UserAttribute.UpdateDefinition | normal server; See group middleware and handler | [723](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:723>) |
| DELETE | `/api/v1/admin/user-attributes/:id` | h.Admin.UserAttribute.DeleteDefinition | normal server; See group middleware and handler | [724](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:724>) |

### registerScheduledTestRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/admin/scheduled-test-plans` | h.Admin.ScheduledTest.Create | normal server; See group middleware and handler | [731](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:731>) |
| PUT | `/api/v1/admin/scheduled-test-plans/:id` | h.Admin.ScheduledTest.Update | normal server; See group middleware and handler | [732](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:732>) |
| DELETE | `/api/v1/admin/scheduled-test-plans/:id` | h.Admin.ScheduledTest.Delete | normal server; See group middleware and handler | [733](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:733>) |
| GET | `/api/v1/admin/scheduled-test-plans/:id/results` | h.Admin.ScheduledTest.ListResults | normal server; See group middleware and handler | [734](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:734>) |
| GET | `/api/v1/admin/accounts/:id/scheduled-test-plans` | h.Admin.ScheduledTest.ListByAccount | normal server; See group middleware and handler | [737](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:737>) |

### registerErrorPassthroughRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/error-passthrough-rules` | h.Admin.ErrorPassthrough.List | normal server; See group middleware and handler | [743](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:743>) |
| GET | `/api/v1/admin/error-passthrough-rules/:id` | h.Admin.ErrorPassthrough.GetByID | normal server; See group middleware and handler | [744](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:744>) |
| POST | `/api/v1/admin/error-passthrough-rules` | h.Admin.ErrorPassthrough.Create | normal server; See group middleware and handler | [745](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:745>) |
| PUT | `/api/v1/admin/error-passthrough-rules/:id` | h.Admin.ErrorPassthrough.Update | normal server; See group middleware and handler | [746](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:746>) |
| DELETE | `/api/v1/admin/error-passthrough-rules/:id` | h.Admin.ErrorPassthrough.Delete | normal server; See group middleware and handler | [747](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:747>) |

### registerTLSFingerprintProfileRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/tls-fingerprint-profiles` | h.Admin.TLSFingerprintProfile.List | normal server; See group middleware and handler | [754](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:754>) |
| GET | `/api/v1/admin/tls-fingerprint-profiles/:id` | h.Admin.TLSFingerprintProfile.GetByID | normal server; See group middleware and handler | [755](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:755>) |
| POST | `/api/v1/admin/tls-fingerprint-profiles` | h.Admin.TLSFingerprintProfile.Create | normal server; See group middleware and handler | [756](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:756>) |
| PUT | `/api/v1/admin/tls-fingerprint-profiles/:id` | h.Admin.TLSFingerprintProfile.Update | normal server; See group middleware and handler | [757](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:757>) |
| DELETE | `/api/v1/admin/tls-fingerprint-profiles/:id` | h.Admin.TLSFingerprintProfile.Delete | normal server; See group middleware and handler | [758](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:758>) |

### registerPluginRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/plugins` | h.Admin.Plugin.List | normal server; Plugin settings/capability/trust checks | [765](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:765>) |
| GET | `/api/v1/admin/plugins/:id` | h.Admin.Plugin.Get | normal server; Plugin settings/capability/trust checks | [766](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:766>) |
| POST | `/api/v1/admin/plugins/upload` | h.Admin.Plugin.Upload | normal server; Plugin settings/capability/trust checks | [767](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:767>) |
| POST | `/api/v1/admin/plugins/:id/enable` | h.Admin.Plugin.Enable | normal server; Plugin settings/capability/trust checks | [768](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:768>) |
| POST | `/api/v1/admin/plugins/:id/disable` | h.Admin.Plugin.Disable | normal server; Plugin settings/capability/trust checks | [769](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:769>) |
| DELETE | `/api/v1/admin/plugins/:id` | h.Admin.Plugin.Delete | normal server; Plugin settings/capability/trust checks | [770](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:770>) |
| GET | `/api/v1/admin/plugins/:id/config` | h.Admin.Plugin.GetConfig | normal server; Plugin settings/capability/trust checks | [771](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:771>) |
| PUT | `/api/v1/admin/plugins/:id/config` | h.Admin.Plugin.SaveConfig | normal server; Plugin settings/capability/trust checks | [772](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:772>) |
| POST | `/api/v1/admin/plugins/:id/test` | h.Admin.Plugin.Test | normal server; Plugin settings/capability/trust checks | [773](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:773>) |
| POST | `/api/v1/admin/plugins/:id/ui-session` | h.Admin.Plugin.CreateUISession | normal server; Plugin settings/capability/trust checks | [774](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:774>) |

### registerChannelRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/channels` | h.Admin.Channel.List | normal server; See group middleware and handler | [781](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:781>) |
| GET | `/api/v1/admin/channels/model-pricing` | h.Admin.Channel.GetModelDefaultPricing | normal server; See group middleware and handler | [782](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:782>) |
| GET | `/api/v1/admin/channels/pricing/sync-models` | h.Admin.Channel.SyncPricingModels | normal server; See group middleware and handler | [783](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:783>) |
| GET | `/api/v1/admin/channels/:id` | h.Admin.Channel.GetByID | normal server; See group middleware and handler | [784](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:784>) |
| POST | `/api/v1/admin/channels` | h.Admin.Channel.Create | normal server; See group middleware and handler | [785](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:785>) |
| PUT | `/api/v1/admin/channels/:id` | h.Admin.Channel.Update | normal server; See group middleware and handler | [786](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:786>) |
| DELETE | `/api/v1/admin/channels/:id` | h.Admin.Channel.Delete | normal server; See group middleware and handler | [787](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:787>) |

### registerChannelMonitorRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/channel-monitors` | h.Admin.ChannelMonitor.List | normal server; See group middleware and handler | [796](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:796>) |
| POST | `/api/v1/admin/channel-monitors` | h.Admin.ChannelMonitor.Create | normal server; See group middleware and handler | [797](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:797>) |
| GET | `/api/v1/admin/channel-monitors/:id` | h.Admin.ChannelMonitor.Get | normal server; See group middleware and handler | [798](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:798>) |
| POST | `/api/v1/admin/channel-monitors/:id/duplicate` | h.Admin.ChannelMonitor.Duplicate | normal server; See group middleware and handler | [799](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:799>) |
| PUT | `/api/v1/admin/channel-monitors/:id` | h.Admin.ChannelMonitor.Update | normal server; See group middleware and handler | [800](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:800>) |
| DELETE | `/api/v1/admin/channel-monitors/:id` | h.Admin.ChannelMonitor.Delete | normal server; See group middleware and handler | [801](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:801>) |
| POST | `/api/v1/admin/channel-monitors/:id/run` | h.Admin.ChannelMonitor.Run | normal server; See group middleware and handler | [802](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:802>) |
| GET | `/api/v1/admin/channel-monitors/:id/history` | h.Admin.ChannelMonitor.History | normal server; See group middleware and handler | [803](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:803>) |
| GET | `/api/v1/admin/channel-monitor-templates` | h.Admin.ChannelMonitorTemplate.List | normal server; See group middleware and handler | [809](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:809>) |
| POST | `/api/v1/admin/channel-monitor-templates` | h.Admin.ChannelMonitorTemplate.Create | normal server; See group middleware and handler | [810](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:810>) |
| GET | `/api/v1/admin/channel-monitor-templates/:id` | h.Admin.ChannelMonitorTemplate.Get | normal server; See group middleware and handler | [811](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:811>) |
| PUT | `/api/v1/admin/channel-monitor-templates/:id` | h.Admin.ChannelMonitorTemplate.Update | normal server; See group middleware and handler | [812](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:812>) |
| DELETE | `/api/v1/admin/channel-monitor-templates/:id` | h.Admin.ChannelMonitorTemplate.Delete | normal server; See group middleware and handler | [813](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:813>) |
| GET | `/api/v1/admin/channel-monitor-templates/:id/monitors` | h.Admin.ChannelMonitorTemplate.AssociatedMonitors | normal server; See group middleware and handler | [814](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:814>) |
| POST | `/api/v1/admin/channel-monitor-templates/:id/apply` | h.Admin.ChannelMonitorTemplate.Apply | normal server; See group middleware and handler | [815](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:815>) |

### registerAffiliateRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/affiliates/invites` | h.Admin.Affiliate.ListInviteRecords | normal server; See group middleware and handler | [823](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:823>) |
| GET | `/api/v1/admin/affiliates/rebates` | h.Admin.Affiliate.ListRebateRecords | normal server; See group middleware and handler | [824](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:824>) |
| GET | `/api/v1/admin/affiliates/transfers` | h.Admin.Affiliate.ListTransferRecords | normal server; See group middleware and handler | [825](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:825>) |
| GET | `/api/v1/admin/affiliates/users` | h.Admin.Affiliate.ListUsers | normal server; See group middleware and handler | [829](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:829>) |
| GET | `/api/v1/admin/affiliates/users/lookup` | h.Admin.Affiliate.LookupUsers | normal server; See group middleware and handler | [830](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:830>) |
| POST | `/api/v1/admin/affiliates/users/batch-rate` | h.Admin.Affiliate.BatchSetRate | normal server; See group middleware and handler | [831](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:831>) |
| GET | `/api/v1/admin/affiliates/users/:user_id/overview` | h.Admin.Affiliate.GetUserOverview | normal server; See group middleware and handler | [832](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:832>) |
| PUT | `/api/v1/admin/affiliates/users/:user_id` | h.Admin.Affiliate.UpdateUserSettings | normal server; See group middleware and handler | [833](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:833>) |
| DELETE | `/api/v1/admin/affiliates/users/:user_id` | h.Admin.Affiliate.ClearUserSettings | normal server; See group middleware and handler | [834](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:834>) |

### registerChannelMonitorV2Routes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/channel-monitor-v2/config` | h.ChannelMonitorV2.GetConfig | normal server; See group middleware and handler | [850](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:850>) |
| PUT | `/api/v1/admin/channel-monitor-v2/config` | h.ChannelMonitorV2.UpdateConfig | normal server; See group middleware and handler | [851](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:851>) |
| GET | `/api/v1/admin/channel-monitor-v2/dimensions` | h.ChannelMonitorV2.Dimensions | normal server; See group middleware and handler | [856](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:856>) |
| GET | `/api/v1/admin/channel-monitor-v2/snapshot` | h.ChannelMonitorV2.AdminSnapshot | normal server; See group middleware and handler | [857](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:857>) |
| GET | `/api/v1/admin/channel-monitor-v2/models` | h.ChannelMonitorV2.AdminModels | normal server; See group middleware and handler | [858](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:858>) |
| GET | `/api/v1/admin/channel-monitor-v2/matrix` | h.ChannelMonitorV2.AdminMatrix | normal server; See group middleware and handler | [859](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:859>) |
| GET | `/api/v1/admin/channel-monitor-v2/errors` | h.ChannelMonitorV2.Errors | normal server; See group middleware and handler | [860](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:860>) |
| GET | `/api/v1/admin/channel-monitor-v2/users` | h.ChannelMonitorV2.AdminUsers | normal server; See group middleware and handler | [861](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/admin.go:861>) |

## backend/internal/server/routes/auth.go

### RegisterAuthRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | h.Auth.Register | normal server; See group middleware and handler | [37](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:37>) |
| POST | `/api/v1/auth/login` | h.Auth.Login | normal server; See group middleware and handler | [40](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:40>) |
| POST | `/api/v1/auth/login/2fa` | h.Auth.Login2FA | normal server; See group middleware and handler | [43](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:43>) |
| POST | `/api/v1/auth/passkey/login/begin` | h.Passkey.BeginLogin | normal server; See group middleware and handler | [46](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:46>) |
| POST | `/api/v1/auth/passkey/login/finish` | h.Passkey.FinishLogin | normal server; See group middleware and handler | [49](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:49>) |
| POST | `/api/v1/auth/send-verify-code` | h.Auth.SendVerifyCode | normal server; See group middleware and handler | [52](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:52>) |
| POST | `/api/v1/auth/refresh` | h.Auth.RefreshToken | normal server; See group middleware and handler | [56](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:56>) |
| POST | `/api/v1/auth/logout` | h.Auth.Logout | normal server; See group middleware and handler | [60](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:60>) |
| POST | `/api/v1/auth/validate-promo-code` | h.Auth.ValidatePromoCode | normal server; See group middleware and handler | [62](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:62>) |
| POST | `/api/v1/auth/validate-invitation-code` | h.Auth.ValidateInvitationCode | normal server; See group middleware and handler | [66](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:66>) |
| POST | `/api/v1/auth/forgot-password` | h.Auth.ForgotPassword | normal server; See group middleware and handler | [70](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:70>) |
| POST | `/api/v1/auth/reset-password` | h.Auth.ResetPassword | normal server; See group middleware and handler | [74](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:74>) |
| GET | `/api/v1/auth/oauth/linuxdo/start` | h.Auth.LinuxDoOAuthStart | normal server; See group middleware and handler | [77](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:77>) |
| POST | `/api/v1/auth/oauth/linuxdo/start` | h.Auth.LinuxDoOAuthStart | normal server; See group middleware and handler | [78](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:78>) |
| GET | `/api/v1/auth/oauth/github/start` | h.Auth.GitHubOAuthStart | normal server; See group middleware and handler | [81](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:81>) |
| POST | `/api/v1/auth/oauth/github/start` | h.Auth.GitHubOAuthStart | normal server; See group middleware and handler | [82](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:82>) |
| GET | `/api/v1/auth/oauth/github/callback` | h.Auth.GitHubOAuthCallback | normal server; See group middleware and handler | [85](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:85>) |
| POST | `/api/v1/auth/oauth/github/complete-registration` | h.Auth.CompleteGitHubOAuthRegistration | normal server; See group middleware and handler | [86](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:86>) |
| GET | `/api/v1/auth/oauth/google/start` | h.Auth.GoogleOAuthStart | normal server; See group middleware and handler | [92](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:92>) |
| POST | `/api/v1/auth/oauth/google/start` | h.Auth.GoogleOAuthStart | normal server; See group middleware and handler | [93](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:93>) |
| GET | `/api/v1/auth/oauth/google/callback` | h.Auth.GoogleOAuthCallback | normal server; See group middleware and handler | [96](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:96>) |
| POST | `/api/v1/auth/oauth/google/complete-registration` | h.Auth.CompleteGoogleOAuthRegistration | normal server; See group middleware and handler | [97](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:97>) |
| GET | `/api/v1/auth/oauth/linuxdo/bind/start` | h.Auth.LinuxDoOAuthStart | normal server; See group middleware and handler | [103](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:103>) |
| GET | `/api/v1/auth/oauth/linuxdo/callback` | h.Auth.LinuxDoOAuthCallback | normal server; See group middleware and handler | [109](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:109>) |
| GET | `/api/v1/auth/oauth/wechat/start` | h.Auth.WeChatOAuthStart | normal server; See group middleware and handler | [110](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:110>) |
| POST | `/api/v1/auth/oauth/wechat/start` | h.Auth.WeChatOAuthStart | normal server; See group middleware and handler | [111](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:111>) |
| GET | `/api/v1/auth/oauth/wechat/bind/start` | h.Auth.WeChatOAuthStart | normal server; See group middleware and handler | [114](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:114>) |
| GET | `/api/v1/auth/oauth/wechat/callback` | h.Auth.WeChatOAuthCallback | normal server; See group middleware and handler | [120](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:120>) |
| GET | `/api/v1/auth/oauth/wechat/payment/start` | h.Auth.WeChatPaymentOAuthStart | normal server; See group middleware and handler | [121](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:121>) |
| GET | `/api/v1/auth/oauth/wechat/payment/callback` | h.Auth.WeChatPaymentOAuthCallback | normal server; See group middleware and handler | [122](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:122>) |
| POST | `/api/v1/auth/oauth/pending/exchange` | h.Auth.ExchangePendingOAuthCompletion | normal server; See group middleware and handler | [123](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:123>) |
| POST | `/api/v1/auth/oauth/pending/send-verify-code` | h.Auth.SendPendingOAuthVerifyCode | normal server; See group middleware and handler | [129](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:129>) |
| POST | `/api/v1/auth/oauth/pending/create-account` | h.Auth.CreatePendingOAuthAccount | normal server; See group middleware and handler | [135](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:135>) |
| POST | `/api/v1/auth/oauth/pending/bind-login` | h.Auth.BindPendingOAuthLogin | normal server; See group middleware and handler | [141](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:141>) |
| POST | `/api/v1/auth/oauth/linuxdo/complete-registration` | h.Auth.CompleteLinuxDoOAuthRegistration | normal server; See group middleware and handler | [147](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:147>) |
| POST | `/api/v1/auth/oauth/linuxdo/bind-login` | h.Auth.BindLinuxDoOAuthLogin | normal server; See group middleware and handler | [153](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:153>) |
| POST | `/api/v1/auth/oauth/linuxdo/create-account` | h.Auth.CreateLinuxDoOAuthAccount | normal server; See group middleware and handler | [159](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:159>) |
| POST | `/api/v1/auth/oauth/wechat/complete-registration` | h.Auth.CompleteWeChatOAuthRegistration | normal server; See group middleware and handler | [165](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:165>) |
| POST | `/api/v1/auth/oauth/wechat/bind-login` | h.Auth.BindWeChatOAuthLogin | normal server; See group middleware and handler | [171](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:171>) |
| POST | `/api/v1/auth/oauth/wechat/create-account` | h.Auth.CreateWeChatOAuthAccount | normal server; See group middleware and handler | [177](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:177>) |
| GET | `/api/v1/auth/oauth/oidc/start` | h.Auth.OIDCOAuthStart | normal server; See group middleware and handler | [183](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:183>) |
| POST | `/api/v1/auth/oauth/oidc/start` | h.Auth.OIDCOAuthStart | normal server; See group middleware and handler | [184](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:184>) |
| GET | `/api/v1/auth/oauth/oidc/bind/start` | h.Auth.OIDCOAuthStart | normal server; See group middleware and handler | [187](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:187>) |
| GET | `/api/v1/auth/oauth/oidc/callback` | h.Auth.OIDCOAuthCallback | normal server; See group middleware and handler | [193](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:193>) |
| POST | `/api/v1/auth/oauth/oidc/complete-registration` | h.Auth.CompleteOIDCOAuthRegistration | normal server; See group middleware and handler | [194](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:194>) |
| POST | `/api/v1/auth/oauth/oidc/bind-login` | h.Auth.BindOIDCOAuthLogin | normal server; See group middleware and handler | [200](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:200>) |
| POST | `/api/v1/auth/oauth/oidc/create-account` | h.Auth.CreateOIDCOAuthAccount | normal server; See group middleware and handler | [206](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:206>) |
| GET | `/api/v1/auth/oauth/dingtalk/start` | h.Auth.DingTalkOAuthStart | normal server; See group middleware and handler | [212](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:212>) |
| POST | `/api/v1/auth/oauth/dingtalk/start` | h.Auth.DingTalkOAuthStart | normal server; See group middleware and handler | [213](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:213>) |
| GET | `/api/v1/auth/oauth/dingtalk/bind/start` | h.Auth.DingTalkOAuthStart | normal server; See group middleware and handler | [216](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:216>) |
| GET | `/api/v1/auth/oauth/dingtalk/callback` | h.Auth.DingTalkOAuthCallback | normal server; See group middleware and handler | [222](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:222>) |
| POST | `/api/v1/auth/oauth/dingtalk/complete-registration` | h.Auth.CompleteDingTalkOAuthRegistration | normal server; See group middleware and handler | [223](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:223>) |
| POST | `/api/v1/auth/oauth/dingtalk/bind-login` | h.Auth.BindDingTalkOAuthLogin | normal server; See group middleware and handler | [229](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:229>) |
| POST | `/api/v1/auth/oauth/dingtalk/create-account` | h.Auth.CreateDingTalkOAuthAccount | normal server; See group middleware and handler | [235](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:235>) |
| GET | `/api/v1/settings/public` | h.Setting.GetPublicSettings | normal server; See group middleware and handler | [249](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:249>) |
| GET | `/api/v1/settings/email-unsubscribe` | h.Setting.UnsubscribeNotificationEmail | normal server; See group middleware and handler | [250](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:250>) |
| GET | `/api/v1/auth/me` | h.Auth.GetCurrentUser | normal server; See group middleware and handler | [261](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:261>) |
| POST | `/api/v1/auth/revoke-all-sessions` | h.Auth.RevokeAllSessions | normal server; See group middleware and handler | [263](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:263>) |
| POST | `/api/v1/auth/oauth/bind-token` | h.Auth.PrepareOAuthBindAccessTokenCookie | normal server; See group middleware and handler | [264](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/auth.go:264>) |

## backend/internal/server/routes/common.go

### RegisterCommonRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/health` | func(c *gin.Context) { | normal server; See group middleware and handler | [16](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/common.go:16>) |
| GET | `/readyz` | func(c *gin.Context) { | normal server; See group middleware and handler | [22](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/common.go:22>) |
| POST | `/api/event_logging/batch` | func(c *gin.Context) { | normal server; Acknowledgement only; no persistence | [37](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/common.go:37>) |
| GET | `/setup/status` | func(c *gin.Context) { | normal server; See group middleware and handler | [43](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/common.go:43>) |

## backend/internal/server/routes/gateway.go

### RegisterGatewayRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/v1/sub2api/billing` | h.Gateway.KeyBillingInfo | normal server; See group middleware and handler | [191](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:191>) |
| POST | `/v1/messages` | h.OpenAIGateway.Messages, h.Gateway.Messages | normal server; See group middleware and handler | [196](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:196>) |
| POST | `/v1/messages/count_tokens` | countTokensHandler | normal server; See group middleware and handler | [205](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:205>) |
| GET | `/v1/models` | modelsHandler | normal server; See group middleware and handler | [209](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:209>) |
| GET | `/v1/models/:model` | h.Gateway.Models | normal server; See group middleware and handler | [211](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:211>) |
| GET | `/v1/usage` | h.Gateway.Usage | normal server; See group middleware and handler | [212](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:212>) |
| POST | `/v1/live` | h.OpenAIGateway.Live | normal server; Live capability + platform-dependent attestation | [213](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:213>) |
| GET | `/v1/live/:call_id` | h.OpenAIGateway.LiveSideband | normal server; Live capability + platform-dependent attestation | [214](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:214>) |
| POST | `/v1/responses` | h.OpenAIGateway.Responses, h.Gateway.Responses | normal server; See group middleware and handler | [216](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:216>) |
| POST | `/v1/responses/*subpath` | h.OpenAIGateway.Responses, h.Gateway.Responses | normal server; See group middleware and handler | [223](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:223>) |
| POST | `/v1/alpha/search` | h.OpenAIGateway.AlphaSearch | normal server; See group middleware and handler | [230](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:230>) |
| GET | `/v1/responses` | h.OpenAIGateway.ResponsesWebSocket | normal server; See group middleware and handler | [231](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:231>) |
| POST | `/v1/chat/completions` | h.OpenAIGateway.ChatCompletions, h.Gateway.ChatCompletions | normal server; See group middleware and handler | [235](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:235>) |
| POST | `/v1/embeddings` | h.OpenAIGateway.Embeddings | normal server; See group middleware and handler | [242](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:242>) |
| POST | `/v1/images/generations` | imagesHandler | normal server; Platform/model/group media admission | [255](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:255>) |
| POST | `/v1/images/edits` | imagesHandler | normal server; Platform/model/group media admission | [256](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:256>) |
| POST | `/v1/images/generations/async` | h.AsyncImage.Submit | normal server; Async flag + S3; same-key task ownership | [257](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:257>) |
| POST | `/v1/images/edits/async` | h.AsyncImage.Submit | normal server; Async flag + S3; same-key task ownership | [258](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:258>) |
| GET | `/v1/images/tasks/:task_id` | h.AsyncImage.Get | normal server; Task ownership; polling retained after submit disable | [259](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:259>) |
| POST | `/v1/images/batches` | h.BatchImage.Submit | normal server; Batch queue/provider/storage gates | [260](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:260>) |
| GET | `/v1/images/batches` | h.BatchImage.List | normal server; Batch queue/provider/storage gates | [261](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:261>) |
| GET | `/v1/images/batches/models` | h.BatchImage.Models | normal server; Batch queue/provider/storage gates | [262](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:262>) |
| GET | `/v1/images/batches/:id` | h.BatchImage.Get | normal server; Batch queue/provider/storage gates | [263](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:263>) |
| GET | `/v1/images/batches/:id/items` | h.BatchImage.Items | normal server; Batch queue/provider/storage gates | [264](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:264>) |
| GET | `/v1/images/batches/:id/items/:custom_id/content` | h.BatchImage.ItemContent | normal server; Batch queue/provider/storage gates | [265](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:265>) |
| GET | `/v1/images/batches/:id/download` | h.BatchImage.Download | normal server; Batch queue/provider/storage gates | [266](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:266>) |
| POST | `/v1/images/batches/:id/cancel` | h.BatchImage.Cancel | normal server; Batch queue/provider/storage gates | [267](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:267>) |
| DELETE | `/v1/images/batches/:id` | h.BatchImage.DeleteRecord | normal server; Batch queue/provider/storage gates | [268](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:268>) |
| DELETE | `/v1/images/batches/:id/outputs` | h.BatchImage.DeleteOutputs | normal server; Batch queue/provider/storage gates | [269](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:269>) |
| POST | `/v1/videos` | videoGenerationHandler | normal server; Platform/model/group media admission | [272](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:272>) |
| POST | `/v1/videos/generations` | videoGenerationHandler | normal server; Platform/model/group media admission | [273](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:273>) |
| POST | `/v1/videos/edits` | videoEditHandler | normal server; Platform/model/group media admission | [274](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:274>) |
| POST | `/v1/videos/extensions` | videoExtensionHandler | normal server; Platform/model/group media admission | [275](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:275>) |
| GET | `/v1/videos/generations/:request_id/content` | videoContentHandler | normal server; Platform/model/group media admission | [276](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:276>) |
| GET | `/v1/videos/edits/:request_id/content` | videoContentHandler | normal server; Platform/model/group media admission | [277](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:277>) |
| GET | `/v1/videos/extensions/:request_id/content` | videoContentHandler | normal server; Platform/model/group media admission | [278](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:278>) |
| GET | `/v1/videos/generations/:request_id` | videoStatusHandler | normal server; Platform/model/group media admission | [279](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:279>) |
| GET | `/v1/videos/edits/:request_id` | videoStatusHandler | normal server; Platform/model/group media admission | [280](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:280>) |
| GET | `/v1/videos/extensions/:request_id` | videoStatusHandler | normal server; Platform/model/group media admission | [281](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:281>) |
| GET | `/v1/videos/:request_id` | videoStatusHandler | normal server; Platform/model/group media admission | [282](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:282>) |
| GET | `/v1/videos/:request_id/content` | videoContentHandler | normal server; Platform/model/group media admission | [283](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:283>) |
| POST | `/v1/tts` | voiceHandler("tts" | normal server; See group middleware and handler | [297](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:297>) |
| POST | `/v1/stt` | voiceHandler("stt" | normal server; See group middleware and handler | [298](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:298>) |
| POST | `/v1/custom-voices` | voiceHandler("custom-voices" | normal server; See group middleware and handler | [299](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:299>) |
| GET | `/v1/custom-voices` | voiceHandler("custom-voices" | normal server; See group middleware and handler | [308](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:308>) |
| GET | `/v1/custom-voices/:voice_id/audio` | customVoicePathHandler | normal server; See group middleware and handler | [309](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:309>) |
| GET | `/v1/custom-voices/:voice_id` | customVoicePathHandler | normal server; See group middleware and handler | [310](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:310>) |
| PATCH | `/v1/custom-voices/:voice_id` | customVoicePathHandler | normal server; See group middleware and handler | [311](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:311>) |
| DELETE | `/v1/custom-voices/:voice_id` | customVoicePathHandler | normal server; See group middleware and handler | [312](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:312>) |
| GET | `/v1/realtime` | h.OpenAIGateway.GrokRealtime | normal server; Provider/voice capability checks | [313](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:313>) |
| POST | `/v1/web_search` | h.Gateway.WebSearch | normal server; See group middleware and handler | [321](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:321>) |
| POST | `/v1/x_search` | h.Gateway.XSearch | normal server; See group middleware and handler | [329](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:329>) |
| GET | `/v1beta/models` | h.Gateway.GeminiV1BetaListModels | normal server; See group middleware and handler | [349](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:349>) |
| GET | `/v1beta/models/:model` | h.Gateway.GeminiV1BetaGetModel | normal server; See group middleware and handler | [350](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:350>) |
| POST | `/v1beta/models/*modelAction` | h.Gateway.GeminiV1BetaModels | normal server; See group middleware and handler | [352](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:352>) |
| POST | `/responses` | inline dispatch; see source | normal server; See group middleware and handler | [363](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:363>) |
| POST | `/responses/*subpath` | inline dispatch; see source | normal server; See group middleware and handler | [364](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:364>) |
| POST | `/alpha/search` | h.OpenAIGateway.AlphaSearch | normal server; See group middleware and handler | [365](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:365>) |
| GET | `/responses` | h.OpenAIGateway.ResponsesWebSocket | normal server; See group middleware and handler | [366](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:366>) |
| GET | `/models` | bodyLimit, clientRequestID, opsErrorLogger, endpointNorm, gin.HandlerFunc(apiKeyAuth), requireGroupAnthropic, modelsHandler | normal server; See group middleware and handler | [369](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:369>) |
| GET | `/models/:model` | h.Gateway.Models | normal server; See group middleware and handler | [370](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:370>) |
| POST | `/messages/count_tokens` | inline dispatch; see source | normal server; See group middleware and handler | [371](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:371>) |
| POST | `/backend-api/codex/realtime/calls` | h.OpenAIGateway.Live | normal server; Provider/voice capability checks | [375](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:375>) |
| GET | `/backend-api/codex/:call_id` | h.OpenAIGateway.LiveSideband | normal server; See group middleware and handler | [376](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:376>) |
| POST | `/backend-api/codex/responses` | responsesHandler | normal server; See group middleware and handler | [377](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:377>) |
| POST | `/backend-api/codex/responses/*subpath` | guardResponsesSubpath(responsesHandler | normal server; See group middleware and handler | [378](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:378>) |
| POST | `/backend-api/codex/alpha/search` | h.OpenAIGateway.AlphaSearch | normal server; See group middleware and handler | [379](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:379>) |
| GET | `/backend-api/codex/responses` | h.OpenAIGateway.ResponsesWebSocket | normal server; See group middleware and handler | [380](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:380>) |
| GET | `/backend-api/codex/models` | codexModelsHandler | normal server; See group middleware and handler | [383](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:383>) |
| POST | `/chat/completions` | h.OpenAIGateway.ChatCompletions, h.Gateway.ChatCompletions | normal server; See group middleware and handler | [386](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:386>) |
| POST | `/embeddings` | h.OpenAIGateway.Embeddings | normal server; See group middleware and handler | [393](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:393>) |
| POST | `/images/generations` | inline dispatch; see source | normal server; Platform/model/group media admission | [406](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:406>) |
| POST | `/images/edits` | inline dispatch; see source | normal server; Platform/model/group media admission | [407](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:407>) |
| POST | `/images/generations/async` | h.AsyncImage.Submit | normal server; Async flag + S3; same-key task ownership | [408](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:408>) |
| POST | `/images/edits/async` | h.AsyncImage.Submit | normal server; Async flag + S3; same-key task ownership | [409](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:409>) |
| GET | `/images/tasks/:task_id` | h.AsyncImage.Get | normal server; Task ownership; polling retained after submit disable | [410](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:410>) |
| POST | `/videos` | inline dispatch; see source | normal server; Platform/model/group media admission | [411](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:411>) |
| POST | `/videos/generations` | inline dispatch; see source | normal server; Platform/model/group media admission | [412](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:412>) |
| POST | `/videos/edits` | inline dispatch; see source | normal server; Platform/model/group media admission | [413](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:413>) |
| POST | `/videos/extensions` | inline dispatch; see source | normal server; Platform/model/group media admission | [414](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:414>) |
| GET | `/videos/generations/:request_id/content` | inline dispatch; see source | normal server; Platform/model/group media admission | [415](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:415>) |
| GET | `/videos/edits/:request_id/content` | inline dispatch; see source | normal server; Platform/model/group media admission | [416](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:416>) |
| GET | `/videos/extensions/:request_id/content` | inline dispatch; see source | normal server; Platform/model/group media admission | [417](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:417>) |
| GET | `/videos/generations/:request_id` | inline dispatch; see source | normal server; Platform/model/group media admission | [418](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:418>) |
| GET | `/videos/edits/:request_id` | inline dispatch; see source | normal server; Platform/model/group media admission | [419](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:419>) |
| GET | `/videos/extensions/:request_id` | inline dispatch; see source | normal server; Platform/model/group media admission | [420](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:420>) |
| GET | `/videos/:request_id` | inline dispatch; see source | normal server; Platform/model/group media admission | [421](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:421>) |
| GET | `/videos/:request_id/content` | inline dispatch; see source | normal server; Platform/model/group media admission | [422](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:422>) |
| POST | `/tts` | inline dispatch; see source | normal server; See group middleware and handler | [434](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:434>) |
| POST | `/stt` | inline dispatch; see source | normal server; See group middleware and handler | [435](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:435>) |
| POST | `/custom-voices` | inline dispatch; see source | normal server; See group middleware and handler | [436](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:436>) |
| GET | `/custom-voices` | inline dispatch; see source | normal server; See group middleware and handler | [445](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:445>) |
| GET | `/custom-voices/:voice_id/audio` | inline dispatch; see source | normal server; See group middleware and handler | [446](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:446>) |
| GET | `/custom-voices/:voice_id` | inline dispatch; see source | normal server; See group middleware and handler | [447](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:447>) |
| PATCH | `/custom-voices/:voice_id` | inline dispatch; see source | normal server; See group middleware and handler | [448](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:448>) |
| DELETE | `/custom-voices/:voice_id` | inline dispatch; see source | normal server; See group middleware and handler | [449](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:449>) |
| GET | `/realtime` | h.OpenAIGateway.GrokRealtime | normal server; Provider/voice capability checks | [450](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:450>) |
| POST | `/web_search` | h.Gateway.WebSearch | normal server; See group middleware and handler | [458](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:458>) |
| POST | `/x_search` | h.Gateway.XSearch | normal server; See group middleware and handler | [466](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:466>) |
| GET | `/antigravity/models` | h.Gateway.AntigravityModels | normal server; See group middleware and handler | [476](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:476>) |
| POST | `/antigravity/v1/messages` | h.Gateway.Messages | normal server; See group middleware and handler | [488](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:488>) |
| POST | `/antigravity/v1/messages/count_tokens` | h.Gateway.CountTokens | normal server; See group middleware and handler | [489](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:489>) |
| GET | `/antigravity/v1/models` | h.Gateway.AntigravityModels | normal server; See group middleware and handler | [490](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:490>) |
| GET | `/antigravity/v1/usage` | h.Gateway.Usage | normal server; See group middleware and handler | [491](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:491>) |
| GET | `/antigravity/v1beta/models` | h.Gateway.GeminiV1BetaListModels | normal server; See group middleware and handler | [503](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:503>) |
| GET | `/antigravity/v1beta/models/:model` | h.Gateway.GeminiV1BetaGetModel | normal server; See group middleware and handler | [504](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:504>) |
| POST | `/antigravity/v1beta/models/*modelAction` | h.Gateway.GeminiV1BetaModels | normal server; See group middleware and handler | [505](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/gateway.go:505>) |

## backend/internal/server/routes/model_plaza.go

### RegisterModelPlazaRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/model-plaza` | h.ModelPlaza.Get | normal server; Enable flag and optional user authentication | [30](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/model_plaza.go:30>) |

## backend/internal/server/routes/payment.go

### RegisterPaymentRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/payment/config` | paymentHandler.GetPaymentConfig | normal server; See group middleware and handler | [34](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:34>) |
| GET | `/api/v1/payment/checkout-info` | paymentHandler.GetCheckoutInfo | normal server; See group middleware and handler | [35](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:35>) |
| GET | `/api/v1/payment/plans` | paymentHandler.GetPlans | normal server; See group middleware and handler | [36](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:36>) |
| GET | `/api/v1/payment/limits` | paymentHandler.GetLimits | normal server; See group middleware and handler | [37](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:37>) |
| POST | `/api/v1/payment/orders` | paymentHandler.CreateOrder | normal server; See group middleware and handler | [41](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:41>) |
| POST | `/api/v1/payment/orders/verify` | paymentHandler.VerifyOrder | normal server; See group middleware and handler | [42](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:42>) |
| GET | `/api/v1/payment/orders/my` | paymentHandler.GetMyOrders | normal server; See group middleware and handler | [43](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:43>) |
| GET | `/api/v1/payment/orders/:id` | paymentHandler.GetOrder | normal server; See group middleware and handler | [44](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:44>) |
| POST | `/api/v1/payment/orders/:id/cancel` | paymentHandler.CancelOrder | normal server; See group middleware and handler | [45](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:45>) |
| POST | `/api/v1/payment/orders/:id/refund-request` | paymentHandler.RequestRefund | normal server; See group middleware and handler | [46](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:46>) |
| GET | `/api/v1/payment/orders/refund-eligible-providers` | paymentHandler.GetRefundEligibleProviders | normal server; See group middleware and handler | [47](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:47>) |
| POST | `/api/v1/payment/public/orders/verify` | paymentHandler.VerifyOrderPublic | normal server; See group middleware and handler | [59](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:59>) |
| POST | `/api/v1/payment/public/orders/resolve` | paymentHandler.ResolveOrderPublicByResumeToken | normal server; See group middleware and handler | [60](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:60>) |
| GET | `/api/v1/payment/webhook/easypay` | webhookHandler.EasyPayNotify | normal server; See group middleware and handler | [70](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:70>) |
| POST | `/api/v1/payment/webhook/easypay` | webhookHandler.EasyPayNotify | normal server; See group middleware and handler | [71](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:71>) |
| POST | `/api/v1/payment/webhook/alipay` | webhookHandler.AlipayNotify | normal server; See group middleware and handler | [72](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:72>) |
| POST | `/api/v1/payment/webhook/wxpay` | webhookHandler.WxpayNotify | normal server; See group middleware and handler | [73](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:73>) |
| POST | `/api/v1/payment/webhook/stripe` | webhookHandler.StripeWebhook | normal server; See group middleware and handler | [74](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:74>) |
| POST | `/api/v1/payment/webhook/airwallex` | webhookHandler.AirwallexWebhook | normal server; See group middleware and handler | [75](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:75>) |
| POST | `/api/v1/payment/webhook/epusdt` | webhookHandler.EPUSDTWebhook | normal server; See group middleware and handler | [76](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:76>) |
| POST | `/api/v1/payments/callback` | webhookHandler.EPUSDTWebhook | normal server; See group middleware and handler | [78](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:78>) |
| GET | `/api/v1/admin/payment/dashboard` | adminPaymentHandler.GetDashboard | normal server; See group middleware and handler | [88](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:88>) |
| GET | `/api/v1/admin/payment/config` | adminPaymentHandler.GetConfig | normal server; See group middleware and handler | [91](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:91>) |
| PUT | `/api/v1/admin/payment/config` | adminPaymentHandler.UpdateConfig | normal server; See group middleware and handler | [92](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:92>) |
| GET | `/api/v1/admin/payment/orders` | adminPaymentHandler.ListOrders | normal server; See group middleware and handler | [97](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:97>) |
| GET | `/api/v1/admin/payment/orders/:id` | adminPaymentHandler.GetOrderDetail | normal server; See group middleware and handler | [98](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:98>) |
| POST | `/api/v1/admin/payment/orders/:id/cancel` | adminPaymentHandler.CancelOrder | normal server; See group middleware and handler | [99](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:99>) |
| POST | `/api/v1/admin/payment/orders/:id/retry` | adminPaymentHandler.RetryFulfillment | normal server; See group middleware and handler | [100](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:100>) |
| POST | `/api/v1/admin/payment/orders/:id/refund` | adminPaymentHandler.ProcessRefund | normal server; See group middleware and handler | [101](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:101>) |
| POST | `/api/v1/admin/payment/orders/:id/refund/query` | adminPaymentHandler.QueryAndFinalizeRefund | normal server; See group middleware and handler | [102](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:102>) |
| GET | `/api/v1/admin/payment/plans` | adminPaymentHandler.ListPlans | normal server; See group middleware and handler | [108](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:108>) |
| POST | `/api/v1/admin/payment/plans` | adminPaymentHandler.CreatePlan | normal server; See group middleware and handler | [109](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:109>) |
| PUT | `/api/v1/admin/payment/plans/:id` | adminPaymentHandler.UpdatePlan | normal server; See group middleware and handler | [110](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:110>) |
| DELETE | `/api/v1/admin/payment/plans/:id` | adminPaymentHandler.DeletePlan | normal server; See group middleware and handler | [111](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:111>) |
| GET | `/api/v1/admin/payment/providers` | adminPaymentHandler.ListProviders | normal server; See group middleware and handler | [117](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:117>) |
| POST | `/api/v1/admin/payment/providers` | adminPaymentHandler.CreateProvider | normal server; See group middleware and handler | [118](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:118>) |
| PUT | `/api/v1/admin/payment/providers/:id` | adminPaymentHandler.UpdateProvider | normal server; See group middleware and handler | [119](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:119>) |
| DELETE | `/api/v1/admin/payment/providers/:id` | adminPaymentHandler.DeleteProvider | normal server; See group middleware and handler | [120](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/payment.go:120>) |

## backend/internal/server/routes/user.go

### RegisterUserRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/user/profile` | h.User.GetProfile | normal server; See group middleware and handler | [33](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:33>) |
| PUT | `/api/v1/user/password` | h.User.ChangePassword | normal server; See group middleware and handler | [34](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:34>) |
| PUT | `/api/v1/user` | h.User.UpdateProfile | normal server; See group middleware and handler | [35](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:35>) |
| GET | `/api/v1/user/aff` | h.User.GetAffiliate | normal server; See group middleware and handler | [36](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:36>) |
| POST | `/api/v1/user/aff/transfer` | h.User.TransferAffiliateQuota | normal server; See group middleware and handler | [37](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:37>) |
| POST | `/api/v1/user/account-bindings/email/send-code` | h.User.SendEmailBindingCode | normal server; See group middleware and handler | [38](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:38>) |
| POST | `/api/v1/user/account-bindings/email` | h.User.BindEmailIdentity | normal server; See group middleware and handler | [39](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:39>) |
| DELETE | `/api/v1/user/account-bindings/:provider` | h.User.UnbindIdentity | normal server; See group middleware and handler | [40](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:40>) |
| POST | `/api/v1/user/auth-identities/bind/start` | h.User.StartIdentityBinding | normal server; See group middleware and handler | [41](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:41>) |
| GET | `/api/v1/user/api-keys/:id/usage/daily` | h.Usage.GetMyAPIKeyDailyUsage | normal server; See group middleware and handler | [42](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:42>) |
| GET | `/api/v1/user/platform-quotas` | h.User.GetMyPlatformQuotas | normal server; See group middleware and handler | [43](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:43>) |
| POST | `/api/v1/user/notify-email/send-code` | h.User.SendNotifyEmailCode | normal server; See group middleware and handler | [48](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:48>) |
| POST | `/api/v1/user/notify-email/verify` | h.User.VerifyNotifyEmail | normal server; See group middleware and handler | [49](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:49>) |
| PUT | `/api/v1/user/notify-email/toggle` | h.User.ToggleNotifyEmail | normal server; See group middleware and handler | [50](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:50>) |
| DELETE | `/api/v1/user/notify-email` | h.User.RemoveNotifyEmail | normal server; See group middleware and handler | [51](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:51>) |
| GET | `/api/v1/user/totp/status` | h.Totp.GetStatus | normal server; See group middleware and handler | [57](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:57>) |
| GET | `/api/v1/user/totp/verification-method` | h.Totp.GetVerificationMethod | normal server; See group middleware and handler | [58](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:58>) |
| POST | `/api/v1/user/totp/send-code` | h.Totp.SendVerifyCode | normal server; See group middleware and handler | [59](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:59>) |
| POST | `/api/v1/user/totp/setup` | h.Totp.InitiateSetup | normal server; See group middleware and handler | [60](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:60>) |
| POST | `/api/v1/user/totp/enable` | h.Totp.Enable | normal server; See group middleware and handler | [61](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:61>) |
| POST | `/api/v1/user/totp/disable` | h.Totp.Disable | normal server; See group middleware and handler | [62](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:62>) |
| POST | `/api/v1/user/totp/step-up` | h.Totp.StepUp | normal server; See group middleware and handler | [64](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:64>) |
| GET | `/api/v1/user/passkeys` | h.Passkey.List | normal server; See group middleware and handler | [69](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:69>) |
| POST | `/api/v1/user/passkeys/register/begin` | h.Passkey.BeginRegistration | normal server; See group middleware and handler | [70](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:70>) |
| POST | `/api/v1/user/passkeys/register/finish` | h.Passkey.FinishRegistration | normal server; See group middleware and handler | [71](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:71>) |
| PATCH | `/api/v1/user/passkeys/:id` | h.Passkey.Rename | normal server; See group middleware and handler | [72](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:72>) |
| DELETE | `/api/v1/user/passkeys/:id` | h.Passkey.Delete | normal server; See group middleware and handler | [73](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:73>) |
| GET | `/api/v1/keys` | h.APIKey.List | normal server; See group middleware and handler | [80](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:80>) |
| GET | `/api/v1/keys/:id` | h.APIKey.GetByID | normal server; See group middleware and handler | [81](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:81>) |
| POST | `/api/v1/keys` | h.APIKey.Create | normal server; See group middleware and handler | [82](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:82>) |
| PUT | `/api/v1/keys/:id` | h.APIKey.Update | normal server; See group middleware and handler | [83](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:83>) |
| DELETE | `/api/v1/keys/:id` | h.APIKey.Delete | normal server; See group middleware and handler | [84](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:84>) |
| GET | `/api/v1/groups/available` | h.APIKey.GetAvailableGroups | normal server; See group middleware and handler | [90](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:90>) |
| GET | `/api/v1/groups/rates` | h.APIKey.GetUserGroupRates | normal server; See group middleware and handler | [91](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:91>) |
| GET | `/api/v1/channels/available` | h.AvailableChannel.List | normal server; See group middleware and handler | [97](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:97>) |
| GET | `/api/v1/usage` | h.Usage.List | normal server; See group middleware and handler | [104](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:104>) |
| GET | `/api/v1/usage/errors` | h.Usage.ListErrors | normal server; See group middleware and handler | [105](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:105>) |
| GET | `/api/v1/usage/errors/:id` | h.Usage.GetErrorDetail | normal server; See group middleware and handler | [106](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:106>) |
| GET | `/api/v1/usage/:id` | h.Usage.GetByID | normal server; See group middleware and handler | [107](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:107>) |
| GET | `/api/v1/usage/stats` | h.Usage.Stats | normal server; See group middleware and handler | [108](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:108>) |
| GET | `/api/v1/usage/dashboard/stats` | h.Usage.DashboardStats | normal server; See group middleware and handler | [110](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:110>) |
| GET | `/api/v1/usage/dashboard/trend` | h.Usage.DashboardTrend | normal server; See group middleware and handler | [111](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:111>) |
| GET | `/api/v1/usage/dashboard/models` | h.Usage.DashboardModels | normal server; See group middleware and handler | [112](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:112>) |
| GET | `/api/v1/usage/dashboard/snapshot-v2` | h.Usage.DashboardSnapshotV2 | normal server; See group middleware and handler | [113](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:113>) |
| POST | `/api/v1/usage/dashboard/api-keys-usage` | h.Usage.DashboardAPIKeysUsage | normal server; See group middleware and handler | [114](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:114>) |
| GET | `/api/v1/announcements` | h.Announcement.List | normal server; See group middleware and handler | [120](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:120>) |
| POST | `/api/v1/announcements/:id/read` | h.Announcement.MarkRead | normal server; See group middleware and handler | [121](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:121>) |
| POST | `/api/v1/redeem` | h.Redeem.Redeem | normal server; See group middleware and handler | [127](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:127>) |
| GET | `/api/v1/redeem/history` | h.Redeem.GetHistory | normal server; See group middleware and handler | [128](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:128>) |
| GET | `/api/v1/subscriptions` | h.Subscription.List | normal server; See group middleware and handler | [134](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:134>) |
| GET | `/api/v1/subscriptions/active` | h.Subscription.GetActive | normal server; See group middleware and handler | [135](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:135>) |
| GET | `/api/v1/subscriptions/progress` | h.Subscription.GetProgress | normal server; See group middleware and handler | [136](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:136>) |
| GET | `/api/v1/subscriptions/summary` | h.Subscription.GetSummary | normal server; See group middleware and handler | [137](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:137>) |
| GET | `/api/v1/channel-monitors` | h.ChannelMonitor.List | normal server; See group middleware and handler | [143](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:143>) |
| GET | `/api/v1/channel-monitors/:id/status` | h.ChannelMonitor.GetStatus | normal server; See group middleware and handler | [144](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:144>) |
| GET | `/api/v1/channel-monitor-v2/dimensions` | h.ChannelMonitorV2.Dimensions | normal server; See group middleware and handler | [152](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:152>) |
| GET | `/api/v1/channel-monitor-v2/snapshot` | h.ChannelMonitorV2.Snapshot | normal server; See group middleware and handler | [153](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:153>) |
| GET | `/api/v1/channel-monitor-v2/models` | h.ChannelMonitorV2.Models | normal server; See group middleware and handler | [154](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:154>) |
| GET | `/api/v1/channel-monitor-v2/matrix` | h.ChannelMonitorV2.Matrix | normal server; See group middleware and handler | [155](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:155>) |
| GET | `/api/v1/channel-monitor-v2/errors` | h.ChannelMonitorV2.Errors | normal server; See group middleware and handler | [156](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:156>) |
| GET | `/api/v1/channel-monitor-v2/users` | h.ChannelMonitorV2.Users | normal server; See group middleware and handler | [157](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/server/routes/user.go:157>) |

## backend/internal/handler/page_handler.go

### RegisterPageRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/pages/:slug` | h.GetPageContent | normal server; See group middleware and handler | [268](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/page_handler.go:268>) |
| GET | `/api/v1/pages/:slug/images/*filename` | h.ServePageImage | normal server; Platform/model/group media admission | [274](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/page_handler.go:274>) |
| GET | `/api/v1/pages` | h.ListPages | normal server; See group middleware and handler | [282](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/page_handler.go:282>) |

## backend/internal/setup/handler.go

### RegisterRoutes

| Method | Full registered path | Handler / dispatch | Mode / gate | Evidence |
| --- | --- | --- | --- | --- |
| GET | `/setup/status` | getStatus | setup only; Setup-only startup mode | [26](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/setup/handler.go:26>) |
| POST | `/setup/test-db` | testDatabase | setup only; Setup-only startup mode | [32](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/setup/handler.go:32>) |
| POST | `/setup/test-redis` | testRedis | setup only; Setup-only startup mode | [33](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/setup/handler.go:33>) |
| POST | `/setup/install` | install | setup only; Setup-only startup mode | [34](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/setup/handler.go:34>) |

## Separate diagnostic listener and static delivery

The 698 Gin registrations exclude Go net/http profiling on the separate, opt-in, loopback-only listener. Its 11 explicit patterns are listed below. Standard pprof handlers may process more than one HTTP method; this table does not invent method restrictions.

| Listener path/pattern | Purpose |
| --- | --- |
| /debug/pprof/ | Profile index / subtree handler |
| /debug/pprof/cmdline | Process command line |
| /debug/pprof/profile | CPU profile |
| /debug/pprof/symbol | Symbol lookup |
| /debug/pprof/trace | Runtime trace |
| /debug/pprof/allocs | Named runtime profile |
| /debug/pprof/block | Named runtime profile |
| /debug/pprof/goroutine | Named runtime profile |
| /debug/pprof/heap | Named runtime profile |
| /debug/pprof/mutex | Named runtime profile |
| /debug/pprof/threadcreate | Named runtime profile |

Evidence: [backend/cmd/server/pprof_server.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/cmd/server/pprof_server.go>). Frontend static assets and SPA fallback are dynamic serving patterns, not additional product API routes; see [backend/internal/web/embed_on.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/web/embed_on.go>).

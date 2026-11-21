# Configuration and settings declaration inventory

[Main catalogue](README.md) · Source version **0.2.34**, commit `4b9488732a560797446ee677517adbd6581c8d60`. Static source inventory; not runtime verification.

This is an index of configuration surface, not a dump of a deployed configuration. It contains declaration names only: no credentials, tokens, passwords, private keys or configured values. Secret-related field names are retained because they are part of the API/configuration contract. A declaration may be a container, optional value, response-only indicator or compatibility field; it is not independently counted as a working feature.

## Startup/config structure fields

595 `mapstructure` declarations from config.go are grouped by Go owner type. This is not a flattened YAML path list: nested fields must be interpreted through their parent structs. Defaults, validation, environment binding and runtime updates are defined in the linked implementation.

### Config

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Server | `server` | [74](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:74>) |
| Log | `log` | [75](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:75>) |
| CORS | `cors` | [76](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:76>) |
| Security | `security` | [77](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:77>) |
| Billing | `billing` | [78](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:78>) |
| Turnstile | `turnstile` | [79](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:79>) |
| Database | `database` | [80](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:80>) |
| Redis | `redis` | [81](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:81>) |
| Ops | `ops` | [82](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:82>) |
| JWT | `jwt` | [83](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:83>) |
| Totp | `totp` | [84](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:84>) |
| WebAuthn | `webauthn` | [85](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:85>) |
| LinuxDo | `linuxdo_connect` | [86](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:86>) |
| WeChat | `wechat_connect` | [87](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:87>) |
| OIDC | `oidc_connect` | [88](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:88>) |
| DingTalk | `dingtalk_connect` | [89](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:89>) |
| GitHubOAuth | `github_oauth` | [90](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:90>) |
| GoogleOAuth | `google_oauth` | [91](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:91>) |
| Default | `default` | [92](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:92>) |
| RateLimit | `rate_limit` | [93](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:93>) |
| Pricing | `pricing` | [94](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:94>) |
| Gateway | `gateway` | [95](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:95>) |
| APIKeyAuth | `api_key_auth_cache` | [96](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:96>) |
| SubscriptionCache | `subscription_cache` | [97](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:97>) |
| SubscriptionMaintenance | `subscription_maintenance` | [98](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:98>) |
| Dashboard | `dashboard_cache` | [99](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:99>) |
| DashboardAgg | `dashboard_aggregation` | [100](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:100>) |
| UsageCleanup | `usage_cleanup` | [101](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:101>) |
| Concurrency | `concurrency` | [102](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:102>) |
| TokenRefresh | `token_refresh` | [103](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:103>) |
| RunMode | `run_mode` | [104](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:104>) |
| Timezone | `timezone` | [105](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:105>) |
| Gemini | `gemini` | [106](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:106>) |
| Update | `update` | [107](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:107>) |
| Idempotency | `idempotency` | [108](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:108>) |
| BatchImage | `batch_image` | [109](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:109>) |
| ImageStorage | `image_storage` | [110](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:110>) |
| Plugins | `plugins` | [111](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:111>) |

### PluginConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| DataDir | `data_dir` | [117](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:117>) |
| AllowUnsigned | `allow_unsigned` | [118](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:118>) |
| TrustedPublishers | `trusted_publishers` | [119](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:119>) |
| MaxUploadBytes | `max_upload_bytes` | [120](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:120>) |
| MaxUncompressedBytes | `max_uncompressed_bytes` | [121](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:121>) |
| StartTimeoutSeconds | `start_timeout_seconds` | [122](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:122>) |

### LogConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Level | `level` | [126](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:126>) |
| Format | `format` | [127](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:127>) |
| ServiceName | `service_name` | [128](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:128>) |
| Environment | `env` | [129](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:129>) |
| Caller | `caller` | [130](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:130>) |
| StacktraceLevel | `stacktrace_level` | [131](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:131>) |
| Output | `output` | [132](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:132>) |
| Rotation | `rotation` | [133](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:133>) |
| Sampling | `sampling` | [134](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:134>) |

### LogOutputConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| ToStdout | `to_stdout` | [138](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:138>) |
| ToFile | `to_file` | [139](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:139>) |
| FilePath | `file_path` | [140](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:140>) |

### LogRotationConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| MaxSizeMB | `max_size_mb` | [144](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:144>) |
| MaxBackups | `max_backups` | [145](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:145>) |
| MaxAgeDays | `max_age_days` | [146](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:146>) |
| Compress | `compress` | [147](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:147>) |
| LocalTime | `local_time` | [148](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:148>) |

### LogSamplingConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [152](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:152>) |
| Initial | `initial` | [153](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:153>) |
| Thereafter | `thereafter` | [154](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:154>) |

### GeminiConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| OAuth | `oauth` | [158](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:158>) |
| Quota | `quota` | [159](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:159>) |

### GeminiOAuthConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| ClientID | `client_id` | [163](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:163>) |
| ClientSecret | `client_secret` | [164](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:164>) |
| Scopes | `scopes` | [165](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:165>) |

### GeminiQuotaConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Tiers | `tiers` | [169](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:169>) |
| Policy | `policy` | [170](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:170>) |

### GeminiTierQuotaConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| ProRPD | `pro_rpd` | [174](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:174>) |
| FlashRPD | `flash_rpd` | [175](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:175>) |
| CooldownMinutes | `cooldown_minutes` | [176](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:176>) |

### UpdateConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| ProxyURL | `proxy_url` | [183](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:183>) |

### IdempotencyConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| ObserveOnly | `observe_only` | [188](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:188>) |
| DefaultTTLSeconds | `default_ttl_seconds` | [190](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:190>) |
| SystemOperationTTLSeconds | `system_operation_ttl_seconds` | [192](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:192>) |
| ProcessingTimeoutSeconds | `processing_timeout_seconds` | [194](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:194>) |
| FailedRetryBackoffSeconds | `failed_retry_backoff_seconds` | [196](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:196>) |
| MaxStoredResponseLen | `max_stored_response_len` | [198](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:198>) |
| CleanupIntervalSeconds | `cleanup_interval_seconds` | [200](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:200>) |
| CleanupBatchSize | `cleanup_batch_size` | [202](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:202>) |

### BatchImageConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [206](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:206>) |
| MaxItemsPerJobDefault | `max_items_per_job_default` | [207](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:207>) |
| MaxItemsPerJobTrial | `max_items_per_job_trial` | [208](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:208>) |
| MaxOutputImagesPerJob | `max_output_images_per_job` | [209](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:209>) |
| MaxOutputImagesPerItem | `max_output_images_per_item` | [210](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:210>) |
| MaxPromptCharsPerItem | `max_prompt_chars_per_item` | [211](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:211>) |
| MaxReferenceImagesPerJob | `max_reference_images_per_job` | [212](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:212>) |
| MaxReferenceInlineBytesPerJob | `max_reference_inline_bytes_per_job` | [213](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:213>) |
| DefaultResponseMimeType | `default_response_mime_type` | [214](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:214>) |
| DefaultImageSize | `default_image_size` | [215](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:215>) |
| MaxDownloadItemsZip | `max_download_items_zip` | [216](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:216>) |
| MaxDownloadBytesPerRequest | `max_download_bytes_per_request` | [217](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:217>) |
| MaxDownloadDurationSeconds | `max_download_duration_seconds` | [218](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:218>) |
| MaxDownloadConcurrencyPerUser | `max_download_concurrency_per_user` | [219](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:219>) |
| InputRetentionAfterTerminalHours | `input_retention_after_terminal_hours` | [220](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:220>) |
| OutputRetentionAfterTerminalHours | `output_retention_after_terminal_hours` | [221](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:221>) |
| OutputRetentionMaxDays | `output_retention_max_days` | [222](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:222>) |
| CleanupIntervalMinutes | `cleanup_interval_minutes` | [223](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:223>) |
| CleanupBatchSize | `cleanup_batch_size` | [224](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:224>) |
| QueueEnabled | `queue_enabled` | [225](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:225>) |
| QueueReadyKey | `queue_ready_key` | [226](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:226>) |
| QueueDelayedKey | `queue_delayed_key` | [227](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:227>) |
| QueueActiveKey | `queue_active_key` | [228](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:228>) |
| InflightKeyPrefix | `inflight_key_prefix` | [229](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:229>) |
| LockKeyPrefix | `lock_key_prefix` | [230](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:230>) |
| IdempotencyKeyPrefix | `idempotency_key_prefix` | [231](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:231>) |
| InflightTTLSeconds | `inflight_ttl_seconds` | [232](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:232>) |
| JobLockTTLSeconds | `job_lock_ttl_seconds` | [233](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:233>) |
| DefaultRequeueDelaySeconds | `default_requeue_delay_seconds` | [234](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:234>) |
| ErrorRetryDelaySeconds | `error_retry_delay_seconds` | [235](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:235>) |
| LockConflictDelaySeconds | `lock_conflict_delay_seconds` | [236](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:236>) |
| StaleActiveAfterSeconds | `stale_active_after_seconds` | [237](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:237>) |
| DelayedMoverIntervalSeconds | `delayed_mover_interval_seconds` | [238](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:238>) |
| RecoveryIntervalSeconds | `recovery_interval_seconds` | [239](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:239>) |
| DelayedMoveLimit | `delayed_move_limit` | [240](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:240>) |
| RecoverLimit | `recover_limit` | [241](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:241>) |
| VertexEnabled | `vertex_enabled` | [242](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:242>) |
| VertexProjectID | `vertex_project_id` | [243](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:243>) |
| VertexLocation | `vertex_location` | [244](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:244>) |
| VertexManagedGCSBucket | `vertex_managed_gcs_bucket` | [247](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:247>) |
| VertexManagedGCSPrefix | `vertex_managed_gcs_prefix` | [248](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:248>) |
| VertexInputRetentionHours | `vertex_input_retention_hours` | [249](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:249>) |
| VertexOutputRetentionHours | `vertex_output_retention_hours` | [250](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:250>) |
| VertexBatchPredictionBaseURL | `vertex_batch_prediction_base_url` | [251](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:251>) |
| VertexGCSBaseURL | `vertex_gcs_base_url` | [252](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:252>) |

### ImageStorageConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [259](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:259>) |
| Endpoint | `endpoint` | [260](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:260>) |
| Region | `region` | [261](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:261>) |
| Bucket | `bucket` | [262](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:262>) |
| AccessKeyID | `access_key_id` | [263](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:263>) |
| SecretAccessKey | `secret_access_key` | [264](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:264>) |
| Prefix | `prefix` | [265](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:265>) |
| ForcePathStyle | `force_path_style` | [266](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:266>) |
| PublicBaseURL | `public_base_url` | [267](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:267>) |
| PresignExpiry | `presign_expiry_hours` | [268](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:268>) |
| MaxDownloadByte | `max_download_bytes` | [269](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:269>) |

### LinuxDoConnectConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [299](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:299>) |
| ClientID | `client_id` | [300](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:300>) |
| ClientSecret | `client_secret` | [301](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:301>) |
| AuthorizeURL | `authorize_url` | [302](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:302>) |
| TokenURL | `token_url` | [303](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:303>) |
| UserInfoURL | `userinfo_url` | [304](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:304>) |
| Scopes | `scopes` | [305](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:305>) |
| RedirectURL | `redirect_url` | [306](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:306>) |
| FrontendRedirectURL | `frontend_redirect_url` | [307](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:307>) |
| TokenAuthMethod | `token_auth_method` | [308](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:308>) |
| UsePKCE | `use_pkce` | [309](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:309>) |
| UserInfoEmailPath | `userinfo_email_path` | [313](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:313>) |
| UserInfoIDPath | `userinfo_id_path` | [314](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:314>) |
| UserInfoUsernamePath | `userinfo_username_path` | [315](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:315>) |

### WeChatConnectConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [319](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:319>) |
| AppID | `app_id` | [320](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:320>) |
| AppSecret | `app_secret` | [321](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:321>) |
| OpenAppID | `open_app_id` | [322](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:322>) |
| OpenAppSecret | `open_app_secret` | [323](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:323>) |
| MPAppID | `mp_app_id` | [324](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:324>) |
| MPAppSecret | `mp_app_secret` | [325](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:325>) |
| MobileAppID | `mobile_app_id` | [326](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:326>) |
| MobileAppSecret | `mobile_app_secret` | [327](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:327>) |
| OpenEnabled | `open_enabled` | [328](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:328>) |
| MPEnabled | `mp_enabled` | [329](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:329>) |
| MobileEnabled | `mobile_enabled` | [330](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:330>) |
| Mode | `mode` | [331](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:331>) |
| Scopes | `scopes` | [332](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:332>) |
| RedirectURL | `redirect_url` | [333](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:333>) |
| FrontendRedirectURL | `frontend_redirect_url` | [334](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:334>) |

### OIDCConnectConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [338](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:338>) |
| ProviderName | `provider_name` | [339](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:339>) |
| ClientID | `client_id` | [340](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:340>) |
| ClientSecret | `client_secret` | [341](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:341>) |
| IssuerURL | `issuer_url` | [342](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:342>) |
| DiscoveryURL | `discovery_url` | [343](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:343>) |
| AuthorizeURL | `authorize_url` | [344](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:344>) |
| TokenURL | `token_url` | [345](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:345>) |
| UserInfoURL | `userinfo_url` | [346](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:346>) |
| JWKSURL | `jwks_url` | [347](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:347>) |
| Scopes | `scopes` | [348](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:348>) |
| RedirectURL | `redirect_url` | [349](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:349>) |
| FrontendRedirectURL | `frontend_redirect_url` | [350](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:350>) |
| TokenAuthMethod | `token_auth_method` | [351](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:351>) |
| UsePKCE | `use_pkce` | [352](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:352>) |
| ValidateIDToken | `validate_id_token` | [353](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:353>) |
| UsePKCEExplicit | `-` | [354](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:354>) |
| ValidateIDTokenExplicit | `-` | [355](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:355>) |
| AllowedSigningAlgs | `allowed_signing_algs` | [356](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:356>) |
| ClockSkewSeconds | `clock_skew_seconds` | [357](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:357>) |
| RequireEmailVerified | `require_email_verified` | [358](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:358>) |
| UserInfoEmailPath | `userinfo_email_path` | [362](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:362>) |
| UserInfoIDPath | `userinfo_id_path` | [363](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:363>) |
| UserInfoUsernamePath | `userinfo_username_path` | [364](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:364>) |

### DingTalkConnectConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [368](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:368>) |
| ClientID | `client_id` | [369](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:369>) |
| ClientSecret | `client_secret` | [370](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:370>) |
| AuthorizeURL | `authorize_url` | [371](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:371>) |
| TokenURL | `token_url` | [372](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:372>) |
| UserInfoURL | `userinfo_url` | [373](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:373>) |
| Scopes | `scopes` | [374](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:374>) |
| RedirectURL | `redirect_url` | [375](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:375>) |
| FrontendRedirectURL | `frontend_redirect_url` | [376](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:376>) |
| DingTalkAppKind | `dingtalk_app_kind` | [379](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:379>) |
| AppType | `app_type` | [380](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:380>) |
| CorpRestrictionPolicy | `corp_restriction_policy` | [383](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:383>) |
| InternalCorpID | `internal_corp_id` | [384](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:384>) |
| BypassRegistration | `bypass_registration` | [385](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:385>) |
| SyncCorpEmail | `sync_corp_email` | [386](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:386>) |
| SyncDisplayName | `sync_display_name` | [387](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:387>) |
| SyncDept | `sync_dept` | [388](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:388>) |
| SyncCorpEmailAttrKey | `sync_corp_email_attr_key` | [389](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:389>) |
| SyncDisplayNameAttrKey | `sync_display_name_attr_key` | [390](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:390>) |
| SyncDeptAttrKey | `sync_dept_attr_key` | [391](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:391>) |
| SyncCorpEmailAttrName | `sync_corp_email_attr_name` | [392](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:392>) |
| SyncDisplayNameAttrName | `sync_display_name_attr_name` | [393](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:393>) |
| SyncDeptAttrName | `sync_dept_attr_name` | [394](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:394>) |
| RequireEmail | `require_email` | [397](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:397>) |
| UsernameOverwritePolicy | `username_overwrite_policy` | [398](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:398>) |
| UsernameAttributeKey | `username_attribute_key` | [401](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:401>) |
| EnableAttributeMatching | `enable_attribute_matching` | [402](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:402>) |
| EnableAttributeSync | `enable_attribute_sync` | [403](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:403>) |
| AttributeSyncFields | `attribute_sync_fields` | [404](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:404>) |
| AttributeSyncOverwritePolicy | `attribute_sync_overwrite_policy` | [405](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:405>) |

### EmailOAuthProviderConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [409](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:409>) |
| ClientID | `client_id` | [410](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:410>) |
| ClientSecret | `client_secret` | [411](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:411>) |
| AuthorizeURL | `authorize_url` | [412](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:412>) |
| TokenURL | `token_url` | [413](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:413>) |
| UserInfoURL | `userinfo_url` | [414](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:414>) |
| EmailsURL | `emails_url` | [415](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:415>) |
| Scopes | `scopes` | [416](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:416>) |
| RedirectURL | `redirect_url` | [417](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:417>) |
| FrontendRedirectURL | `frontend_redirect_url` | [418](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:418>) |

### TokenRefreshConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [643](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:643>) |
| CheckIntervalMinutes | `check_interval_minutes` | [645](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:645>) |
| RefreshBeforeExpiryHours | `refresh_before_expiry_hours` | [647](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:647>) |
| MaxRetries | `max_retries` | [649](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:649>) |
| RetryBackoffSeconds | `retry_backoff_seconds` | [651](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:651>) |
| CandidatePageSize | `candidate_page_size` | [653](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:653>) |
| ProviderConcurrency | `provider_concurrency` | [655](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:655>) |
| ProviderQPS | `provider_qps` | [657](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:657>) |
| ProviderFailureThreshold | `provider_failure_threshold` | [659](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:659>) |
| AttemptTimeoutSeconds | `attempt_timeout_seconds` | [661](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:661>) |
| CycleTimeoutSeconds | `cycle_timeout_seconds` | [663](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:663>) |

### PricingConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| RemoteURL | `remote_url` | [668](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:668>) |
| HashURL | `hash_url` | [670](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:670>) |
| DataDir | `data_dir` | [672](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:672>) |
| FallbackFile | `fallback_file` | [674](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:674>) |
| OverrideFile | `override_file` | [676](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:676>) |
| UpdateIntervalHours | `update_interval_hours` | [678](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:678>) |
| HashCheckIntervalMinutes | `hash_check_interval_minutes` | [680](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:680>) |

### ServerConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Host | `host` | [684](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:684>) |
| Port | `port` | [685](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:685>) |
| Mode | `mode` | [686](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:686>) |
| EnableServerTiming | `enable_server_timing` | [687](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:687>) |
| FrontendURL | `frontend_url` | [688](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:688>) |
| ReadHeaderTimeout | `read_header_timeout` | [689](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:689>) |
| MaxHeaderBytes | `max_header_bytes` | [690](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:690>) |
| IdleTimeout | `idle_timeout` | [691](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:691>) |
| TrustedProxies | `trusted_proxies` | [692](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:692>) |
| TrustedProxiesConfigured | `-` | [693](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:693>) |
| MaxRequestBodySize | `max_request_body_size` | [694](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:694>) |
| H2C | `h2c` | [695](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:695>) |

### H2CConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [700](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:700>) |
| MaxConcurrentStreams | `max_concurrent_streams` | [701](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:701>) |
| IdleTimeout | `idle_timeout` | [702](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:702>) |
| MaxReadFrameSize | `max_read_frame_size` | [703](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:703>) |
| MaxUploadBufferPerConnection | `max_upload_buffer_per_connection` | [704](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:704>) |
| MaxUploadBufferPerStream | `max_upload_buffer_per_stream` | [705](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:705>) |

### CORSConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| AllowedOrigins | `allowed_origins` | [709](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:709>) |
| AllowCredentials | `allow_credentials` | [710](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:710>) |

### WebAuthnConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [717](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:717>) |
| RPDisplayName | `rp_display_name` | [718](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:718>) |
| RPID | `rp_id` | [719](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:719>) |
| RPOrigins | `rp_origins` | [720](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:720>) |

### SecurityConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| URLAllowlist | `url_allowlist` | [731](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:731>) |
| ResponseHeaders | `response_headers` | [732](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:732>) |
| CSP | `csp` | [733](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:733>) |
| ProxyFallback | `proxy_fallback` | [734](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:734>) |
| ProxyProbe | `proxy_probe` | [735](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:735>) |
| TrustForwardedIPForAPIKeyACL | `trust_forwarded_ip_for_api_key_acl` | [738](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:738>) |
| ForwardedClientIPHeaders | `forwarded_client_ip_headers` | [739](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:739>) |
| forwardedClientIPSettingsLive | `-` | [740](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:740>) |

### URLAllowlistConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [823](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:823>) |
| UpstreamHosts | `upstream_hosts` | [824](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:824>) |
| PricingHosts | `pricing_hosts` | [825](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:825>) |
| CRSHosts | `crs_hosts` | [826](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:826>) |
| AllowPrivateHosts | `allow_private_hosts` | [827](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:827>) |
| AllowInsecureHTTP | `allow_insecure_http` | [829](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:829>) |

### ResponseHeaderConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [833](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:833>) |
| AdditionalAllowed | `additional_allowed` | [834](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:834>) |
| ForceRemove | `force_remove` | [835](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:835>) |

### CSPConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [839](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:839>) |
| Policy | `policy` | [840](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:840>) |

### ProxyFallbackConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| AllowDirectOnError | `allow_direct_on_error` | [851](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:851>) |

### ProxyProbeConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| InsecureSkipVerify | `insecure_skip_verify` | [855](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:855>) |
| URLs | `urls` | [859](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:859>) |

### ProbeURLConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| URL | `url` | [864](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:864>) |
| Parser | `parser` | [865](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:865>) |

### BillingConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| CircuitBreaker | `circuit_breaker` | [906](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:906>) |
| BalancePreauthorizationEnabled | `balance_preauthorization_enabled` | [909](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:909>) |
| MinimumBalanceReserve | `minimum_balance_reserve` | [913](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:913>) |
| UserPlatformQuotaCacheTTLSeconds | `user_platform_quota_cache_ttl_seconds` | [919](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:919>) |
| UserPlatformQuotaSentinelTTLSeconds | `user_platform_quota_sentinel_ttl_seconds` | [922](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:922>) |

### CircuitBreakerConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [926](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:926>) |
| FailureThreshold | `failure_threshold` | [927](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:927>) |
| ResetTimeoutSeconds | `reset_timeout_seconds` | [928](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:928>) |
| HalfOpenRequests | `half_open_requests` | [929](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:929>) |

### ConcurrencyConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| PingInterval | `ping_interval` | [934](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:934>) |

### ImageConcurrencyConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [939](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:939>) |
| MaxConcurrentRequests | `max_concurrent_requests` | [941](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:941>) |
| OverflowMode | `overflow_mode` | [943](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:943>) |
| WaitTimeoutSeconds | `wait_timeout_seconds` | [945](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:945>) |
| MaxWaitingRequests | `max_waiting_requests` | [947](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:947>) |

### GatewayConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| ResponseHeaderTimeout | `response_header_timeout` | [959](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:959>) |
| OpenAIResponseHeaderTimeout | `openai_response_header_timeout` | [962](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:962>) |
| GrokResponseHeaderTimeout | `grok_response_header_timeout` | [965](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:965>) |
| MaxBodySize | `max_body_size` | [967](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:967>) |
| TextMaxBodySize | `text_max_body_size` | [969](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:969>) |
| UpstreamResponseReadMaxBytes | `upstream_response_read_max_bytes` | [971](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:971>) |
| ModelsListReadMaxBytes | `models_list_read_max_bytes` | [973](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:973>) |
| ProxyProbeResponseReadMaxBytes | `proxy_probe_response_read_max_bytes` | [975](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:975>) |
| GeminiDebugResponseHeaders | `gemini_debug_response_headers` | [977](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:977>) |
| ConnectionPoolIsolation | `connection_pool_isolation` | [979](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:979>) |
| ForceCodexCLI | `force_codex_cli` | [982](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:982>) |
| DisableCodexIdentityEnforcement | `disable_codex_identity_enforcement` | [991](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:991>) |
| DisableCodexOriginatorNormalization | `disable_codex_originator_normalization` | [994](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:994>) |
| CodexImageGenerationBridgeEnabled | `codex_image_generation_bridge_enabled` | [997](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:997>) |
| ForcedCodexInstructionsTemplateFile | `forced_codex_instructions_template_file` | [1000](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1000>) |
| ForcedCodexInstructionsTemplate | `-` | [1003](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1003>) |
| OpenAIPassthroughAllowTimeoutHeaders | `openai_passthrough_allow_timeout_headers` | [1006](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1006>) |
| OpenAICompactModel | `openai_compact_model` | [1009](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1009>) |
| OpenAIWS | `openai_ws` | [1011](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1011>) |
| Live | `live` | [1013](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1013>) |
| OpenAIScheduler | `openai_scheduler` | [1015](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1015>) |
| OpenAIHTTP2 | `openai_http2` | [1017](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1017>) |
| OpenAIProxyStreamCircuit | `openai_proxy_stream_circuit` | [1019](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1019>) |
| ImageConcurrency | `image_concurrency` | [1021](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1021>) |
| MaxIdleConns | `max_idle_conns` | [1025](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1025>) |
| MaxIdleConnsPerHost | `max_idle_conns_per_host` | [1027](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1027>) |
| MaxConnsPerHost | `max_conns_per_host` | [1029](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1029>) |
| IdleConnTimeoutSeconds | `idle_conn_timeout_seconds` | [1031](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1031>) |
| MaxUpstreamClients | `max_upstream_clients` | [1036](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1036>) |
| ClientIdleTTLSeconds | `client_idle_ttl_seconds` | [1040](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1040>) |
| ConcurrencySlotTTLMinutes | `concurrency_slot_ttl_minutes` | [1043](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1043>) |
| SessionIdleTimeoutMinutes | `session_idle_timeout_minutes` | [1047](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1047>) |
| StreamDataIntervalTimeout | `stream_data_interval_timeout` | [1050](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1050>) |
| StreamKeepaliveInterval | `stream_keepalive_interval` | [1052](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1052>) |
| ImageStreamDataIntervalTimeout | `image_stream_data_interval_timeout` | [1054](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1054>) |
| ImageStreamKeepaliveInterval | `image_stream_keepalive_interval` | [1056](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1056>) |
| ImageNonstreamKeepaliveInterval | `image_nonstream_keepalive_interval` | [1058](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1058>) |
| MaxLineSize | `max_line_size` | [1060](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1060>) |
| LogUpstreamErrorBody | `log_upstream_error_body` | [1063](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1063>) |
| LogUpstreamErrorBodyMaxBytes | `log_upstream_error_body_max_bytes` | [1065](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1065>) |
| InjectBetaForAPIKey | `inject_beta_for_apikey` | [1068](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1068>) |
| FailoverOn400 | `failover_on_400` | [1071](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1071>) |
| MaxAccountSwitches | `max_account_switches` | [1074](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1074>) |
| MaxAccountSwitchesGemini | `max_account_switches_gemini` | [1076](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1076>) |
| AntigravityFallbackCooldownMinutes | `antigravity_fallback_cooldown_minutes` | [1079](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1079>) |
| Scheduling | `scheduling` | [1082](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1082>) |
| TLSFingerprint | `tls_fingerprint` | [1085](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1085>) |
| UsageRecord | `usage_record` | [1088](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1088>) |
| UserGroupRateCacheTTLSeconds | `user_group_rate_cache_ttl_seconds` | [1091](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1091>) |
| ModelsListCacheTTLSeconds | `models_list_cache_ttl_seconds` | [1093](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1093>) |
| UserMessageQueue | `user_message_queue` | [1097](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1097>) |
| Grok | `grok` | [1100](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1100>) |
| CNProviders | `cn_providers` | [1104](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1104>) |

### GatewayGrokConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| PasswordAuthEnabled | `password_auth_enabled` | [1122](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1122>) |
| FreeQuotaSoftGateEnabled | `free_quota_soft_gate_enabled` | [1125](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1125>) |
| FreeQuotaTokenLimit | `free_quota_token_limit` | [1127](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1127>) |
| FreeQuotaSoftGatePercent | `free_quota_soft_gate_percent` | [1129](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1129>) |
| FreeQuotaWindowHours | `free_quota_window_hours` | [1131](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1131>) |
| FreeQuotaStatsCacheSeconds | `free_quota_stats_cache_seconds` | [1134](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1134>) |

### GatewayCNProvidersConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| BalanceCheckEnabled | `balance_check_enabled` | [1144](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1144>) |
| BalanceThreshold | `balance_threshold` | [1145](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1145>) |
| BalanceCheckIntervalMinutes | `balance_check_interval_minutes` | [1146](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1146>) |

### GatewayLiveConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| MaxSessionDurationSeconds | `max_session_duration_seconds` | [1151](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1151>) |

### GatewayOpenAIHTTP2Config

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [1158](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1158>) |
| AllowProxyFallbackToHTTP1 | `allow_proxy_fallback_to_http1` | [1160](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1160>) |
| FallbackErrorThreshold | `fallback_error_threshold` | [1162](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1162>) |
| FallbackWindowSeconds | `fallback_window_seconds` | [1164](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1164>) |
| FallbackTTLSeconds | `fallback_ttl_seconds` | [1166](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1166>) |

### GatewayOpenAIProxyStreamCircuitConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Disabled | `disabled` | [1173](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1173>) |
| FailureThreshold | `failure_threshold` | [1175](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1175>) |
| WindowSeconds | `window_seconds` | [1177](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1177>) |
| TTLSeconds | `ttl_seconds` | [1179](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1179>) |

### UserMessageQueueConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Mode | `mode` | [1189](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1189>) |
| Enabled | `enabled` | [1191](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1191>) |
| LockTTLMs | `lock_ttl_ms` | [1193](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1193>) |
| WaitTimeoutMs | `wait_timeout_ms` | [1195](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1195>) |
| MinDelayMs | `min_delay_ms` | [1197](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1197>) |
| MaxDelayMs | `max_delay_ms` | [1199](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1199>) |
| CleanupIntervalSeconds | `cleanup_interval_seconds` | [1201](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1201>) |

### GatewayOpenAIWSConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| ModeRouterV2Enabled | `mode_router_v2_enabled` | [1231](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1231>) |
| IngressModeDefault | `ingress_mode_default` | [1233](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1233>) |
| ClientFirstMessageTimeoutSeconds | `client_first_message_timeout_seconds` | [1236](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1236>) |
| IngressInterTurnIdleTimeoutSeconds | `ingress_inter_turn_idle_timeout_seconds` | [1239](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1239>) |
| MaxIngressConnectionsPerAPIKey | `max_ingress_connections_per_api_key` | [1242](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1242>) |
| Enabled | `enabled` | [1244](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1244>) |
| OAuthEnabled | `oauth_enabled` | [1246](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1246>) |
| APIKeyEnabled | `apikey_enabled` | [1248](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1248>) |
| ForceHTTP | `force_http` | [1250](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1250>) |
| AllowStoreRecovery | `allow_store_recovery` | [1252](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1252>) |
| IngressPreviousResponseRecoveryEnabled | `ingress_previous_response_recovery_enabled` | [1254](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1254>) |
| StoreDisabledConnMode | `store_disabled_conn_mode` | [1259](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1259>) |
| StoreDisabledForceNewConn | `store_disabled_force_new_conn` | [1262](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1262>) |
| PrewarmGenerateEnabled | `prewarm_generate_enabled` | [1264](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1264>) |
| ClientReadLimitBytes | `client_read_limit_bytes` | [1266](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1266>) |
| HTTPBridgeEnabled | `http_bridge_enabled` | [1268](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1268>) |
| HTTPBridgeThresholdBytes | `http_bridge_threshold_bytes` | [1270](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1270>) |
| ResponsesWebsockets | `responses_websockets` | [1273](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1273>) |
| ResponsesWebsocketsV2 | `responses_websockets_v2` | [1274](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1274>) |
| MaxConnsPerAccount | `max_conns_per_account` | [1277](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1277>) |
| MinIdlePerAccount | `min_idle_per_account` | [1278](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1278>) |
| MaxIdlePerAccount | `max_idle_per_account` | [1279](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1279>) |
| DynamicMaxConnsByAccountConcurrencyEnabled | `dynamic_max_conns_by_account_concurrency_enabled` | [1283](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1283>) |
| OAuthMaxConnsFactor | `oauth_max_conns_factor` | [1285](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1285>) |
| APIKeyMaxConnsFactor | `apikey_max_conns_factor` | [1287](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1287>) |
| DialTimeoutSeconds | `dial_timeout_seconds` | [1288](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1288>) |
| ReadTimeoutSeconds | `read_timeout_seconds` | [1289](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1289>) |
| WriteTimeoutSeconds | `write_timeout_seconds` | [1290](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1290>) |
| PoolTargetUtilization | `pool_target_utilization` | [1291](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1291>) |
| QueueLimitPerConn | `queue_limit_per_conn` | [1292](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1292>) |
| EventFlushBatchSize | `event_flush_batch_size` | [1294](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1294>) |
| EventFlushIntervalMS | `event_flush_interval_ms` | [1296](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1296>) |
| PrewarmCooldownMS | `prewarm_cooldown_ms` | [1298](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1298>) |
| FallbackCooldownSeconds | `fallback_cooldown_seconds` | [1300](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1300>) |
| RetryBackoffInitialMS | `retry_backoff_initial_ms` | [1302](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1302>) |
| RetryBackoffMaxMS | `retry_backoff_max_ms` | [1304](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1304>) |
| RetryJitterRatio | `retry_jitter_ratio` | [1306](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1306>) |
| RetryTotalBudgetMS | `retry_total_budget_ms` | [1308](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1308>) |
| PayloadLogSampleRate | `payload_log_sample_rate` | [1310](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1310>) |
| LBTopK | `lb_top_k` | [1313](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1313>) |
| StickySessionTTLSeconds | `sticky_session_ttl_seconds` | [1315](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1315>) |
| SessionHashReadOldFallback | `session_hash_read_old_fallback` | [1317](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1317>) |
| SessionHashDualWriteOld | `session_hash_dual_write_old` | [1319](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1319>) |
| MetadataBridgeEnabled | `metadata_bridge_enabled` | [1321](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1321>) |
| StickyResponseIDTTLSeconds | `sticky_response_id_ttl_seconds` | [1323](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1323>) |
| StickyPreviousResponseTTLSeconds | `sticky_previous_response_ttl_seconds` | [1325](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1325>) |
| SchedulerScoreWeights | `scheduler_score_weights` | [1327](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1327>) |

### GatewayOpenAIWSSchedulerScoreWeights

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Priority | `priority` | [1332](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1332>) |
| Load | `load` | [1333](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1333>) |
| Queue | `queue` | [1334](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1334>) |
| ErrorRate | `error_rate` | [1335](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1335>) |
| TTFT | `ttft` | [1336](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1336>) |
| Reset | `reset` | [1339](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1339>) |
| QuotaHeadroom | `quota_headroom` | [1341](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1341>) |
| UpstreamCost | `upstream_cost` | [1343](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1343>) |
| PreviousResponse | `previous_response` | [1345](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1345>) |
| SessionSticky | `session_sticky` | [1346](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1346>) |

### GatewayOpenAISchedulerConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| StickyEscapeEnabled | `sticky_escape_enabled` | [1374](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1374>) |
| StickyEscapeTTFTMs | `sticky_escape_ttft_ms` | [1376](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1376>) |
| StickyEscapeErrorRate | `sticky_escape_error_rate` | [1378](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1378>) |

### GatewayUsageRecordConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| WorkerCount | `worker_count` | [1384](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1384>) |
| QueueSize | `queue_size` | [1386](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1386>) |
| TaskTimeoutSeconds | `task_timeout_seconds` | [1388](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1388>) |
| OverflowPolicy | `overflow_policy` | [1390](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1390>) |
| OverflowSamplePercent | `overflow_sample_percent` | [1392](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1392>) |
| AutoScaleEnabled | `auto_scale_enabled` | [1395](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1395>) |
| AutoScaleMinWorkers | `auto_scale_min_workers` | [1397](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1397>) |
| AutoScaleMaxWorkers | `auto_scale_max_workers` | [1399](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1399>) |
| AutoScaleUpQueuePercent | `auto_scale_up_queue_percent` | [1401](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1401>) |
| AutoScaleDownQueuePercent | `auto_scale_down_queue_percent` | [1403](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1403>) |
| AutoScaleUpStep | `auto_scale_up_step` | [1405](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1405>) |
| AutoScaleDownStep | `auto_scale_down_step` | [1407](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1407>) |
| AutoScaleCheckIntervalSeconds | `auto_scale_check_interval_seconds` | [1409](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1409>) |
| AutoScaleCooldownSeconds | `auto_scale_cooldown_seconds` | [1411](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1411>) |

### TLSFingerprintConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [1418](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1418>) |
| Profiles | `profiles` | [1421](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1421>) |

### TLSProfileConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Name | `name` | [1429](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1429>) |
| EnableGREASE | `enable_grease` | [1431](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1431>) |
| CipherSuites | `cipher_suites` | [1433](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1433>) |
| Curves | `curves` | [1435](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1435>) |
| PointFormats | `point_formats` | [1437](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1437>) |
| SignatureAlgorithms | `signature_algorithms` | [1439](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1439>) |
| ALPNProtocols | `alpn_protocols` | [1441](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1441>) |
| SupportedVersions | `supported_versions` | [1443](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1443>) |
| KeyShareGroups | `key_share_groups` | [1445](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1445>) |
| PSKModes | `psk_modes` | [1447](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1447>) |
| Extensions | `extensions` | [1451](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1451>) |

### GatewaySchedulingConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| NewSessionSoftLimitPercent | `new_session_soft_limit_percent` | [1458](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1458>) |
| StickySessionMaxWaiting | `sticky_session_max_waiting` | [1460](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1460>) |
| StickySessionWaitTimeout | `sticky_session_wait_timeout` | [1461](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1461>) |
| FallbackWaitTimeout | `fallback_wait_timeout` | [1464](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1464>) |
| FallbackMaxWaiting | `fallback_max_waiting` | [1465](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1465>) |
| FallbackSelectionMode | `fallback_selection_mode` | [1468](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1468>) |
| PreferSoonestReset | `prefer_soonest_reset` | [1473](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1473>) |
| LoadBatchEnabled | `load_batch_enabled` | [1476](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1476>) |
| LoadBatchCacheTTLMS | `load_batch_cache_ttl_ms` | [1477](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1477>) |
| SnapshotMGetChunkSize | `snapshot_mget_chunk_size` | [1479](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1479>) |
| SnapshotWriteChunkSize | `snapshot_write_chunk_size` | [1481](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1481>) |
| SlotCleanupInterval | `slot_cleanup_interval` | [1484](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1484>) |
| DbFallbackEnabled | `db_fallback_enabled` | [1487](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1487>) |
| DbFallbackTimeoutSeconds | `db_fallback_timeout_seconds` | [1489](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1489>) |
| DbFallbackMaxQPS | `db_fallback_max_qps` | [1491](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1491>) |
| OutboxPollIntervalSeconds | `outbox_poll_interval_seconds` | [1495](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1495>) |
| OutboxLagWarnSeconds | `outbox_lag_warn_seconds` | [1497](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1497>) |
| OutboxLagRebuildSeconds | `outbox_lag_rebuild_seconds` | [1499](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1499>) |
| OutboxLagRebuildFailures | `outbox_lag_rebuild_failures` | [1501](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1501>) |
| OutboxBacklogRebuildRows | `outbox_backlog_rebuild_rows` | [1503](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1503>) |
| FullRebuildIntervalSeconds | `full_rebuild_interval_seconds` | [1507](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1507>) |

### DatabaseConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Host | `host` | [1517](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1517>) |
| Port | `port` | [1518](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1518>) |
| User | `user` | [1519](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1519>) |
| Password | `password` | [1520](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1520>) |
| DBName | `dbname` | [1521](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1521>) |
| SSLMode | `sslmode` | [1522](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1522>) |
| MigrationMode | `migration_mode` | [1525](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1525>) |
| MaxOpenConns | `max_open_conns` | [1528](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1528>) |
| MaxIdleConns | `max_idle_conns` | [1530](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1530>) |
| ConnMaxLifetimeMinutes | `conn_max_lifetime_minutes` | [1532](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1532>) |
| ConnMaxIdleTimeMinutes | `conn_max_idle_time_minutes` | [1534](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1534>) |
| UserPlatformQuotaFlusherEnabled | `user_platform_quota_flusher_enabled` | [1536](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1536>) |
| UserPlatformQuotaFlushIntervalMs | `user_platform_quota_flush_interval_ms` | [1538](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1538>) |
| UserPlatformQuotaFlushBatchSize | `user_platform_quota_flush_batch_size` | [1541](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1541>) |

### RedisConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Host | `host` | [1579](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1579>) |
| Port | `port` | [1580](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1580>) |
| Username | `username` | [1581](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1581>) |
| Password | `password` | [1582](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1582>) |
| DB | `db` | [1583](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1583>) |
| DialTimeoutSeconds | `dial_timeout_seconds` | [1586](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1586>) |
| ReadTimeoutSeconds | `read_timeout_seconds` | [1588](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1588>) |
| WriteTimeoutSeconds | `write_timeout_seconds` | [1590](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1590>) |
| PoolSize | `pool_size` | [1592](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1592>) |
| MinIdleConns | `min_idle_conns` | [1594](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1594>) |
| EnableTLS | `enable_tls` | [1596](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1596>) |

### OpsConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [1608](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1608>) |
| UsePreaggregatedTables | `use_preaggregated_tables` | [1611](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1611>) |
| Cleanup | `cleanup` | [1614](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1614>) |
| MetricsCollectorCache | `metrics_collector_cache` | [1617](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1617>) |
| Aggregation | `aggregation` | [1620](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1620>) |

### OpsCleanupConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [1624](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1624>) |
| Schedule | `schedule` | [1625](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1625>) |
| ErrorLogRetentionDays | `error_log_retention_days` | [1629](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1629>) |
| SystemLogRetentionDays | `system_log_retention_days` | [1630](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1630>) |
| MinuteMetricsRetentionDays | `minute_metrics_retention_days` | [1631](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1631>) |
| HourlyMetricsRetentionDays | `hourly_metrics_retention_days` | [1632](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1632>) |

### OpsAggregationConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [1636](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1636>) |

### OpsMetricsCollectorCacheConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [1640](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1640>) |
| TTL | `ttl` | [1641](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1641>) |

### JWTConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Secret | `secret` | [1645](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1645>) |
| ExpireHour | `expire_hour` | [1646](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1646>) |
| AccessTokenExpireMinutes | `access_token_expire_minutes` | [1650](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1650>) |
| RefreshTokenExpireDays | `refresh_token_expire_days` | [1652](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1652>) |
| RefreshWindowMinutes | `refresh_window_minutes` | [1654](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1654>) |

### TotpConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| EncryptionKey | `encryption_key` | [1661](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1661>) |
| EncryptionKeyConfigured | `-` | [1664](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1664>) |

### TurnstileConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Required | `required` | [1668](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1668>) |

### DefaultConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| AdminEmail | `admin_email` | [1672](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1672>) |
| AdminPassword | `admin_password` | [1673](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1673>) |
| UserConcurrency | `user_concurrency` | [1674](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1674>) |
| UserBalance | `user_balance` | [1675](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1675>) |
| APIKeyPrefix | `api_key_prefix` | [1676](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1676>) |
| RateMultiplier | `rate_multiplier` | [1677](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1677>) |

### RateLimitConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| OverloadCooldownMinutes | `overload_cooldown_minutes` | [1681](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1681>) |
| OAuth401CooldownMinutes | `oauth_401_cooldown_minutes` | [1682](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1682>) |

### APIKeyAuthCacheConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| L1Size | `l1_size` | [1687](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1687>) |
| L1TTLSeconds | `l1_ttl_seconds` | [1688](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1688>) |
| L2TTLSeconds | `l2_ttl_seconds` | [1689](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1689>) |
| NegativeTTLSeconds | `negative_ttl_seconds` | [1690](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1690>) |
| JitterPercent | `jitter_percent` | [1691](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1691>) |
| Singleflight | `singleflight` | [1692](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1692>) |
| LookupConcurrency | `lookup_concurrency` | [1693](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1693>) |
| InvalidAbuse | `invalid_abuse` | [1694](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1694>) |

### InvalidAuthAbuseConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [1698](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1698>) |
| Threshold | `threshold` | [1699](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1699>) |
| WindowSeconds | `window_seconds` | [1700](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1700>) |
| BlockSeconds | `block_seconds` | [1701](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1701>) |
| Capacity | `capacity` | [1702](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1702>) |

### SubscriptionCacheConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| L1Size | `l1_size` | [1707](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1707>) |
| L1TTLSeconds | `l1_ttl_seconds` | [1708](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1708>) |
| JitterPercent | `jitter_percent` | [1709](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1709>) |

### SubscriptionMaintenanceConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| WorkerCount | `worker_count` | [1715](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1715>) |
| QueueSize | `queue_size` | [1716](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1716>) |

### DashboardCacheConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [1722](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1722>) |
| KeyPrefix | `key_prefix` | [1724](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1724>) |
| StatsFreshTTLSeconds | `stats_fresh_ttl_seconds` | [1726](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1726>) |
| StatsTTLSeconds | `stats_ttl_seconds` | [1728](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1728>) |
| StatsRefreshTimeoutSeconds | `stats_refresh_timeout_seconds` | [1730](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1730>) |

### DashboardAggregationConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [1736](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1736>) |
| IntervalSeconds | `interval_seconds` | [1738](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1738>) |
| LookbackSeconds | `lookback_seconds` | [1740](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1740>) |
| BackfillEnabled | `backfill_enabled` | [1742](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1742>) |
| BackfillMaxDays | `backfill_max_days` | [1744](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1744>) |
| Retention | `retention` | [1746](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1746>) |
| RecomputeDays | `recompute_days` | [1748](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1748>) |

### DashboardAggregationRetentionConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| UsageLogsDays | `usage_logs_days` | [1753](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1753>) |
| UsageBillingDedupDays | `usage_billing_dedup_days` | [1754](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1754>) |
| HourlyDays | `hourly_days` | [1755](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1755>) |
| DailyDays | `daily_days` | [1756](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1756>) |

### UsageCleanupConfig

| Go field | Configuration key | Evidence |
| --- | --- | --- |
| Enabled | `enabled` | [1762](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1762>) |
| MaxRangeDays | `max_range_days` | [1764](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1764>) |
| BatchSize | `batch_size` | [1766](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1766>) |
| WorkerIntervalSeconds | `worker_interval_seconds` | [1768](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1768>) |
| TaskTimeoutSeconds | `task_timeout_seconds` | [1770](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1770>) |

## Persistent settings and DTO declarations

669 declaration occurrences follow. `SettingKey` constants and DTO JSON fields overlap; update/read DTOs may repeat names. These are not 669 independent feature flags. Other subsystem-local settings are indexed in the next section.

### backend/internal/service/domain_constants.go

| Declared key/field | Kind | Evidence |
| --- | --- | --- |
| `registration_enabled` | setting key | [189](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:189>) |
| `email_verify_enabled` | setting key | [190](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:190>) |
| `registration_email_suffix_whitelist` | setting key | [191](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:191>) |
| `registration_email_domain_quota_enabled` | setting key | [194](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:194>) |
| `promo_code_enabled` | setting key | [195](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:195>) |
| `password_reset_enabled` | setting key | [196](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:196>) |
| `frontend_url` | setting key | [197](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:197>) |
| `invitation_code_enabled` | setting key | [198](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:198>) |
| `affiliate_enabled` | setting key | [199](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:199>) |
| `affiliate_rebate_rate` | setting key | [200](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:200>) |
| `affiliate_rebate_freeze_hours` | setting key | [201](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:201>) |
| `affiliate_rebate_duration_days` | setting key | [202](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:202>) |
| `affiliate_rebate_per_invitee_cap` | setting key | [203](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:203>) |
| `affiliate_admin_recharge_enabled` | setting key | [204](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:204>) |
| `risk_control_enabled` | setting key | [205](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:205>) |
| `content_moderation_config` | setting key | [206](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:206>) |
| `cyber_session_block_enabled` | setting key | [207](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:207>) |
| `cyber_session_block_ttl_seconds` | setting key | [208](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:208>) |
| `login_agreement_enabled` | setting key | [209](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:209>) |
| `login_agreement_mode` | setting key | [210](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:210>) |
| `login_agreement_updated_at` | setting key | [211](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:211>) |
| `login_agreement_documents` | setting key | [212](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:212>) |
| `smtp_host` | setting key | [215](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:215>) |
| `smtp_port` | setting key | [216](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:216>) |
| `smtp_username` | setting key | [217](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:217>) |
| `smtp_password` | setting key | [218](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:218>) |
| `smtp_from` | setting key | [219](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:219>) |
| `smtp_from_name` | setting key | [220](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:220>) |
| `smtp_use_tls` | setting key | [221](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:221>) |
| `turnstile_enabled` | setting key | [224](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:224>) |
| `turnstile_site_key` | setting key | [225](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:225>) |
| `turnstile_secret_key` | setting key | [226](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:226>) |
| `tencent_captcha_enabled` | setting key | [229](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:229>) |
| `tencent_captcha_app_id` | setting key | [230](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:230>) |
| `tencent_captcha_app_secret_key` | setting key | [231](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:231>) |
| `tencent_captcha_cloud_secret_id` | setting key | [232](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:232>) |
| `tencent_captcha_cloud_secret_key` | setting key | [233](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:233>) |
| `tencent_captcha_region` | setting key | [234](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:234>) |
| `aliyun_captcha_enabled` | setting key | [237](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:237>) |
| `aliyun_captcha_access_key_id` | setting key | [238](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:238>) |
| `aliyun_captcha_access_key_secret` | setting key | [239](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:239>) |
| `aliyun_captcha_scene_id` | setting key | [240](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:240>) |
| `aliyun_captcha_prefix` | setting key | [241](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:241>) |
| `aliyun_captcha_region` | setting key | [242](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:242>) |
| `api_key_acl_trust_forwarded_ip` | setting key | [245](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:245>) |
| `forwarded_client_ip_headers` | setting key | [246](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:246>) |
| `totp_enabled` | setting key | [250](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:250>) |
| `passkey_enabled` | setting key | [251](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:251>) |
| `session_binding_enabled` | setting key | [254](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:254>) |
| `step_up_enabled` | setting key | [257](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:257>) |
| `panel_rate_limit_settings` | setting key | [260](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:260>) |
| `access_block_settings` | setting key | [263](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:263>) |
| `audit_log_retention_days` | setting key | [266](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:266>) |
| `linuxdo_connect_enabled` | setting key | [269](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:269>) |
| `linuxdo_connect_client_id` | setting key | [270](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:270>) |
| `linuxdo_connect_client_secret` | setting key | [271](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:271>) |
| `linuxdo_connect_redirect_url` | setting key | [272](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:272>) |
| `dingtalk_connect_enabled` | setting key | [275](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:275>) |
| `dingtalk_connect_client_id` | setting key | [276](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:276>) |
| `dingtalk_connect_client_secret` | setting key | [277](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:277>) |
| `dingtalk_connect_redirect_url` | setting key | [278](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:278>) |
| `dingtalk_connect_corp_restriction_policy` | setting key | [279](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:279>) |
| `dingtalk_connect_internal_corp_id` | setting key | [280](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:280>) |
| `dingtalk_connect_bypass_registration` | setting key | [281](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:281>) |
| `dingtalk_connect_sync_corp_email` | setting key | [282](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:282>) |
| `dingtalk_connect_sync_display_name` | setting key | [283](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:283>) |
| `dingtalk_connect_sync_dept` | setting key | [284](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:284>) |
| `dingtalk_connect_sync_corp_email_attr_key` | setting key | [285](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:285>) |
| `dingtalk_connect_sync_display_name_attr_key` | setting key | [286](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:286>) |
| `dingtalk_connect_sync_dept_attr_key` | setting key | [287](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:287>) |
| `dingtalk_connect_sync_corp_email_attr_name` | setting key | [288](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:288>) |
| `dingtalk_connect_sync_display_name_attr_name` | setting key | [289](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:289>) |
| `dingtalk_connect_sync_dept_attr_name` | setting key | [290](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:290>) |
| `wechat_connect_enabled` | setting key | [293](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:293>) |
| `wechat_connect_app_id` | setting key | [294](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:294>) |
| `wechat_connect_app_secret` | setting key | [295](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:295>) |
| `wechat_connect_open_app_id` | setting key | [296](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:296>) |
| `wechat_connect_open_app_secret` | setting key | [297](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:297>) |
| `wechat_connect_mp_app_id` | setting key | [298](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:298>) |
| `wechat_connect_mp_app_secret` | setting key | [299](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:299>) |
| `wechat_connect_mobile_app_id` | setting key | [300](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:300>) |
| `wechat_connect_mobile_app_secret` | setting key | [301](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:301>) |
| `wechat_connect_open_enabled` | setting key | [302](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:302>) |
| `wechat_connect_mp_enabled` | setting key | [303](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:303>) |
| `wechat_connect_mobile_enabled` | setting key | [304](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:304>) |
| `wechat_connect_mode` | setting key | [305](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:305>) |
| `wechat_connect_scopes` | setting key | [306](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:306>) |
| `wechat_connect_redirect_url` | setting key | [307](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:307>) |
| `wechat_connect_frontend_redirect_url` | setting key | [308](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:308>) |
| `oidc_connect_enabled` | setting key | [311](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:311>) |
| `oidc_connect_provider_name` | setting key | [312](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:312>) |
| `oidc_connect_client_id` | setting key | [313](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:313>) |
| `oidc_connect_client_secret` | setting key | [314](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:314>) |
| `oidc_connect_issuer_url` | setting key | [315](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:315>) |
| `oidc_connect_discovery_url` | setting key | [316](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:316>) |
| `oidc_connect_authorize_url` | setting key | [317](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:317>) |
| `oidc_connect_token_url` | setting key | [318](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:318>) |
| `oidc_connect_userinfo_url` | setting key | [319](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:319>) |
| `oidc_connect_jwks_url` | setting key | [320](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:320>) |
| `oidc_connect_scopes` | setting key | [321](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:321>) |
| `oidc_connect_redirect_url` | setting key | [322](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:322>) |
| `oidc_connect_frontend_redirect_url` | setting key | [323](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:323>) |
| `oidc_connect_token_auth_method` | setting key | [324](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:324>) |
| `oidc_connect_use_pkce` | setting key | [325](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:325>) |
| `oidc_connect_validate_id_token` | setting key | [326](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:326>) |
| `oidc_connect_allowed_signing_algs` | setting key | [327](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:327>) |
| `oidc_connect_clock_skew_seconds` | setting key | [328](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:328>) |
| `oidc_connect_require_email_verified` | setting key | [329](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:329>) |
| `oidc_connect_userinfo_email_path` | setting key | [330](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:330>) |
| `oidc_connect_userinfo_id_path` | setting key | [331](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:331>) |
| `oidc_connect_userinfo_username_path` | setting key | [332](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:332>) |
| `github_oauth_enabled` | setting key | [335](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:335>) |
| `github_oauth_client_id` | setting key | [336](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:336>) |
| `github_oauth_client_secret` | setting key | [337](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:337>) |
| `github_oauth_redirect_url` | setting key | [338](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:338>) |
| `github_oauth_frontend_redirect_url` | setting key | [339](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:339>) |
| `google_oauth_enabled` | setting key | [340](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:340>) |
| `google_oauth_client_id` | setting key | [341](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:341>) |
| `google_oauth_client_secret` | setting key | [342](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:342>) |
| `google_oauth_redirect_url` | setting key | [343](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:343>) |
| `google_oauth_frontend_redirect_url` | setting key | [344](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:344>) |
| `site_name` | setting key | [347](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:347>) |
| `site_logo` | setting key | [348](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:348>) |
| `site_subtitle` | setting key | [349](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:349>) |
| `api_base_url` | setting key | [350](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:350>) |
| `contact_info` | setting key | [351](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:351>) |
| `doc_url` | setting key | [352](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:352>) |
| `home_content` | setting key | [353](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:353>) |
| `compact_home_enabled` | setting key | [354](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:354>) |
| `hide_ccs_import_button` | setting key | [355](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:355>) |
| `purchase_subscription_enabled` | setting key | [356](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:356>) |
| `purchase_subscription_url` | setting key | [357](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:357>) |
| `table_default_page_size` | setting key | [358](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:358>) |
| `table_page_size_options` | setting key | [359](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:359>) |
| `custom_menu_items` | setting key | [360](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:360>) |
| `custom_endpoints` | setting key | [361](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:361>) |
| `default_concurrency` | setting key | [364](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:364>) |
| `default_balance` | setting key | [365](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:365>) |
| `default_subscriptions` | setting key | [366](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:366>) |
| `default_user_rpm_limit` | setting key | [367](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:367>) |
| `auth_source_default_email_balance` | setting key | [370](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:370>) |
| `auth_source_default_email_concurrency` | setting key | [371](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:371>) |
| `auth_source_default_email_subscriptions` | setting key | [372](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:372>) |
| `auth_source_default_email_grant_on_signup` | setting key | [373](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:373>) |
| `auth_source_default_email_grant_on_first_bind` | setting key | [374](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:374>) |
| `auth_source_default_linuxdo_balance` | setting key | [375](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:375>) |
| `auth_source_default_linuxdo_concurrency` | setting key | [376](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:376>) |
| `auth_source_default_linuxdo_subscriptions` | setting key | [377](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:377>) |
| `auth_source_default_linuxdo_grant_on_signup` | setting key | [378](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:378>) |
| `auth_source_default_linuxdo_grant_on_first_bind` | setting key | [379](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:379>) |
| `auth_source_default_oidc_balance` | setting key | [380](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:380>) |
| `auth_source_default_oidc_concurrency` | setting key | [381](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:381>) |
| `auth_source_default_oidc_subscriptions` | setting key | [382](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:382>) |
| `auth_source_default_oidc_grant_on_signup` | setting key | [383](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:383>) |
| `auth_source_default_oidc_grant_on_first_bind` | setting key | [384](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:384>) |
| `auth_source_default_wechat_balance` | setting key | [385](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:385>) |
| `auth_source_default_wechat_concurrency` | setting key | [386](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:386>) |
| `auth_source_default_wechat_subscriptions` | setting key | [387](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:387>) |
| `auth_source_default_wechat_grant_on_signup` | setting key | [388](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:388>) |
| `auth_source_default_wechat_grant_on_first_bind` | setting key | [389](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:389>) |
| `auth_source_default_github_balance` | setting key | [390](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:390>) |
| `auth_source_default_github_concurrency` | setting key | [391](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:391>) |
| `auth_source_default_github_subscriptions` | setting key | [392](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:392>) |
| `auth_source_default_github_grant_on_signup` | setting key | [393](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:393>) |
| `auth_source_default_github_grant_on_first_bind` | setting key | [394](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:394>) |
| `auth_source_default_google_balance` | setting key | [395](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:395>) |
| `auth_source_default_google_concurrency` | setting key | [396](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:396>) |
| `auth_source_default_google_subscriptions` | setting key | [397](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:397>) |
| `auth_source_default_google_grant_on_signup` | setting key | [398](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:398>) |
| `auth_source_default_google_grant_on_first_bind` | setting key | [399](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:399>) |
| `auth_source_default_dingtalk_balance` | setting key | [400](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:400>) |
| `auth_source_default_dingtalk_concurrency` | setting key | [401](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:401>) |
| `auth_source_default_dingtalk_subscriptions` | setting key | [402](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:402>) |
| `auth_source_default_dingtalk_grant_on_signup` | setting key | [403](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:403>) |
| `auth_source_default_dingtalk_grant_on_first_bind` | setting key | [404](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:404>) |
| `force_email_on_third_party_signup` | setting key | [405](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:405>) |
| `admin_api_key` | setting key | [408](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:408>) |
| `gemini_quota_policy` | setting key | [411](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:411>) |
| `enable_model_fallback` | setting key | [414](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:414>) |
| `fallback_model_anthropic` | setting key | [415](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:415>) |
| `fallback_model_openai` | setting key | [416](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:416>) |
| `fallback_model_gemini` | setting key | [417](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:417>) |
| `fallback_model_antigravity` | setting key | [418](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:418>) |
| `enable_identity_patch` | setting key | [421](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:421>) |
| `identity_patch_prompt` | setting key | [422](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:422>) |
| `ops_monitoring_enabled` | setting key | [429](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:429>) |
| `ops_realtime_monitoring_enabled` | setting key | [432](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:432>) |
| `ops_query_mode_default` | setting key | [435](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:435>) |
| `ops_email_notification_config` | setting key | [438](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:438>) |
| `ops_alert_runtime_settings` | setting key | [441](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:441>) |
| `ops_metrics_interval_seconds` | setting key | [444](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:444>) |
| `ops_advanced_settings` | setting key | [447](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:447>) |
| `ops_runtime_log_config` | setting key | [450](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:450>) |
| `channel_monitor_enabled` | setting key | [458](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:458>) |
| `channel_monitor_mode` | setting key | [462](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:462>) |
| `channel_monitor_default_interval_seconds` | setting key | [470](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:470>) |
| `channel_monitor_hide_throughput` | setting key | [476](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:476>) |
| `channel_monitor_show_quota` | setting key | [483](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:483>) |
| `grok_default_text_model` | setting key | [487](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:487>) |
| `grok_cross_client_model_map_enabled` | setting key | [492](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:492>) |
| `grok_default_base_url_mode` | setting key | [496](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:496>) |
| `available_channels_enabled` | setting key | [501](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:501>) |
| `model_plaza_enabled` | setting key | [506](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:506>) |
| `model_plaza_require_auth` | setting key | [511](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:511>) |
| `model_plaza_description` | setting key | [515](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:515>) |
| `plugin_management_enabled` | setting key | [519](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:519>) |
| `balance_preauthorization_enabled` | setting key | [523](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:523>) |
| `upstream_billing_probe_settings` | setting key | [527](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:527>) |
| `ollama_cloud_usage_settings` | setting key | [530](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:530>) |
| `overload_cooldown_settings` | setting key | [537](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:537>) |
| `rate_limit_429_cooldown_settings` | setting key | [540](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:540>) |
| `openai_apikey_health_breaker_settings` | setting key | [542](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:542>) |
| `stream_timeout_settings` | setting key | [549](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:549>) |
| `rectifier_settings` | setting key | [556](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:556>) |
| `beta_policy_settings` | setting key | [563](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:563>) |
| `openai_fast_policy_settings` | setting key | [569](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:569>) |
| `min_claude_code_version` | setting key | [576](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:576>) |
| `min_codex_version` | setting key | [578](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:578>) |
| `max_codex_version` | setting key | [580](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:580>) |
| `codex_cli_only_blacklist` | setting key | [582](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:582>) |
| `codex_cli_only_whitelist` | setting key | [584](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:584>) |
| `codex_cli_only_allow_app_server_clients` | setting key | [586](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:586>) |
| `codex_cli_only_allow_body_engine_fingerprint` | setting key | [588](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:588>) |
| `codex_cli_only_engine_fingerprint_signals` | setting key | [591](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:591>) |
| `max_claude_code_version` | setting key | [594](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:594>) |
| `allow_ungrouped_key_scheduling` | setting key | [597](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:597>) |
| `openai_low_upstream_rate_priority_enabled` | setting key | [599](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:599>) |
| `openai_oauth_scheduling_rate_multiplier` | setting key | [601](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:601>) |
| `openai_advanced_scheduler_sticky_weighted_enabled` | setting key | [603](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:603>) |
| `openai_advanced_scheduler_subscription_priority_enabled` | setting key | [605](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:605>) |
| `openai_advanced_scheduler_lb_top_k` | setting key | [606](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:606>) |
| `openai_advanced_scheduler_weight_priority` | setting key | [607](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:607>) |
| `openai_advanced_scheduler_weight_load` | setting key | [608](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:608>) |
| `openai_advanced_scheduler_weight_queue` | setting key | [609](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:609>) |
| `openai_advanced_scheduler_weight_error_rate` | setting key | [610](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:610>) |
| `openai_advanced_scheduler_weight_ttft` | setting key | [611](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:611>) |
| `openai_advanced_scheduler_weight_reset` | setting key | [612](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:612>) |
| `openai_advanced_scheduler_weight_quota_headroom` | setting key | [613](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:613>) |
| `openai_advanced_scheduler_weight_upstream_cost` | setting key | [614](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:614>) |
| `openai_advanced_scheduler_weight_previous_response` | setting key | [615](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:615>) |
| `openai_advanced_scheduler_weight_session_sticky` | setting key | [616](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:616>) |
| `backend_mode_enabled` | setting key | [619](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:619>) |
| `enable_fingerprint_unification` | setting key | [623](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:623>) |
| `enable_metadata_passthrough` | setting key | [625](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:625>) |
| `enable_cch_signing` | setting key | [629](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:629>) |
| `enable_claude_oauth_system_prompt_injection` | setting key | [631](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:631>) |
| `claude_oauth_system_prompt` | setting key | [633](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:633>) |
| `claude_oauth_system_prompt_blocks` | setting key | [635](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:635>) |
| `enable_anthropic_cache_ttl_1h_injection` | setting key | [637](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:637>) |
| `enable_client_dateline_normalization` | setting key | [644](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:644>) |
| `rewrite_message_cache_control` | setting key | [646](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:646>) |
| `antigravity_user_agent_version` | setting key | [648](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:648>) |
| `openai_codex_user_agent` | setting key | [651](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:651>) |
| `openai_codex_client_version` | setting key | [654](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:654>) |
| `openai_codex_client_version_synced` | setting key | [658](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:658>) |
| `openai_codex_version_auto_sync_enabled` | setting key | [660](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:660>) |
| `openai_allow_claude_code_codex_plugin` | setting key | [663](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:663>) |
| `balance_low_notify_enabled` | setting key | [666](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:666>) |
| `balance_low_notify_threshold` | setting key | [667](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:667>) |
| `balance_low_notify_recharge_url` | setting key | [668](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:668>) |
| `subscription_expiry_notify_enabled` | setting key | [671](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:671>) |
| `account_quota_notify_enabled` | setting key | [674](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:674>) |
| `account_quota_notify_emails` | setting key | [675](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:675>) |
| `web_search_emulation_config` | setting key | [678](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/domain_constants.go:678>) |

### backend/internal/handler/dto/settings.go

| Declared key/field | Kind | Evidence |
| --- | --- | --- |
| `id` | DTO field | [12](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:12>) |
| `label` | DTO field | [13](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:13>) |
| `icon_svg` | DTO field | [14](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:14>) |
| `url` | DTO field | [15](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:15>) |
| `page_slug` | DTO field | [16](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:16>) |
| `visibility` | DTO field | [17](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:17>) |
| `sort_order` | DTO field | [18](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:18>) |
| `name` | DTO field | [23](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:23>) |
| `endpoint` | DTO field | [24](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:24>) |
| `description` | DTO field | [25](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:25>) |
| `registration_enabled` | DTO field | [30](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:30>) |
| `email_verify_enabled` | DTO field | [31](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:31>) |
| `registration_email_suffix_whitelist` | DTO field | [32](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:32>) |
| `registration_email_domain_quota_enabled` | DTO field | [33](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:33>) |
| `promo_code_enabled` | DTO field | [34](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:34>) |
| `password_reset_enabled` | DTO field | [35](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:35>) |
| `frontend_url` | DTO field | [36](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:36>) |
| `invitation_code_enabled` | DTO field | [37](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:37>) |
| `totp_enabled` | DTO field | [38](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:38>) |
| `totp_encryption_key_configured` | DTO field | [39](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:39>) |
| `passkey_enabled` | DTO field | [40](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:40>) |
| `passkey_configured` | DTO field | [41](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:41>) |
| `passkey_rp_id` | DTO field | [42](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:42>) |
| `passkey_rp_origins` | DTO field | [43](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:43>) |
| `session_binding_enabled` | DTO field | [44](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:44>) |
| `step_up_enabled` | DTO field | [45](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:45>) |
| `audit_log_retention_days` | DTO field | [46](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:46>) |
| `login_agreement_enabled` | DTO field | [47](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:47>) |
| `login_agreement_mode` | DTO field | [48](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:48>) |
| `login_agreement_updated_at` | DTO field | [49](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:49>) |
| `login_agreement_documents` | DTO field | [50](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:50>) |
| `smtp_host` | DTO field | [52](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:52>) |
| `smtp_port` | DTO field | [53](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:53>) |
| `smtp_username` | DTO field | [54](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:54>) |
| `smtp_password_configured` | DTO field | [55](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:55>) |
| `smtp_from_email` | DTO field | [56](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:56>) |
| `smtp_from_name` | DTO field | [57](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:57>) |
| `smtp_use_tls` | DTO field | [58](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:58>) |
| `turnstile_enabled` | DTO field | [60](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:60>) |
| `turnstile_site_key` | DTO field | [61](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:61>) |
| `turnstile_secret_key_configured` | DTO field | [62](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:62>) |
| `tencent_captcha_enabled` | DTO field | [63](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:63>) |
| `tencent_captcha_app_id` | DTO field | [64](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:64>) |
| `tencent_captcha_app_secret_key_configured` | DTO field | [65](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:65>) |
| `tencent_captcha_cloud_secret_id_configured` | DTO field | [66](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:66>) |
| `tencent_captcha_cloud_secret_key_configured` | DTO field | [67](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:67>) |
| `tencent_captcha_region` | DTO field | [68](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:68>) |
| `aliyun_captcha_enabled` | DTO field | [69](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:69>) |
| `aliyun_captcha_access_key_id` | DTO field | [70](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:70>) |
| `aliyun_captcha_access_key_secret_configured` | DTO field | [71](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:71>) |
| `aliyun_captcha_scene_id` | DTO field | [72](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:72>) |
| `aliyun_captcha_prefix` | DTO field | [73](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:73>) |
| `aliyun_captcha_region` | DTO field | [74](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:74>) |
| `api_key_acl_trust_forwarded_ip` | DTO field | [75](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:75>) |
| `forwarded_client_ip_headers` | DTO field | [76](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:76>) |
| `linuxdo_connect_enabled` | DTO field | [78](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:78>) |
| `linuxdo_connect_client_id` | DTO field | [79](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:79>) |
| `linuxdo_connect_client_secret_configured` | DTO field | [80](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:80>) |
| `linuxdo_connect_redirect_url` | DTO field | [81](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:81>) |
| `dingtalk_connect_enabled` | DTO field | [83](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:83>) |
| `dingtalk_connect_client_id` | DTO field | [84](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:84>) |
| `dingtalk_connect_client_secret_configured` | DTO field | [85](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:85>) |
| `dingtalk_connect_redirect_url` | DTO field | [86](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:86>) |
| `dingtalk_connect_corp_restriction_policy` | DTO field | [87](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:87>) |
| `dingtalk_connect_internal_corp_id` | DTO field | [88](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:88>) |
| `dingtalk_connect_bypass_registration` | DTO field | [89](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:89>) |
| `dingtalk_connect_sync_corp_email` | DTO field | [90](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:90>) |
| `dingtalk_connect_sync_display_name` | DTO field | [91](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:91>) |
| `dingtalk_connect_sync_dept` | DTO field | [92](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:92>) |
| `dingtalk_connect_sync_corp_email_attr_key` | DTO field | [93](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:93>) |
| `dingtalk_connect_sync_display_name_attr_key` | DTO field | [94](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:94>) |
| `dingtalk_connect_sync_dept_attr_key` | DTO field | [95](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:95>) |
| `dingtalk_connect_sync_corp_email_attr_name` | DTO field | [96](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:96>) |
| `dingtalk_connect_sync_display_name_attr_name` | DTO field | [97](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:97>) |
| `dingtalk_connect_sync_dept_attr_name` | DTO field | [98](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:98>) |
| `wechat_connect_enabled` | DTO field | [100](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:100>) |
| `wechat_connect_app_id` | DTO field | [101](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:101>) |
| `wechat_connect_app_secret_configured` | DTO field | [102](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:102>) |
| `wechat_connect_open_app_id` | DTO field | [103](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:103>) |
| `wechat_connect_open_app_secret_configured` | DTO field | [104](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:104>) |
| `wechat_connect_mp_app_id` | DTO field | [105](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:105>) |
| `wechat_connect_mp_app_secret_configured` | DTO field | [106](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:106>) |
| `wechat_connect_mobile_app_id` | DTO field | [107](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:107>) |
| `wechat_connect_mobile_app_secret_configured` | DTO field | [108](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:108>) |
| `wechat_connect_open_enabled` | DTO field | [109](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:109>) |
| `wechat_connect_mp_enabled` | DTO field | [110](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:110>) |
| `wechat_connect_mobile_enabled` | DTO field | [111](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:111>) |
| `wechat_connect_mode` | DTO field | [112](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:112>) |
| `wechat_connect_scopes` | DTO field | [113](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:113>) |
| `wechat_connect_redirect_url` | DTO field | [114](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:114>) |
| `wechat_connect_frontend_redirect_url` | DTO field | [115](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:115>) |
| `oidc_connect_enabled` | DTO field | [117](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:117>) |
| `oidc_connect_provider_name` | DTO field | [118](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:118>) |
| `oidc_connect_client_id` | DTO field | [119](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:119>) |
| `oidc_connect_client_secret_configured` | DTO field | [120](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:120>) |
| `oidc_connect_issuer_url` | DTO field | [121](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:121>) |
| `oidc_connect_discovery_url` | DTO field | [122](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:122>) |
| `oidc_connect_authorize_url` | DTO field | [123](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:123>) |
| `oidc_connect_token_url` | DTO field | [124](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:124>) |
| `oidc_connect_userinfo_url` | DTO field | [125](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:125>) |
| `oidc_connect_jwks_url` | DTO field | [126](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:126>) |
| `oidc_connect_scopes` | DTO field | [127](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:127>) |
| `oidc_connect_redirect_url` | DTO field | [128](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:128>) |
| `oidc_connect_frontend_redirect_url` | DTO field | [129](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:129>) |
| `oidc_connect_token_auth_method` | DTO field | [130](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:130>) |
| `oidc_connect_use_pkce` | DTO field | [131](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:131>) |
| `oidc_connect_validate_id_token` | DTO field | [132](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:132>) |
| `oidc_connect_allowed_signing_algs` | DTO field | [133](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:133>) |
| `oidc_connect_clock_skew_seconds` | DTO field | [134](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:134>) |
| `oidc_connect_require_email_verified` | DTO field | [135](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:135>) |
| `oidc_connect_userinfo_email_path` | DTO field | [136](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:136>) |
| `oidc_connect_userinfo_id_path` | DTO field | [137](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:137>) |
| `oidc_connect_userinfo_username_path` | DTO field | [138](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:138>) |
| `github_oauth_enabled` | DTO field | [140](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:140>) |
| `github_oauth_client_id` | DTO field | [141](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:141>) |
| `github_oauth_client_secret_configured` | DTO field | [142](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:142>) |
| `github_oauth_redirect_url` | DTO field | [143](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:143>) |
| `github_oauth_frontend_redirect_url` | DTO field | [144](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:144>) |
| `google_oauth_enabled` | DTO field | [145](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:145>) |
| `google_oauth_client_id` | DTO field | [146](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:146>) |
| `google_oauth_client_secret_configured` | DTO field | [147](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:147>) |
| `google_oauth_redirect_url` | DTO field | [148](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:148>) |
| `google_oauth_frontend_redirect_url` | DTO field | [149](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:149>) |
| `site_name` | DTO field | [151](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:151>) |
| `site_logo` | DTO field | [152](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:152>) |
| `site_subtitle` | DTO field | [153](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:153>) |
| `api_base_url` | DTO field | [154](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:154>) |
| `contact_info` | DTO field | [155](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:155>) |
| `doc_url` | DTO field | [156](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:156>) |
| `home_content` | DTO field | [157](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:157>) |
| `compact_home_enabled` | DTO field | [158](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:158>) |
| `hide_ccs_import_button` | DTO field | [159](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:159>) |
| `purchase_subscription_enabled` | DTO field | [160](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:160>) |
| `purchase_subscription_url` | DTO field | [161](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:161>) |
| `table_default_page_size` | DTO field | [162](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:162>) |
| `table_page_size_options` | DTO field | [163](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:163>) |
| `custom_menu_items` | DTO field | [164](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:164>) |
| `custom_endpoints` | DTO field | [165](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:165>) |
| `default_concurrency` | DTO field | [167](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:167>) |
| `default_balance` | DTO field | [168](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:168>) |
| `affiliate_rebate_rate` | DTO field | [169](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:169>) |
| `affiliate_rebate_freeze_hours` | DTO field | [170](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:170>) |
| `affiliate_rebate_duration_days` | DTO field | [171](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:171>) |
| `affiliate_rebate_per_invitee_cap` | DTO field | [172](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:172>) |
| `affiliate_admin_recharge_enabled` | DTO field | [173](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:173>) |
| `default_user_rpm_limit` | DTO field | [174](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:174>) |
| `default_subscriptions` | DTO field | [175](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:175>) |
| `enable_model_fallback` | DTO field | [178](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:178>) |
| `fallback_model_anthropic` | DTO field | [179](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:179>) |
| `fallback_model_openai` | DTO field | [180](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:180>) |
| `fallback_model_gemini` | DTO field | [181](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:181>) |
| `fallback_model_antigravity` | DTO field | [182](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:182>) |
| `enable_identity_patch` | DTO field | [185](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:185>) |
| `identity_patch_prompt` | DTO field | [186](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:186>) |
| `ops_monitoring_enabled` | DTO field | [189](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:189>) |
| `ops_realtime_monitoring_enabled` | DTO field | [190](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:190>) |
| `ops_query_mode_default` | DTO field | [191](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:191>) |
| `ops_metrics_interval_seconds` | DTO field | [192](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:192>) |
| `min_claude_code_version` | DTO field | [194](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:194>) |
| `max_claude_code_version` | DTO field | [195](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:195>) |
| `allow_ungrouped_key_scheduling` | DTO field | [198](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:198>) |
| `backend_mode_enabled` | DTO field | [201](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:201>) |
| `enable_fingerprint_unification` | DTO field | [204](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:204>) |
| `enable_metadata_passthrough` | DTO field | [205](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:205>) |
| `enable_cch_signing` | DTO field | [206](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:206>) |
| `enable_claude_oauth_system_prompt_injection` | DTO field | [207](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:207>) |
| `claude_oauth_system_prompt` | DTO field | [208](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:208>) |
| `claude_oauth_system_prompt_blocks` | DTO field | [209](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:209>) |
| `enable_anthropic_cache_ttl_1h_injection` | DTO field | [210](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:210>) |
| `rewrite_message_cache_control` | DTO field | [211](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:211>) |
| `enable_client_dateline_normalization` | DTO field | [212](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:212>) |
| `antigravity_user_agent_version` | DTO field | [213](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:213>) |
| `openai_codex_user_agent` | DTO field | [214](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:214>) |
| `openai_codex_client_version` | DTO field | [215](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:215>) |
| `openai_codex_client_version_synced` | DTO field | [216](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:216>) |
| `openai_codex_version_auto_sync_enabled` | DTO field | [217](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:217>) |
| `min_codex_version` | DTO field | [220](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:220>) |
| `max_codex_version` | DTO field | [221](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:221>) |
| `codex_cli_only_blacklist` | DTO field | [222](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:222>) |
| `codex_cli_only_whitelist` | DTO field | [223](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:223>) |
| `codex_cli_only_allow_app_server_clients` | DTO field | [224](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:224>) |
| `codex_cli_only_engine_fingerprint_signals` | DTO field | [225](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:225>) |
| `web_search_emulation_enabled` | DTO field | [228](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:228>) |
| `payment_visible_method_alipay_source` | DTO field | [231](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:231>) |
| `payment_visible_method_wxpay_source` | DTO field | [232](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:232>) |
| `payment_visible_method_alipay_enabled` | DTO field | [233](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:233>) |
| `payment_visible_method_wxpay_enabled` | DTO field | [234](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:234>) |
| `openai_low_upstream_rate_priority_enabled` | DTO field | [237](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:237>) |
| `openai_oauth_scheduling_rate_multiplier` | DTO field | [238](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:238>) |
| `openai_advanced_scheduler_enabled` | DTO field | [239](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:239>) |
| `openai_advanced_scheduler_sticky_weighted_enabled` | DTO field | [240](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:240>) |
| `openai_advanced_scheduler_subscription_priority_enabled` | DTO field | [241](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:241>) |
| `openai_advanced_scheduler_lb_top_k` | DTO field | [242](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:242>) |
| `openai_advanced_scheduler_weight_priority` | DTO field | [243](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:243>) |
| `openai_advanced_scheduler_weight_load` | DTO field | [244](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:244>) |
| `openai_advanced_scheduler_weight_queue` | DTO field | [245](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:245>) |
| `openai_advanced_scheduler_weight_error_rate` | DTO field | [246](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:246>) |
| `openai_advanced_scheduler_weight_ttft` | DTO field | [247](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:247>) |
| `openai_advanced_scheduler_weight_reset` | DTO field | [248](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:248>) |
| `openai_advanced_scheduler_weight_quota_headroom` | DTO field | [249](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:249>) |
| `openai_advanced_scheduler_weight_upstream_cost` | DTO field | [250](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:250>) |
| `openai_advanced_scheduler_weight_previous_response` | DTO field | [251](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:251>) |
| `openai_advanced_scheduler_weight_session_sticky` | DTO field | [252](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:252>) |
| `openai_advanced_scheduler_effective_lb_top_k` | DTO field | [253](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:253>) |
| `openai_advanced_scheduler_effective_weight_priority` | DTO field | [254](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:254>) |
| `openai_advanced_scheduler_effective_weight_load` | DTO field | [255](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:255>) |
| `openai_advanced_scheduler_effective_weight_queue` | DTO field | [256](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:256>) |
| `openai_advanced_scheduler_effective_weight_error_rate` | DTO field | [257](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:257>) |
| `openai_advanced_scheduler_effective_weight_ttft` | DTO field | [258](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:258>) |
| `openai_advanced_scheduler_effective_weight_reset` | DTO field | [259](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:259>) |
| `openai_advanced_scheduler_effective_weight_quota_headroom` | DTO field | [260](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:260>) |
| `openai_advanced_scheduler_effective_weight_upstream_cost` | DTO field | [261](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:261>) |
| `openai_advanced_scheduler_effective_weight_previous_response` | DTO field | [262](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:262>) |
| `openai_advanced_scheduler_effective_weight_session_sticky` | DTO field | [263](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:263>) |
| `payment_enabled` | DTO field | [266](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:266>) |
| `payment_min_amount` | DTO field | [267](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:267>) |
| `payment_max_amount` | DTO field | [268](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:268>) |
| `payment_daily_limit` | DTO field | [269](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:269>) |
| `payment_order_timeout_minutes` | DTO field | [270](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:270>) |
| `payment_max_pending_orders` | DTO field | [271](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:271>) |
| `payment_enabled_types` | DTO field | [272](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:272>) |
| `payment_balance_disabled` | DTO field | [273](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:273>) |
| `payment_balance_recharge_multiplier` | DTO field | [274](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:274>) |
| `payment_subscription_usd_to_cny_rate` | DTO field | [275](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:275>) |
| `payment_recharge_fee_rate` | DTO field | [276](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:276>) |
| `payment_load_balance_strategy` | DTO field | [277](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:277>) |
| `payment_product_name_prefix` | DTO field | [278](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:278>) |
| `payment_product_name_suffix` | DTO field | [279](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:279>) |
| `payment_help_image_url` | DTO field | [280](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:280>) |
| `payment_help_text` | DTO field | [281](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:281>) |
| `payment_cancel_rate_limit_enabled` | DTO field | [284](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:284>) |
| `payment_cancel_rate_limit_max` | DTO field | [285](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:285>) |
| `payment_cancel_rate_limit_window` | DTO field | [286](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:286>) |
| `payment_cancel_rate_limit_unit` | DTO field | [287](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:287>) |
| `payment_cancel_rate_limit_window_mode` | DTO field | [288](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:288>) |
| `payment_alipay_force_qrcode` | DTO field | [291](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:291>) |
| `payment_alipay_mobile_precreate_deep_link` | DTO field | [293](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:293>) |
| `balance_low_notify_enabled` | DTO field | [296](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:296>) |
| `balance_low_notify_threshold` | DTO field | [297](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:297>) |
| `balance_low_notify_recharge_url` | DTO field | [298](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:298>) |
| `subscription_expiry_notify_enabled` | DTO field | [299](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:299>) |
| `account_quota_notify_enabled` | DTO field | [300](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:300>) |
| `account_quota_notify_emails` | DTO field | [301](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:301>) |
| `channel_monitor_enabled` | DTO field | [304](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:304>) |
| `channel_monitor_mode` | DTO field | [305](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:305>) |
| `channel_monitor_default_interval_seconds` | DTO field | [306](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:306>) |
| `channel_monitor_hide_throughput` | DTO field | [307](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:307>) |
| `channel_monitor_show_quota` | DTO field | [308](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:308>) |
| `grok_default_text_model` | DTO field | [311](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:311>) |
| `grok_cross_client_model_map_enabled` | DTO field | [312](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:312>) |
| `grok_default_base_url_mode` | DTO field | [313](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:313>) |
| `available_channels_enabled` | DTO field | [316](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:316>) |
| `balance_preauthorization_enabled` | DTO field | [318](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:318>) |
| `model_plaza_enabled` | DTO field | [321](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:321>) |
| `model_plaza_require_auth` | DTO field | [322](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:322>) |
| `model_plaza_description` | DTO field | [323](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:323>) |
| `plugin_management_enabled` | DTO field | [324](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:324>) |
| `risk_control_enabled` | DTO field | [327](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:327>) |
| `cyber_session_block_enabled` | DTO field | [330](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:330>) |
| `cyber_session_block_ttl_seconds` | DTO field | [331](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:331>) |
| `affiliate_enabled` | DTO field | [334](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:334>) |
| `openai_fast_policy_settings` | DTO field | [337](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:337>) |
| `default_platform_quotas` | DTO field | [340](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:340>) |
| `account_scheduling_thresholds` | DTO field | [343](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:343>) |
| `allow_user_view_error_requests` | DTO field | [346](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:346>) |
| `plan_id` | DTO field | [350](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:350>) |
| `registration_enabled` | DTO field | [354](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:354>) |
| `email_verify_enabled` | DTO field | [355](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:355>) |
| `force_email_on_third_party_signup` | DTO field | [356](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:356>) |
| `registration_email_suffix_whitelist` | DTO field | [357](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:357>) |
| `registration_email_domain_quota_enabled` | DTO field | [358](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:358>) |
| `promo_code_enabled` | DTO field | [359](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:359>) |
| `password_reset_enabled` | DTO field | [360](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:360>) |
| `invitation_code_enabled` | DTO field | [361](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:361>) |
| `totp_enabled` | DTO field | [362](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:362>) |
| `passkey_enabled` | DTO field | [363](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:363>) |
| `login_agreement_enabled` | DTO field | [364](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:364>) |
| `login_agreement_mode` | DTO field | [365](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:365>) |
| `login_agreement_updated_at` | DTO field | [366](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:366>) |
| `login_agreement_revision` | DTO field | [367](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:367>) |
| `login_agreement_documents` | DTO field | [368](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:368>) |
| `turnstile_enabled` | DTO field | [369](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:369>) |
| `turnstile_site_key` | DTO field | [370](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:370>) |
| `tencent_captcha_enabled` | DTO field | [371](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:371>) |
| `tencent_captcha_app_id` | DTO field | [372](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:372>) |
| `tencent_captcha_region` | DTO field | [373](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:373>) |
| `aliyun_captcha_enabled` | DTO field | [374](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:374>) |
| `aliyun_captcha_scene_id` | DTO field | [375](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:375>) |
| `aliyun_captcha_prefix` | DTO field | [376](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:376>) |
| `aliyun_captcha_region` | DTO field | [377](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:377>) |
| `site_name` | DTO field | [378](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:378>) |
| `site_logo` | DTO field | [379](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:379>) |
| `site_subtitle` | DTO field | [380](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:380>) |
| `api_base_url` | DTO field | [381](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:381>) |
| `contact_info` | DTO field | [382](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:382>) |
| `doc_url` | DTO field | [383](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:383>) |
| `home_content` | DTO field | [384](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:384>) |
| `compact_home_enabled` | DTO field | [385](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:385>) |
| `hide_ccs_import_button` | DTO field | [386](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:386>) |
| `purchase_subscription_enabled` | DTO field | [387](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:387>) |
| `purchase_subscription_url` | DTO field | [388](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:388>) |
| `table_default_page_size` | DTO field | [389](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:389>) |
| `table_page_size_options` | DTO field | [390](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:390>) |
| `custom_menu_items` | DTO field | [391](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:391>) |
| `custom_endpoints` | DTO field | [392](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:392>) |
| `dingtalk_oauth_enabled` | DTO field | [393](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:393>) |
| `linuxdo_oauth_enabled` | DTO field | [394](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:394>) |
| `wechat_oauth_enabled` | DTO field | [395](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:395>) |
| `wechat_oauth_open_enabled` | DTO field | [396](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:396>) |
| `wechat_oauth_mp_enabled` | DTO field | [397](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:397>) |
| `wechat_oauth_mobile_enabled` | DTO field | [398](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:398>) |
| `oidc_oauth_enabled` | DTO field | [399](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:399>) |
| `oidc_oauth_provider_name` | DTO field | [400](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:400>) |
| `github_oauth_enabled` | DTO field | [401](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:401>) |
| `google_oauth_enabled` | DTO field | [402](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:402>) |
| `backend_mode_enabled` | DTO field | [403](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:403>) |
| `payment_enabled` | DTO field | [404](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:404>) |
| `version` | DTO field | [405](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:405>) |
| `server_timezone` | DTO field | [408](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:408>) |
| `server_utc_offset` | DTO field | [409](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:409>) |
| `balance_low_notify_enabled` | DTO field | [410](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:410>) |
| `account_quota_notify_enabled` | DTO field | [411](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:411>) |
| `balance_low_notify_threshold` | DTO field | [412](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:412>) |
| `balance_low_notify_recharge_url` | DTO field | [413](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:413>) |
| `channel_monitor_enabled` | DTO field | [415](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:415>) |
| `channel_monitor_mode` | DTO field | [416](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:416>) |
| `channel_monitor_default_interval_seconds` | DTO field | [417](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:417>) |
| `channel_monitor_hide_throughput` | DTO field | [418](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:418>) |
| `channel_monitor_show_quota` | DTO field | [419](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:419>) |
| `available_channels_enabled` | DTO field | [421](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:421>) |
| `model_plaza_enabled` | DTO field | [423](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:423>) |
| `model_plaza_require_auth` | DTO field | [424](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:424>) |
| `plugin_management_enabled` | DTO field | [425](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:425>) |
| `affiliate_enabled` | DTO field | [427](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:427>) |
| `risk_control_enabled` | DTO field | [429](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:429>) |
| `allow_user_view_error_requests` | DTO field | [431](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:431>) |
| `id` | DTO field | [435](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:435>) |
| `title` | DTO field | [436](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:436>) |
| `content_md` | DTO field | [437](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:437>) |
| `enabled` | DTO field | [442](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:442>) |
| `cooldown_minutes` | DTO field | [443](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:443>) |
| `enabled` | DTO field | [448](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:448>) |
| `cooldown_seconds` | DTO field | [449](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:449>) |
| `enabled` | DTO field | [454](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:454>) |
| `user_rpm` | DTO field | [455](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:455>) |
| `heavy_rpm` | DTO field | [456](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:456>) |
| `exempt_admin` | DTO field | [457](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:457>) |
| `public_ip_rpm` | DTO field | [458](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:458>) |
| `enabled` | DTO field | [463](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:463>) |
| `action` | DTO field | [464](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:464>) |
| `temp_unsched_minutes` | DTO field | [465](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:465>) |
| `threshold_count` | DTO field | [466](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:466>) |
| `threshold_window_minutes` | DTO field | [467](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:467>) |
| `enabled` | DTO field | [472](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:472>) |
| `thinking_signature_enabled` | DTO field | [473](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:473>) |
| `thinking_budget_enabled` | DTO field | [474](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:474>) |
| `apikey_signature_enabled` | DTO field | [475](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:475>) |
| `apikey_signature_patterns` | DTO field | [476](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:476>) |
| `beta_token` | DTO field | [481](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:481>) |
| `action` | DTO field | [482](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:482>) |
| `scope` | DTO field | [483](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:483>) |
| `error_message` | DTO field | [484](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:484>) |
| `model_whitelist` | DTO field | [485](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:485>) |
| `fallback_action` | DTO field | [486](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:486>) |
| `fallback_error_message` | DTO field | [487](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:487>) |
| `rules` | DTO field | [492](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:492>) |
| `service_tier` | DTO field | [497](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:497>) |
| `action` | DTO field | [498](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:498>) |
| `scope` | DTO field | [499](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:499>) |
| `user_ids` | DTO field | [500](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:500>) |
| `error_message` | DTO field | [501](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:501>) |
| `model_whitelist` | DTO field | [502](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:502>) |
| `fallback_action` | DTO field | [503](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:503>) |
| `fallback_error_message` | DTO field | [504](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:504>) |
| `rules` | DTO field | [509](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:509>) |
| `value` | DTO field | [514](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:514>) |
| `label` | DTO field | [515](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:515>) |
| `description` | DTO field | [516](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:516>) |
| `category` | DTO field | [517](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:517>) |
| `optional` | DTO field | [518](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:518>) |
| `event` | DTO field | [523](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:523>) |
| `locale` | DTO field | [524](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:524>) |
| `subject` | DTO field | [525](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:525>) |
| `is_custom` | DTO field | [526](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:526>) |
| `updated_at` | DTO field | [527](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:527>) |
| `events` | DTO field | [532](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:532>) |
| `locales` | DTO field | [533](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:533>) |
| `templates` | DTO field | [534](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:534>) |
| `placeholders` | DTO field | [535](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:535>) |
| `event` | DTO field | [540](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:540>) |
| `locale` | DTO field | [541](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:541>) |
| `subject` | DTO field | [542](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:542>) |
| `html` | DTO field | [543](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:543>) |
| `is_custom` | DTO field | [544](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:544>) |
| `updated_at` | DTO field | [545](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:545>) |
| `placeholders` | DTO field | [546](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:546>) |
| `subject` | DTO field | [551](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:551>) |
| `html` | DTO field | [552](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:552>) |
| `event` | DTO field | [557](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:557>) |
| `locale` | DTO field | [558](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:558>) |
| `subject` | DTO field | [559](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:559>) |
| `html` | DTO field | [560](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:560>) |
| `variables` | DTO field | [561](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:561>) |
| `subject` | DTO field | [566](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:566>) |
| `html` | DTO field | [567](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/handler/dto/settings.go:567>) |

## Subsystem-local setting constants

Literal setting-key declarations outside the central constants file are listed separately; settings assembled dynamically may not be captured by this lexical index.

| Symbol | Literal key | Evidence |
| --- | --- | --- |
| SettingKeyPromptAuditConfig | `prompt_audit_config` | [backend/internal/securityaudit/prompt_types.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/securityaudit/prompt_types.go:9>) |
| SettingKeyRiskControl | `risk_control_enabled` | [backend/internal/securityaudit/prompt_types.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/securityaudit/prompt_types.go:10>) |
| settingKeyAdminComplianceAcknowledgement | `admin_compliance_acknowledgement` | [backend/internal/service/admin_compliance.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/admin_compliance.go:25>) |
| settingKeyBackupS3Config | `backup_s3_config` | [backend/internal/service/backup_service.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/backup_service.go:29>) |
| settingKeyBackupSchedule | `backup_schedule` | [backend/internal/service/backup_service.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/backup_service.go:30>) |
| settingKeyBackupRecords | `backup_records` | [backend/internal/service/backup_service.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/backup_service.go:31>) |
| settingKeyImageStorageConfig | `image_storage_config` | [backend/internal/service/image_storage_settings.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/image_storage_settings.go:16>) |
| openAIAdvancedSchedulerSettingKey | `openai_advanced_scheduler_enabled` | [backend/internal/service/openai_account_scheduler.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/openai_account_scheduler.go:27>) |
| SettingKeyOpsMetricThresholds | `ops_metric_thresholds` | [backend/internal/service/ops_settings.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/ops_settings.go:524>) |
| upstreamStateSettingKey | `upstream_state_management` | [backend/internal/service/upstream_state.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/upstream_state.go:22>) |

## Direct environment reads

These literal `os.Getenv` / `os.LookupEnv` call sites supplement configuration binding (which can bind environment values without those calls). Repeated names reflect multiple consumers. Build/deploy shell variables are documented in their script entry points rather than claimed to be Go application settings.

| Variable name | Evidence |
| --- | --- |
| SERVER_SHUTDOWN_TIMEOUT_SECONDS | [backend/cmd/server/main.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/cmd/server/main.go:230>) |
| PPROF_ENABLED | [backend/cmd/server/pprof_server.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/cmd/server/pprof_server.go:24>) |
| PPROF_ADDR | [backend/cmd/server/pprof_server.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/cmd/server/pprof_server.go:28>) |
| PPROF_BLOCK_RATE | [backend/cmd/server/pprof_server.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/cmd/server/pprof_server.go:39>) |
| PPROF_MUTEX_FRACTION | [backend/cmd/server/pprof_server.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/cmd/server/pprof_server.go:40>) |
| WECHAT_OAUTH_OPEN_APP_ID | [backend/internal/config/config.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:528>) |
| WECHAT_OAUTH_OPEN_APP_SECRET | [backend/internal/config/config.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:537>) |
| WECHAT_OAUTH_MP_APP_ID | [backend/internal/config/config.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:546>) |
| WECHAT_OAUTH_MP_APP_SECRET | [backend/internal/config/config.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:555>) |
| WECHAT_OAUTH_FRONTEND_REDIRECT_URL | [backend/internal/config/config.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:562>) |
| TZ | [backend/internal/config/config.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1803>) |
| SERVER_TRUSTED_PROXIES | [backend/internal/config/config.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1820>) |
| SECURITY_FORWARDED_CLIENT_IP_HEADERS | [backend/internal/config/config.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1821>) |
| CONFIG_FILE | [backend/internal/config/config.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1986>) |
| DATA_DIR | [backend/internal/config/config.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/config/config.go:1992>) |
| DATA_DIR | [backend/internal/pkg/logger/options.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/pkg/logger/options.go:99>) |
| UPDATE_GITHUB_TOKEN | [backend/internal/repository/github_release_service.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/repository/github_release_service.go:68>) |
| YESCAPTCHA_CLIENT_KEY | [backend/internal/repository/grok_oauth_client.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/repository/grok_oauth_client.go:262>) |
| YESCAPTCHA_API_KEY | [backend/internal/repository/grok_oauth_client.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/repository/grok_oauth_client.go:264>) |
| TZ | [backend/internal/repository/usage_log_repo_stats.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/repository/usage_log_repo_stats.go:269>) |
| SUB2API_DEBUG_MODEL_ROUTING | [backend/internal/service/gateway_service.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/gateway_service.go:904>) |
| SUB2API_DEBUG_CLAUDE_MIMIC | [backend/internal/service/gateway_service.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/gateway_service.go:905>) |
| SUB2API_IMAGES_MAIN_MODEL | [backend/internal/service/openai_images.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/openai_images.go:51>) |
| DATA_DIR | [backend/internal/service/plugin_package.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/plugin_package.go:49>) |
| UPDATE_STRATEGY | [backend/internal/service/update_service.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/update_service.go:182>) |
| SUB2API_UPDATE_STATUS_DIR | [backend/internal/service/update_service.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/update_service.go:189>) |
| UPDATE_ORCHESTRATOR | [backend/internal/service/update_service.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/update_service.go:195>) |
| UPDATE_RUNTIME_BINARY_PATH | [backend/internal/service/update_service.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/update_service.go:196>) |
| CHANNEL_MONITOR_V2_DISABLE_AGGREGATOR | [backend/internal/service/wire.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/service/wire.go:1038>) |
| RUN_MODE | [backend/internal/setup/setup.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/setup/setup.go:36>) |
| DATA_DIR | [backend/internal/setup/setup.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/setup/setup.go:46>) |
| SKIP_SETUP | [backend/internal/setup/setup.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/setup/setup.go:152>) |
| AUTO_SETUP | [backend/internal/setup/setup.go](<C:/Users/jhupo-pc/Desktop/sub2api/sub2api/backend/internal/setup/setup.go:543>) |

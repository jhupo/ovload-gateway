//! OAuth quota snapshots. Reads use persisted observations; explicit refresh uses the account egress.
use super::super::{Credential, PublicApiProvider, network};
use chrono::{DateTime, Utc};
use ovload_admin::{
    model::provider_credentials::{
        ProviderQuota, ProviderQuotaRequest, ProviderQuotaWindow, ProviderQuotaWindowRole,
        QuotaLocalUsageAttribution,
    },
    ports::provider::{ProviderAdminError, ProviderAdminErrorKind},
};
use ovload_core::account::{OpaqueProviderData, QuotaObservation, QuotaWriteOutcome};
use serde_json::{Value, json};

fn fail(kind: ProviderAdminErrorKind) -> ProviderAdminError {
    ProviderAdminError::new(kind)
}
fn upstream() -> ProviderAdminError {
    fail(ProviderAdminErrorKind::BadGateway)
}

pub(super) fn project(
    kind: &str,
    value: &Value,
    observed: Option<DateTime<Utc>>,
) -> Result<ProviderQuota, ProviderAdminError> {
    let mut windows = Vec::new();
    if kind == "claude" {
        for (key, label, seconds, role) in [
            (
                "five_hour",
                "5 小时",
                18000,
                Some(ProviderQuotaWindowRole::Primary),
            ),
            (
                "seven_day",
                "7 天",
                604800,
                Some(ProviderQuotaWindowRole::Secondary),
            ),
            ("seven_day_sonnet", "Sonnet · 7 天", 604800, None),
            ("seven_day_opus", "Opus · 7 天", 604800, None),
            ("seven_day_oauth_apps", "OAuth · 7 天", 604800, None),
        ] {
            let Some(row) = value.get(key).filter(|row| row.is_object()) else {
                continue;
            };
            let used = row
                .get("utilization")
                .and_then(Value::as_f64)
                .filter(|v| v.is_finite() && *v >= 0.0);
            let reset = date(row.get("resets_at"));
            if used.is_none() && reset.is_none() {
                continue;
            }
            let mut window = window(key.to_owned(), label.to_owned(), used, reset);
            window.window_seconds = Some(seconds);
            window.role = role;
            if role.is_some() {
                window.local_usage_attribution = QuotaLocalUsageAttribution::AccountWide;
            }
            windows.push(window);
        }
        if windows.is_empty() {
            return Err(upstream());
        }
    } else if kind == "gemini" {
        project_gemini(value, &mut windows)?;
    } else {
        return Err(fail(ProviderAdminErrorKind::Unsupported));
    }
    Ok(ProviderQuota {
        plan_type: None,
        observed_at: observed,
        refresh_token_expires_at: None,
        limit_reached: windows.iter().any(|w| w.limit_reached),
        windows,
        credits: None,
        provider_data: None,
    })
}

fn project_gemini(
    value: &Value,
    windows: &mut Vec<ProviderQuotaWindow>,
) -> Result<(), ProviderAdminError> {
    // Antigravity returns quota windows grouped by product. Older Code Assist
    // responses expose the same buckets at the top level, so accept both
    // shapes while providers migrate between endpoint versions.
    if let Some(groups) = value.get("groups").and_then(Value::as_array) {
        if groups.len() > 256 {
            return Err(upstream());
        }
        for (group_index, group) in groups.iter().enumerate() {
            let group_name = group
                .get("id")
                .or_else(|| group.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("antigravity");
            let Some(buckets) = group.get("buckets").and_then(Value::as_array) else {
                continue;
            };
            if buckets.len() > 2048 {
                return Err(upstream());
            }
            for (bucket_index, bucket) in buckets.iter().enumerate() {
                push_gemini_bucket(
                    bucket,
                    format!("{group_name}:{group_index}:{bucket_index}"),
                    windows,
                );
            }
        }
    }

    if let Some(buckets) = value.get("buckets").and_then(Value::as_array) {
        if buckets.len() > 2048 {
            return Err(upstream());
        }
        for (index, bucket) in buckets.iter().enumerate() {
            push_gemini_bucket(bucket, format!("legacy:{index}"), windows);
        }
    }

    if windows.is_empty() {
        return Err(upstream());
    }
    Ok(())
}

fn push_gemini_bucket(
    bucket: &Value,
    fallback_key: String,
    windows: &mut Vec<ProviderQuotaWindow>,
) {
    let bucket_id = bucket
        .get("bucketId")
        .or_else(|| bucket.get("modelId"))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty() && s.len() <= 256);
    let Some(bucket_id) = bucket_id else {
        return;
    };
    let remaining = bucket
        .get("remainingFraction")
        .and_then(Value::as_f64)
        .filter(|v| v.is_finite() && (0.0..=1.0).contains(v));
    let used = bucket
        .get("utilization")
        .and_then(Value::as_f64)
        .filter(|v| v.is_finite() && *v >= 0.0)
        .or_else(|| {
            remaining.map(|v| {
                // Keep decimal percentages stable when the upstream fraction is
                // represented as a binary float (0.9 would otherwise render as
                // 9.999999999999998).
                ((1.0 - v) * 100.0 * 1_000_000.0).round() / 1_000_000.0
            })
        });
    let reset = date(bucket.get("resetTime").or_else(|| bucket.get("resetAt")));
    let (label, role, seconds) = match bucket_id {
        "gemini-5h" => (
            "Gemini · 5 小时".to_owned(),
            Some(ProviderQuotaWindowRole::Primary),
            Some(18_000),
        ),
        "gemini-weekly" => (
            "Gemini · 周".to_owned(),
            Some(ProviderQuotaWindowRole::Secondary),
            Some(604_800),
        ),
        "3p-5h" => ("第三方模型 · 5 小时".to_owned(), None, Some(18_000)),
        "3p-weekly" => ("第三方模型 · 周".to_owned(), None, Some(604_800)),
        _ => (bucket_id.to_owned(), None, None),
    };
    let mut row = window(fallback_key, label, used, reset);
    row.role = role;
    row.window_seconds = seconds;
    if role.is_some() {
        row.local_usage_attribution = QuotaLocalUsageAttribution::AccountWide;
    }
    windows.push(row);
}
fn date(value: Option<&Value>) -> Option<DateTime<Utc>> {
    value
        .and_then(Value::as_str)
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|t| t.with_timezone(&Utc))
}
fn window(
    key: String,
    label: String,
    used: Option<f64>,
    reset: Option<DateTime<Utc>>,
) -> ProviderQuotaWindow {
    ProviderQuotaWindow {
        key,
        group: "subscription".into(),
        label,
        limit_id: None,
        limit_name: None,
        role: None,
        local_usage_attribution: QuotaLocalUsageAttribution::Unavailable,
        window_seconds: None,
        used_percent: used,
        reset_at: reset,
        limit_reached: used.is_some_and(|v| v >= 100.0),
        local_usage: None,
        provider_data: None,
    }
}

impl PublicApiProvider {
    pub(in super::super) async fn native_quota(
        &self,
        request: ProviderQuotaRequest,
    ) -> Result<ProviderQuota, ProviderAdminError> {
        let mut account = self
            .account(&request.account_id)
            .await
            .map_err(|_| fail(ProviderAdminErrorKind::NotFound))?;
        if account.authentication_kind() != "oauth" {
            return Err(fail(ProviderAdminErrorKind::Unsupported));
        }
        if !request.refresh {
            let snapshots = self
                .ports
                .accounts()
                .get_quotas(std::slice::from_ref(account.id()))
                .await
                .map_err(|_| fail(ProviderAdminErrorKind::Unavailable))?;
            if let Some(snapshot) = snapshots.into_iter().find(|s| {
                s.account_id == *account.id() && s.expected_revision == account.revision()
            }) {
                let value = Value::Object(snapshot.quota.expose_to_provider().clone());
                if value.get("native_quota_version") == Some(&json!(1)) {
                    return project(
                        self.kind.as_str(),
                        &value["usage"],
                        Some(snapshot.observed_at.into()),
                    );
                }
            }
            return Ok(ProviderQuota {
                plan_type: None,
                observed_at: None,
                refresh_token_expires_at: None,
                windows: Vec::new(),
                credits: None,
                limit_reached: false,
                provider_data: None,
            });
        }
        let _slot = self
            .catalog_capacity
            .try_acquire()
            .map_err(|_| fail(ProviderAdminErrorKind::Unavailable))?;
        account = self
            .native_fresh_account(account)
            .await
            .map_err(|_| upstream())?;
        let loaded = self
            .ports
            .accounts()
            .load_credential(account.id(), account.revision())
            .await
            .map_err(|_| fail(ProviderAdminErrorKind::Unavailable))?;
        let credential =
            Credential::decode(loaded.credential.expose_to_provider()).map_err(|_| upstream())?;
        let document = if self.kind.as_str() == "claude" {
            let mut url = network::endpoint(&credential, "v1internal:retrieveUserQuota")
                .map_err(|_| upstream())?;
            url.set_path("/api/oauth/usage");
            let client = network::client(&account, &url)
                .await
                .map_err(|_| upstream())?;
            let mut headers =
                super::headers(self.kind.as_str(), &credential).map_err(|_| upstream())?;
            headers.insert(
                "accept",
                reqwest::header::HeaderValue::from_static("application/json"),
            );
            let response = tokio::time::timeout(
                std::time::Duration::from_secs(30),
                client.get(url).headers(headers).send(),
            )
            .await
            .map_err(|_| upstream())?
            .map_err(|_| upstream())?;
            if !response.status().is_success() {
                return Err(upstream());
            }
            let bytes = network::bounded_body(response, 2 * 1024 * 1024)
                .await
                .map_err(|_| upstream())?;
            serde_json::from_slice::<Value>(&bytes).map_err(|_| upstream())?
        } else {
            // Antigravity exposes account-wide windows through the summary
            // endpoint. Some deployments still expose the older project-scoped
            // endpoint, so retry it when the summary shape is unavailable.
            let project_id = credential
                .oauth
                .as_ref()
                .and_then(|tokens| tokens.project.as_deref());
            let candidates = [
                ("v1internal:retrieveUserQuotaSummary", json!({})),
                (
                    "v1internal:retrieveUserQuota",
                    json!({"project": project_id}),
                ),
            ];
            let mut selected = None;
            for (path, body) in candidates {
                let url = network::endpoint(&credential, path).map_err(|_| upstream())?;
                let client = network::client(&account, &url)
                    .await
                    .map_err(|_| upstream())?;
                let mut headers =
                    super::headers(self.kind.as_str(), &credential).map_err(|_| upstream())?;
                headers.insert(
                    "accept",
                    reqwest::header::HeaderValue::from_static("application/json"),
                );
                let response = match tokio::time::timeout(
                    std::time::Duration::from_secs(30),
                    client.post(url).headers(headers).json(&body).send(),
                )
                .await
                {
                    Ok(Ok(response)) => response,
                    _ => continue,
                };
                if !response.status().is_success() {
                    continue;
                }
                let bytes = match network::bounded_body(response, 2 * 1024 * 1024).await {
                    Ok(bytes) => bytes,
                    Err(_) => continue,
                };
                let value = match serde_json::from_slice::<Value>(&bytes) {
                    Ok(value) => value,
                    Err(_) => continue,
                };
                if project("gemini", &value, None).is_ok() {
                    selected = Some(value);
                    break;
                }
            }
            selected.ok_or_else(upstream)?
        };
        let current = self
            .account(account.id())
            .await
            .map_err(|_| fail(ProviderAdminErrorKind::NotFound))?;
        if current.revision() != account.revision()
            || network::egress_fingerprint(&current) != network::egress_fingerprint(&account)
        {
            return Err(fail(ProviderAdminErrorKind::Conflict));
        }
        let observed_at = std::time::SystemTime::now();
        let result = project(self.kind.as_str(), &document, Some(observed_at.into()))?;
        // A model-specific exhausted bucket must not freeze the entire account.
        let value = json!({"native_quota_version":1,"usage":document});
        let outcome = self
            .ports
            .accounts()
            .compare_and_swap_quota(QuotaObservation {
                account_id: account.id().clone(),
                expected_revision: account.revision(),
                quota: OpaqueProviderData::new(value.as_object().cloned().ok_or_else(upstream)?),
                plan_type: None,
                observed_at,
                state: account.quota(),
            })
            .await
            .map_err(|_| fail(ProviderAdminErrorKind::Unavailable))?;
        if outcome == QuotaWriteOutcome::Conflict {
            return Err(fail(ProviderAdminErrorKind::Conflict));
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn claude_windows_preserve_overage_and_model_scope() {
        let quota = project("claude", &json!({"five_hour":{"utilization":115.0,"resets_at":"2026-11-11T12:00:00Z"},"seven_day_sonnet":{"utilization":25}}),None).unwrap();
        assert_eq!(quota.windows.len(), 2);
        assert_eq!(quota.windows[0].used_percent, Some(115.0));
        assert!(quota.limit_reached);
        assert_eq!(
            quota.windows[1].local_usage_attribution,
            QuotaLocalUsageAttribution::Unavailable
        );
    }
    #[test]
    fn gemini_keeps_missing_fraction_unknown_and_separates_buckets() {
        let quota=project("gemini", &json!({"buckets":[{"modelId":"gemini-pro","remainingFraction":0.25},{"modelId":"gemini-pro","remainingAmount":"0"},{"modelId":"gemini-flash","remainingFraction":2}]}),None).unwrap();
        assert_eq!(quota.windows[0].used_percent, Some(75.0));
        assert_eq!(quota.windows[1].used_percent, None);
        assert_eq!(quota.windows[2].used_percent, None);
        assert_ne!(quota.windows[0].key, quota.windows[1].key);
        assert!(!quota.limit_reached);
    }
    #[test]
    fn antigravity_summary_projects_five_hour_and_weekly_windows() {
        let quota = project(
            "gemini",
            &json!({
                "groups": [{
                    "id": "gemini",
                    "buckets": [
                        {"bucketId": "gemini-5h", "remainingFraction": 0.25, "resetTime": "2026-11-20T12:00:00Z"},
                        {"bucketId": "gemini-weekly", "remainingFraction": 0.9, "resetTime": "2026-11-24T12:00:00Z"}
                    ]
                }, {
                    "id": "third_party",
                    "buckets": [{"bucketId": "3p-5h", "remainingFraction": 1.0}]
                }]
            }),
            None,
        )
        .unwrap();
        assert_eq!(quota.windows.len(), 3);
        assert_eq!(quota.windows[0].used_percent, Some(75.0));
        assert_eq!(quota.windows[0].window_seconds, Some(18_000));
        assert_eq!(quota.windows[1].used_percent, Some(10.0));
        assert_eq!(quota.windows[1].window_seconds, Some(604_800));
        assert_eq!(quota.windows[2].used_percent, Some(0.0));
    }
    #[test]
    fn malformed_usage_is_not_a_zero_quota() {
        assert!(project("claude", &json!({"error":"denied"}), None).is_err());
        assert!(project("gemini", &json!({}), None).is_err());
    }
}

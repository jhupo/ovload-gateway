//! Validated configuration documents for feature and page controls.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::identity_access::{IdentityError, IdentityResult};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceSettingsKind {
    Features,
    Pages,
}

impl WorkspaceSettingsKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Features => "features",
            Self::Pages => "pages",
        }
    }

    pub fn defaults(self) -> Value {
        match self {
            Self::Features => {
                let response = json!({"enabled":false,"rules":[],"mode":"observe","emailOnHit":false,"autoBan":false,"failureAction":"block","blockStatus":"403","blockMessage":"","banThreshold":"10","violationHours":"720"});
                let mut content = response.clone();
                content["delivery"] = json!("buffered");
                content["maxOutputChars"] = json!("100000");
                json!({
                    "audit":{"version":2,"shared":{"endpoints":[],"groupIds":[],"retries":"2","sampleRate":"100","recordNonHits":false,"hitRetentionDays":"30","nonHitRetentionDays":"1","keywordMode":"keyword_and_api","keywords":""},"prompt":response,"content":content},
                    "referral":{"enabled":false,"rate":"0","freezeHours":"0","eligibilityDays":"0","cap":"0","overrides":[]}
                })
            }
            Self::Pages => json!({
                "channelStatusEnabled":true,"lotteryEnabled":true,
                "monitoring":{"version":1,"thresholds":{"samples":"20","errorWarning":"5","errorCritical":"10","ttftTarget":"1000","ttftWarning":"3000","ttftCritical":"5000","cacheWarning":"50","cacheCritical":"20"},"groupIds":[],"ignoredErrors":[]}
            }),
        }
    }

    pub fn validate(self, value: &Value) -> IdentityResult<()> {
        if serde_json::to_vec(value)
            .map_err(|_| IdentityError::Invalid)?
            .len()
            > 256 * 1024
        {
            return Err(IdentityError::Invalid);
        }
        match self {
            Self::Features => validate_features(value),
            Self::Pages => validate_pages(value),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceSettings {
    pub revision: u64,
    pub values: Value,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceVisibility {
    pub security_audit: bool,
    pub referral: bool,
    pub channel_status: bool,
    pub lottery: bool,
}

pub fn visibility(features: &Value, pages: &Value) -> WorkspaceVisibility {
    WorkspaceVisibility {
        security_audit: features["audit"]["prompt"]["enabled"] == true
            || features["audit"]["content"]["enabled"] == true,
        referral: features["referral"]["enabled"] == true,
        channel_status: pages["channelStatusEnabled"] == true,
        lottery: pages["lotteryEnabled"] == true,
    }
}

fn require(valid: bool) -> IdentityResult<()> {
    if valid {
        Ok(())
    } else {
        Err(IdentityError::Invalid)
    }
}

fn object(value: &Value, keys: &[&str]) -> IdentityResult<()> {
    require(value.as_object().is_some_and(|map| {
        map.len() == keys.len() && keys.iter().all(|key| map.contains_key(*key))
    }))
}

fn text(value: &Value, min: usize, max: usize) -> IdentityResult<&str> {
    let text = value.as_str().ok_or(IdentityError::Invalid)?;
    require((min..=max).contains(&text.chars().count()) && !text.contains('\0'))?;
    Ok(text)
}

fn number(value: &Value, min: f64, max: f64, decimal: bool) -> IdentityResult<f64> {
    let raw = text(value, 1, 16)?;
    let parts: Vec<_> = raw.split('.').collect();
    require(
        parts.len() <= if decimal { 2 } else { 1 }
            && parts
                .iter()
                .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
            && (parts.len() == 1 || parts[1].len() <= 2),
    )?;
    let number = raw.parse::<f64>().map_err(|_| IdentityError::Invalid)?;
    require(number.is_finite() && number >= min && number <= max)?;
    Ok(number)
}

fn boolean(value: &Value) -> IdentityResult<()> {
    require(value.is_boolean())
}
fn choice(value: &Value, choices: &[&str]) -> IdentityResult<()> {
    require(value.as_str().is_some_and(|item| choices.contains(&item)))
}
fn list(value: &Value, max: usize) -> IdentityResult<&Vec<Value>> {
    let items = value.as_array().ok_or(IdentityError::Invalid)?;
    require(items.len() <= max)?;
    Ok(items)
}
fn group_ids(value: &Value, max: usize) -> IdentityResult<()> {
    let mut seen = std::collections::HashSet::new();
    for item in list(value, max)? {
        let id = text(item, 1, 64)?;
        let valid = id.strip_prefix("grp_").is_some_and(|suffix| {
            suffix.len() == 32 && suffix.bytes().all(|byte| byte.is_ascii_hexdigit())
        });
        require(valid && seen.insert(id))?;
    }
    Ok(())
}

fn validate_pages(value: &Value) -> IdentityResult<()> {
    object(
        value,
        &["channelStatusEnabled", "lotteryEnabled", "monitoring"],
    )?;
    boolean(&value["channelStatusEnabled"])?;
    boolean(&value["lotteryEnabled"])?;
    let monitor = &value["monitoring"];
    object(
        monitor,
        &["version", "thresholds", "groupIds", "ignoredErrors"],
    )?;
    require(monitor["version"] == 1)?;
    group_ids(&monitor["groupIds"], 200)?;
    let mut seen = std::collections::HashSet::new();
    for item in list(&monitor["ignoredErrors"], 20)? {
        let name = text(item, 1, 64)?;
        choice(
            item,
            &[
                "content_policy",
                "context_limit",
                "model_unsupported",
                "quota_or_balance",
                "rate_or_capacity",
                "transport_or_stream",
                "not_found",
                "authentication",
                "invalid_request",
                "group_access",
                "account_pool_unavailable",
                "timeout",
                "upstream_forbidden",
                "client_cancelled",
            ],
        )?;
        require(seen.insert(name))?;
    }
    let thresholds = &monitor["thresholds"];
    object(
        thresholds,
        &[
            "samples",
            "errorWarning",
            "errorCritical",
            "ttftTarget",
            "ttftWarning",
            "ttftCritical",
            "cacheWarning",
            "cacheCritical",
        ],
    )?;
    number(&thresholds["samples"], 1.0, 1_000_000.0, false)?;
    for key in [
        "errorWarning",
        "errorCritical",
        "cacheWarning",
        "cacheCritical",
    ] {
        number(&thresholds[key], 0.0, 100.0, true)?;
    }
    for key in ["ttftTarget", "ttftWarning", "ttftCritical"] {
        number(&thresholds[key], 0.0, 3_600_000.0, false)?;
    }
    for (lower, upper) in [
        ("errorWarning", "errorCritical"),
        ("ttftTarget", "ttftWarning"),
        ("ttftWarning", "ttftCritical"),
        ("cacheCritical", "cacheWarning"),
    ] {
        require(
            number(&thresholds[lower], 0.0, f64::MAX, true)?
                <= number(&thresholds[upper], 0.0, f64::MAX, true)?,
        )?;
    }
    Ok(())
}

fn validate_features(value: &Value) -> IdentityResult<()> {
    object(value, &["audit", "referral"])?;
    let referral = &value["referral"];
    object(
        referral,
        &[
            "enabled",
            "rate",
            "freezeHours",
            "eligibilityDays",
            "cap",
            "overrides",
        ],
    )?;
    boolean(&referral["enabled"])?;
    number(&referral["rate"], 0.0, 100.0, true)?;
    number(&referral["freezeHours"], 0.0, 876_000.0, false)?;
    number(&referral["eligibilityDays"], 0.0, 36_500.0, false)?;
    number(&referral["cap"], 0.0, 999_999_999.99, true)?;
    let mut users = std::collections::HashSet::new();
    let mut codes = std::collections::HashSet::new();
    for item in list(&referral["overrides"], 1000)? {
        object(item, &["userId", "invitationCode", "rate"])?;
        require(uuid::Uuid::parse_str(text(&item["userId"], 1, 36)?).is_ok())?;
        require(users.insert(text(&item["userId"], 1, 64)?.to_owned()))?;
        let code = text(&item["invitationCode"], 0, 32)?;
        if !code.is_empty() {
            require(
                code.len() >= 4
                    && code
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
                    && codes.insert(code.to_ascii_lowercase()),
            )?;
        }
        let rate = text(&item["rate"], 0, 16)?;
        require(!code.is_empty() || !rate.is_empty())?;
        if !rate.is_empty() {
            number(&item["rate"], 0.0, 100.0, true)?;
        }
    }
    let audit = &value["audit"];
    object(audit, &["version", "shared", "prompt", "content"])?;
    require(audit["version"] == 2)?;
    let shared = &audit["shared"];
    object(
        shared,
        &[
            "endpoints",
            "groupIds",
            "retries",
            "sampleRate",
            "recordNonHits",
            "hitRetentionDays",
            "nonHitRetentionDays",
            "keywordMode",
            "keywords",
        ],
    )?;
    group_ids(&shared["groupIds"], 20)?;
    number(&shared["retries"], 0.0, 10.0, false)?;
    let sample = number(&shared["sampleRate"], 0.0, 100.0, true)?;
    number(&shared["hitRetentionDays"], 1.0, 3650.0, false)?;
    number(&shared["nonHitRetentionDays"], 1.0, 3.0, false)?;
    boolean(&shared["recordNonHits"])?;
    choice(
        &shared["keywordMode"],
        &["keyword_only", "keyword_and_api", "api_only"],
    )?;
    let keywords = text(&shared["keywords"], 0, 20000)?;
    let mut nodes = std::collections::HashSet::new();
    let endpoints = list(&shared["endpoints"], 20)?;
    for node in endpoints {
        object(
            node,
            &[
                "id",
                "name",
                "baseUrl",
                "model",
                "timeoutMs",
                "enabled",
                "stateCharLimit",
                "proxyId",
            ],
        )?;
        require(nodes.insert(text(&node["id"], 1, 64)?))?;
        text(&node["name"], 1, 80)?;
        let url = url::Url::parse(text(&node["baseUrl"], 1, 2048)?)
            .map_err(|_| IdentityError::Invalid)?;
        require(
            matches!(url.scheme(), "http" | "https")
                && url.host_str().is_some()
                && url.username().is_empty()
                && url.password().is_none(),
        )?;
        let model = text(&node["model"], 1, 160)?;
        let suffix = model.strip_prefix("jev-").ok_or(IdentityError::Invalid)?;
        require(matches!(suffix, "latest" | "preview") || semver::Version::parse(suffix).is_ok())?;
        number(&node["timeoutMs"], 100.0, 30000.0, false)?;
        number(&node["stateCharLimit"], 128.0, 100000.0, false)?;
        text(&node["proxyId"], 0, 80)?;
        boolean(&node["enabled"])?;
    }
    for stage in ["prompt", "content"] {
        let config = &audit[stage];
        let mut keys = vec![
            "enabled",
            "rules",
            "mode",
            "emailOnHit",
            "autoBan",
            "failureAction",
            "blockStatus",
            "blockMessage",
            "banThreshold",
            "violationHours",
        ];
        if stage == "content" {
            keys.extend(["delivery", "maxOutputChars"]);
        }
        object(config, &keys)?;
        for key in ["enabled", "emailOnHit", "autoBan"] {
            boolean(&config[key])?;
        }
        choice(&config["mode"], &["observe", "block"])?;
        choice(&config["failureAction"], &["allow", "block"])?;
        choice(&config["blockStatus"], &["400", "403", "422"])?;
        text(&config["blockMessage"], 0, 1000)?;
        number(&config["banThreshold"], 1.0, 10000.0, false)?;
        number(&config["violationHours"], 1.0, 87600.0, false)?;
        let mut rule_ids = std::collections::HashSet::new();
        let rules = list(&config["rules"], 20)?;
        for rule in rules {
            object(
                rule,
                &[
                    "id",
                    "name",
                    "enabled",
                    "instructions",
                    "trueCriteria",
                    "falseCriteria",
                    "flagThreshold",
                    "hitThreshold",
                ],
            )?;
            require(rule_ids.insert(text(&rule["id"], 1, 64)?))?;
            text(&rule["name"], 1, 80)?;
            boolean(&rule["enabled"])?;
            for key in ["instructions", "trueCriteria", "falseCriteria"] {
                text(&rule[key], 1, 2000)?;
            }
            require(
                number(&rule["flagThreshold"], 0.0, 100.0, true)?
                    < number(&rule["hitThreshold"], 0.0, 100.0, true)?,
            )?;
        }
        if config["enabled"] == true {
            require(!list(&shared["groupIds"], 20)?.is_empty())?;
            if shared["keywordMode"] != "api_only" {
                require(!keywords.trim().is_empty())?;
            }
            if shared["keywordMode"] != "keyword_only" {
                require(
                    endpoints.iter().any(|n| n["enabled"] == true)
                        && rules.iter().any(|r| r["enabled"] == true),
                )?;
            }
            if config["mode"] == "block" {
                require(sample == 100.0)?;
            }
        }
        if stage == "content" {
            choice(&config["delivery"], &["buffered", "observe"])?;
            number(&config["maxOutputChars"], 128.0, 1000000.0, false)?;
            if config["delivery"] == "observe" {
                require(config["mode"] == "observe" && config["failureAction"] == "allow")?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_and_bounds() {
        for kind in [
            WorkspaceSettingsKind::Features,
            WorkspaceSettingsKind::Pages,
        ] {
            assert!(kind.validate(&kind.defaults()).is_ok());
        }
        let mut pages = WorkspaceSettingsKind::Pages.defaults();
        pages["monitoring"]["thresholds"]["errorWarning"] = json!("11");
        assert!(WorkspaceSettingsKind::Pages.validate(&pages).is_err());
        pages = WorkspaceSettingsKind::Pages.defaults();
        pages["channelStatusEnabled"] = json!("false");
        assert!(WorkspaceSettingsKind::Pages.validate(&pages).is_err());
        let mut features = WorkspaceSettingsKind::Features.defaults();
        features["referral"]["rate"] = json!("100.01");
        assert!(WorkspaceSettingsKind::Features.validate(&features).is_err());
        features = WorkspaceSettingsKind::Features.defaults();
        features["audit"]["prompt"]["enabled"] = json!(true);
        assert!(WorkspaceSettingsKind::Features.validate(&features).is_err());
    }
}

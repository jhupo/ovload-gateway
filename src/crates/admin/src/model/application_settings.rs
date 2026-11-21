//! Settings for outbound integrations; credentials never enter public projections.
use super::identity_access::{IdentityError, IdentityResult};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

pub struct IntegrationDocument {
    pub revision: u64,
    pub values: Value,
    pub secrets: Value,
}
impl IntegrationDocument {
    pub fn public(&self) -> Value {
        let presence = self
            .secrets
            .as_object()
            .into_iter()
            .flatten()
            .map(|(k, v)| (k.clone(), json!(v.as_str().is_some_and(|s| !s.is_empty()))))
            .collect::<serde_json::Map<_, _>>();
        json!({"revision":self.revision,"values":self.values,"hasSecrets":presence})
    }
}
pub fn defaults(kind: &str) -> IdentityResult<Value> {
    match kind {
        "mail" => Ok(
            json!({"smtpHost":"","smtpPort":"587","smtpUsername":"","smtpUseTls":true,"senderEmail":"","senderName":"","templates":{}}),
        ),
        "payment" => Ok(
            json!({"version":1,"enabled":false,"balanceEnabled":true,"minAmount":"1","maxAmount":"10000","dailyLimit":"50000","orderTimeout":"30","maxPending":"3","rechargeMultiplier":"1","subscriptionRate":"0","feeRate":"0","cancelLimitEnabled":false,"cancelMax":"10","cancelWindow":"1","cancelUnit":"day","cancelMode":"rolling","forceQr":false,"mobileDeepLink":false,"alipayAppId":"","alipaySellerId":"","alipayMode":"qrcode","userOffers":[],"tiers":[]}),
        ),
        "audit" => Ok(json!({})),
        _ => Err(IdentityError::Invalid),
    }
}
pub fn validate(kind: &str, values: &Value) -> IdentityResult<()> {
    if serde_json::to_vec(values)
        .map_err(|_| IdentityError::Invalid)?
        .len()
        > 512 * 1024
    {
        return Err(IdentityError::Invalid);
    }
    match kind {
        "payment" => {
            let p: PaymentSettings =
                serde_json::from_value(values.clone()).map_err(|_| IdentityError::Invalid)?;
            p.validate()
        }
        "mail" => {
            let m: MailSettings =
                serde_json::from_value(values.clone()).map_err(|_| IdentityError::Invalid)?;
            let port = m
                .smtp_port
                .parse::<u16>()
                .map_err(|_| IdentityError::Invalid)?;
            if port == 0
                || m.smtp_host.len() > 253
                || m.smtp_host
                    .chars()
                    .any(|c| c.is_whitespace() || "/@?#\\".contains(c))
                || m.smtp_username.len() > 254
                || m.sender_name.len() > 100
            {
                return Err(IdentityError::Invalid);
            }
            if !m.smtp_host.is_empty()
                && m.sender_email
                    .parse::<email_address::EmailAddress>()
                    .is_err()
            {
                return Err(IdentityError::Invalid);
            }
            if m.templates.as_object().is_none() {
                return Err(IdentityError::Invalid);
            }
            for (event, translations) in m.templates.as_object().ok_or(IdentityError::Invalid)? {
                if !MAIL_EVENTS.contains(&event.as_str()) {
                    return Err(IdentityError::Invalid);
                }
                for (locale, t) in translations.as_object().ok_or(IdentityError::Invalid)? {
                    if !["zh", "en"].contains(&locale.as_str()) {
                        return Err(IdentityError::Invalid);
                    }
                    for (field, max) in [("subject", 200), ("html", 30000)] {
                        let text = t[field].as_str().ok_or(IdentityError::Invalid)?;
                        if text.is_empty()
                            || text.len() > max * 4
                            || (field == "subject" && text.contains(['\r', '\n']))
                        {
                            return Err(IdentityError::Invalid);
                        }
                        validate_variables(event, text)?;
                    }
                }
            }
            Ok(())
        }
        "audit" if values == &json!({}) => Ok(()),
        _ => Err(IdentityError::Invalid),
    }
}
pub const MAIL_EVENTS: &[&str] = &[
    "verification",
    "passwordReset",
    "subscriptionActivated",
    "subscriptionExpiry",
    "lowBalance",
    "rechargeSuccess",
    "auditViolation",
    "accountDisabled",
];
fn validate_variables(event: &str, mut text: &str) -> IdentityResult<()> {
    let specific = match event {
        "verification" => vec!["verification_code", "expires_in_minutes"],
        "passwordReset" => vec!["reset_url", "expires_in_minutes"],
        "subscriptionActivated" => vec!["subscription_group", "expiry_time"],
        "subscriptionExpiry" => vec!["subscription_group", "expiry_time", "days_remaining"],
        "lowBalance" => vec!["current_balance", "threshold"],
        "rechargeSuccess" => vec!["recharge_amount", "order_id", "current_balance"],
        "auditViolation" => vec!["group_name", "rule_name", "violation_count"],
        _ => vec!["rule_name", "violation_count", "ban_threshold"],
    };
    while let Some((before, rest)) = text.split_once("{{") {
        if before.contains("}}") {
            return Err(IdentityError::Invalid);
        }
        let (key, tail) = rest.split_once("}}").ok_or(IdentityError::Invalid)?;
        if !["site_name", "recipient_name", "recipient_email"].contains(&key.trim())
            && !specific.contains(&key.trim())
        {
            return Err(IdentityError::Invalid);
        }
        text = tail;
    }
    if text.contains("}}") {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MailSettings {
    pub smtp_host: String,
    pub smtp_port: String,
    pub smtp_username: String,
    pub smtp_use_tls: bool,
    pub sender_email: String,
    pub sender_name: String,
    pub templates: Value,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PaymentSettings {
    pub version: u8,
    pub enabled: bool,
    pub balance_enabled: bool,
    pub min_amount: String,
    pub max_amount: String,
    pub daily_limit: String,
    pub order_timeout: String,
    pub max_pending: String,
    pub recharge_multiplier: String,
    pub subscription_rate: String,
    pub fee_rate: String,
    pub cancel_limit_enabled: bool,
    pub cancel_max: String,
    pub cancel_window: String,
    pub cancel_unit: String,
    pub cancel_mode: String,
    pub force_qr: bool,
    pub mobile_deep_link: bool,
    pub alipay_app_id: String,
    #[serde(default)]
    pub alipay_seller_id: String,
    pub alipay_mode: String,
    pub user_offers: Vec<PaymentOffer>,
    pub tiers: Vec<PaymentOffer>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PaymentOffer {
    pub id: uuid::Uuid,
    pub amount: String,
    pub percent: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<uuid::Uuid>,
}
pub fn minor(raw: &str, scale: u32) -> IdentityResult<i64> {
    let (whole, fraction) = raw.split_once('.').unwrap_or((raw, ""));
    if whole.is_empty()
        || whole.len() > 10
        || !whole.bytes().all(|c| c.is_ascii_digit())
        || fraction.len() > scale as usize
        || !fraction.bytes().all(|c| c.is_ascii_digit())
    {
        return Err(IdentityError::Invalid);
    }
    let mut padded = fraction.to_owned();
    while padded.len() < scale as usize {
        padded.push('0')
    }
    whole
        .parse::<i64>()
        .ok()
        .and_then(|v| v.checked_mul(10_i64.pow(scale)))
        .and_then(|v| v.checked_add(padded.parse::<i64>().unwrap_or(0)))
        .ok_or(IdentityError::Invalid)
}
pub fn money(cents: i64) -> String {
    format!("{}.{:02}", cents / 100, cents % 100)
}
impl PaymentSettings {
    pub fn validate(&self) -> IdentityResult<()> {
        if self.version != 1
            || self.tiers.len() > 20
            || self.user_offers.len() > 100
            || !matches!(self.alipay_mode.as_str(), "qrcode" | "redirect")
            || !matches!(self.cancel_unit.as_str(), "minute" | "hour" | "day")
            || !matches!(self.cancel_mode.as_str(), "rolling" | "fixed")
        {
            return Err(IdentityError::Invalid);
        }
        for (value, min, max, scale) in [
            (&self.min_amount, 0, 99999999999, 2),
            (&self.max_amount, 0, 99999999999, 2),
            (&self.daily_limit, 0, 99999999999, 2),
            (&self.order_timeout, 1, 1440, 0),
            (&self.max_pending, 1, 100, 0),
            (&self.recharge_multiplier, 1, 1000000, 2),
            (&self.subscription_rate, 0, 1000000, 2),
            (&self.fee_rate, 0, 10000, 2),
            (&self.cancel_max, 1, 10000, 0),
            (&self.cancel_window, 1, 10000, 0),
        ] {
            let n = minor(value, scale)?;
            if n < min || n > max {
                return Err(IdentityError::Invalid);
            }
        }
        if minor(&self.max_amount, 2)? > 0
            && minor(&self.min_amount, 2)? > minor(&self.max_amount, 2)?
        {
            return Err(IdentityError::Invalid);
        }
        for o in self.tiers.iter().chain(&self.user_offers) {
            if minor(&o.amount, 2)? <= 0 || minor(&o.percent, 2)? > 100000 {
                return Err(IdentityError::Invalid);
            }
        }
        if self.alipay_app_id.len() > 32
            || !self.alipay_app_id.bytes().all(|c| c.is_ascii_digit())
            || self.alipay_seller_id.len() > 32
            || !self.alipay_seller_id.bytes().all(|c| c.is_ascii_digit())
        {
            return Err(IdentityError::Invalid);
        }
        if self.user_offers.iter().any(|o| o.user_id.is_none())
            || self.tiers.iter().any(|o| o.user_id.is_some())
        {
            return Err(IdentityError::Invalid);
        }
        let mut ids = std::collections::HashSet::new();
        if self
            .tiers
            .iter()
            .chain(&self.user_offers)
            .any(|o| !ids.insert(o.id))
        {
            return Err(IdentityError::Invalid);
        }
        if self.enabled && (self.alipay_app_id.is_empty() || self.alipay_seller_id.is_empty()) {
            return Err(IdentityError::Invalid);
        }
        Ok(())
    }
    pub fn quote(&self, amount: i64, user: uuid::Uuid) -> IdentityResult<Value> {
        if amount <= 0
            || amount < minor(&self.min_amount, 2)?
            || (minor(&self.max_amount, 2)? > 0 && amount > minor(&self.max_amount, 2)?)
        {
            return Err(IdentityError::Invalid);
        }
        let offers = self
            .user_offers
            .iter()
            .filter(|o| o.user_id == Some(user))
            .collect::<Vec<_>>();
        let source = if offers.is_empty() {
            self.tiers.iter().collect::<Vec<_>>()
        } else {
            offers
        };
        let bonus = source
            .iter()
            .filter(|o| minor(&o.amount, 2).is_ok_and(|a| a <= amount))
            .max_by_key(|o| minor(&o.amount, 2).unwrap_or(0))
            .map(|o| minor(&o.percent, 2))
            .transpose()?
            .unwrap_or(0);
        let credit = (i128::from(amount)
            * i128::from(minor(&self.recharge_multiplier, 2)?)
            * i128::from(10000 + bonus)
            * 100)
            .checked_div(10000)
            .and_then(|n| i64::try_from(n).ok())
            .ok_or(IdentityError::Invalid)?;
        let fee = i64::try_from(
            (i128::from(amount) * i128::from(minor(&self.fee_rate, 2)?) + 9999) / 10000,
        )
        .map_err(|_| IdentityError::Invalid)?;
        Ok(
            json!({"amountCny":money(amount),"feeCny":money(fee),"totalCny":money(amount+fee),"creditUsd":format!("{}.{:06}",credit/1000000,credit%1000000),"bonusPercent":money(bonus)}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recharge_rounding_and_customer_offers_preserve_money() {
        let user = uuid::Uuid::new_v4();
        let other = uuid::Uuid::new_v4();
        let mut values = defaults("payment").unwrap();
        values["rechargeMultiplier"] = json!("0.14");
        values["feeRate"] = json!("0.5");
        values["tiers"] = json!([{"id":uuid::Uuid::new_v4(),"amount":"10","percent":"10"}]);
        values["userOffers"] =
            json!([{"id":uuid::Uuid::new_v4(),"userId":user,"amount":"20","percent":"25"}]);
        let p: PaymentSettings = serde_json::from_value(values).unwrap();
        p.validate().unwrap();
        let q = p.quote(10001, user).unwrap();
        assert_eq!(q["creditUsd"], "17.501750");
        assert_eq!(q["feeCny"], "0.51");
        assert_eq!(q["totalCny"], "100.52");
        assert_eq!(p.quote(10001, other).unwrap()["creditUsd"], "15.401540");
        assert_eq!(p.quote(1000, user).unwrap()["bonusPercent"], "0.00");
    }
    #[test]
    fn financial_and_template_inputs_reject_ambiguous_values() {
        for value in ["NaN", "1e2", "-1", "100000000000000000000000", "0.001"] {
            assert!(minor(value, 2).is_err(), "{value}");
        }
        let mut v = defaults("payment").unwrap();
        v["enabled"] = json!(true);
        assert!(validate("payment", &v).is_err());
        let mut v = defaults("mail").unwrap();
        v["templates"] =
            json!({"verification":{"zh":{"subject":"Verify","html":"{{unknown_secret}}"}}});
        assert!(validate("mail", &v).is_err());
        v["templates"] =
            json!({"verification":{"zh":{"subject":"Verify","html":"{{verification_code}}"}}});
        assert!(validate("mail", &v).is_ok());
    }
}

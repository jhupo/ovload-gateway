//! Alipay RSA2 protocol. Signatures use ring; ASN.1 decoding uses RustCrypto SPKI.
use base64::{Engine as _, engine::general_purpose::STANDARD};
use ovload_admin::model::{
    application_settings::money,
    identity_access::{IdentityError, IdentityResult},
};
use ring::{
    rand::SystemRandom,
    signature::{self, RsaKeyPair},
};
use serde_json::{Value, json, value::RawValue};
use std::collections::BTreeMap;

fn pem(value: &str) -> IdentityResult<Vec<u8>> {
    let body = value
        .lines()
        .filter(|l| !l.starts_with("-----"))
        .collect::<String>();
    STANDARD
        .decode(body.trim())
        .map_err(|_| IdentityError::Invalid)
}
pub(super) fn private_key(value: &str) -> IdentityResult<RsaKeyPair> {
    let der = pem(value)?;
    RsaKeyPair::from_pkcs8(&der)
        .or_else(|_| RsaKeyPair::from_der(&der))
        .map_err(|_| IdentityError::Invalid)
}
pub(super) fn public_key(value: &str) -> IdentityResult<Vec<u8>> {
    use spki::der::{Reader, SliceReader, asn1::UintRef};
    let mut der = pem(value)?;
    if let Ok(info) = spki::SubjectPublicKeyInfoRef::try_from(der.as_slice()) {
        if info.algorithm.oid.to_string() != "1.2.840.113549.1.1.1" {
            return Err(IdentityError::Invalid);
        }
        der = info
            .subject_public_key
            .as_bytes()
            .map(Vec::from)
            .ok_or(IdentityError::Invalid)?;
    }
    let mut reader = SliceReader::new(&der).map_err(|_| IdentityError::Invalid)?;
    let (n, e) = reader
        .sequence(|r| -> Result<_, spki::der::Error> {
            let n: UintRef = r.decode()?;
            let e: UintRef = r.decode()?;
            Ok((n.as_bytes().len(), e.as_bytes().to_vec()))
        })
        .map_err(|_| IdentityError::Invalid)?;
    reader.finish().map_err(|_| IdentityError::Invalid)?;
    if !(256..=1024).contains(&n) || e != [1, 0, 1] {
        return Err(IdentityError::Invalid);
    }
    Ok(der)
}
pub(super) fn verify(key: &str, bytes: &[u8], sign: &str) -> IdentityResult<()> {
    let key = public_key(key)?;
    let sign = STANDARD
        .decode(sign)
        .map_err(|_| IdentityError::Forbidden)?;
    signature::UnparsedPublicKey::new(&signature::RSA_PKCS1_2048_8192_SHA256, key)
        .verify(bytes, &sign)
        .map_err(|_| IdentityError::Forbidden)
}
fn sign(key: &str, bytes: &[u8]) -> IdentityResult<String> {
    let key = private_key(key)?;
    let mut out = vec![0; key.public().modulus_len()];
    key.sign(
        &signature::RSA_PKCS1_SHA256,
        &SystemRandom::new(),
        bytes,
        &mut out,
    )
    .map_err(|_| IdentityError::Unavailable)?;
    Ok(STANDARD.encode(out))
}
pub(super) fn canonical(fields: &BTreeMap<String, String>, notification: bool) -> String {
    fields
        .iter()
        .filter(|(k, v)| *k != "sign" && (!notification || *k != "sign_type") && !v.is_empty())
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("&")
}
pub(super) fn gateway() -> String {
    std::env::var("OVLOAD_ALIPAY_GATEWAY")
        .unwrap_or_else(|_| "https://openapi.alipay.com/gateway.do".to_owned())
}
fn parameters(
    config: &Value,
    id: uuid::Uuid,
    total: i64,
    origin: &str,
    method: &str,
    timeout: i64,
) -> IdentityResult<BTreeMap<String, String>> {
    let mut fields = BTreeMap::from([
        (
            "app_id".to_owned(),
            config["alipayAppId"]
                .as_str()
                .ok_or(IdentityError::Invalid)?
                .to_owned(),
        ),
        ("method".to_owned(), method.to_owned()),
        ("format".to_owned(), "JSON".to_owned()),
        ("charset".to_owned(), "utf-8".to_owned()),
        ("sign_type".to_owned(), "RSA2".to_owned()),
        (
            "timestamp".to_owned(),
            (chrono::Utc::now() + chrono::Duration::hours(8))
                .format("%Y-%m-%d %H:%M:%S")
                .to_string(),
        ),
        ("version".to_owned(), "1.0".to_owned()),
    ]);
    if method.ends_with("close") || method.ends_with("query") {
        fields.insert(
            "biz_content".to_owned(),
            json!({"out_trade_no":id.to_string()}).to_string(),
        );
    } else {
        fields.insert(
            "notify_url".to_owned(),
            format!("{origin}/api/payments/alipay/notify"),
        );
        fields.insert("return_url".to_owned(), format!("{origin}/user/recharge"));
        let mut business = json!({"out_trade_no":id.to_string(),"total_amount":money(total),"subject":"账户余额充值","timeout_express":format!("{timeout}m")});
        if method != "alipay.trade.precreate" {
            business["product_code"] = json!(if method == "alipay.trade.wap.pay" {
                "QUICK_WAP_WAY"
            } else {
                "FAST_INSTANT_TRADE_PAY"
            });
        }
        fields.insert("biz_content".to_owned(), business.to_string());
    }
    Ok(fields)
}
pub(super) async fn checkout(
    config: &Value,
    secrets: &Value,
    id: uuid::Uuid,
    total: i64,
    origin: &str,
    timeout: i64,
    mobile: bool,
) -> IdentityResult<Value> {
    let qr = config["forceQr"] == true || config["alipayMode"] == "qrcode";
    let method = if qr {
        "alipay.trade.precreate"
    } else if mobile && config["mobileDeepLink"] == true {
        "alipay.trade.wap.pay"
    } else {
        "alipay.trade.page.pay"
    };
    let mut fields = parameters(config, id, total, origin, method, timeout)?;
    let signature = sign(
        secrets["privateKey"]
            .as_str()
            .ok_or(IdentityError::Unavailable)?,
        canonical(&fields, false).as_bytes(),
    )?;
    fields.insert("sign".to_owned(), signature);
    if !qr {
        let mut url = url::Url::parse(&gateway()).map_err(|_| IdentityError::Unavailable)?;
        url.query_pairs_mut().extend_pairs(&fields);
        return Ok(json!({"mode":"redirect","url":url.as_str()}));
    }
    let value = call(fields, "alipay_trade_precreate_response", secrets).await?;
    if value["out_trade_no"] != id.to_string() {
        return Err(IdentityError::Unavailable);
    }
    let code = value["qr_code"]
        .as_str()
        .filter(|v| v.len() <= 4096 && v.starts_with("https://"))
        .ok_or(IdentityError::Unavailable)?;
    Ok(json!({"mode":"qrcode","url":code}))
}
pub(super) async fn close(config: &Value, secrets: &Value, id: uuid::Uuid) -> IdentityResult<bool> {
    let mut fields = parameters(config, id, 0, "", "alipay.trade.close", 0)?;
    fields.insert(
        "sign".to_owned(),
        sign(
            secrets["privateKey"]
                .as_str()
                .ok_or(IdentityError::Unavailable)?,
            canonical(&fields, false).as_bytes(),
        )?,
    );
    let value = call(fields, "alipay_trade_close_response", secrets).await?;
    Ok(value["out_trade_no"] == id.to_string())
}
pub(super) async fn query(
    config: &Value,
    secrets: &Value,
    id: uuid::Uuid,
) -> IdentityResult<Value> {
    let mut fields = parameters(config, id, 0, "", "alipay.trade.query", 0)?;
    fields.insert(
        "sign".to_owned(),
        sign(
            secrets["privateKey"]
                .as_str()
                .ok_or(IdentityError::Unavailable)?,
            canonical(&fields, false).as_bytes(),
        )?,
    );
    let value = call(fields, "alipay_trade_query_response", secrets).await?;
    if value["out_trade_no"] != id.to_string() {
        return Err(IdentityError::Unavailable);
    }
    Ok(value)
}
async fn call(
    fields: BTreeMap<String, String>,
    key: &str,
    secrets: &Value,
) -> IdentityResult<Value> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(6))
        .build()
        .map_err(|_| IdentityError::Unavailable)?;
    let mut response = client
        .post(gateway())
        .form(&fields)
        .send()
        .await
        .map_err(|_| IdentityError::Unavailable)?;
    if !response.status().is_success() {
        return Err(IdentityError::Unavailable);
    }
    let mut body = Vec::new();
    while let Some(c) = response
        .chunk()
        .await
        .map_err(|_| IdentityError::Unavailable)?
    {
        if body.len() + c.len() > 262144 {
            return Err(IdentityError::Unavailable);
        }
        body.extend(c);
    }
    let envelope: BTreeMap<String, Box<RawValue>> =
        serde_json::from_slice(&body).map_err(|_| IdentityError::Unavailable)?;
    let raw = envelope.get(key).ok_or(IdentityError::Unavailable)?;
    let signature: String = serde_json::from_str(
        envelope
            .get("sign")
            .ok_or(IdentityError::Unavailable)?
            .get(),
    )
    .map_err(|_| IdentityError::Unavailable)?;
    verify(
        secrets["publicKey"]
            .as_str()
            .ok_or(IdentityError::Unavailable)?,
        raw.get().as_bytes(),
        &signature,
    )?;
    let value: Value = serde_json::from_str(raw.get()).map_err(|_| IdentityError::Unavailable)?;
    if value["code"] != "10000" {
        return Err(IdentityError::Unavailable);
    }
    Ok(value)
}

//! SMTP delivery using encrypted, hot-reloaded settings with a deployment-file fallback.
use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    transport::smtp::authentication::Credentials,
};
use ovload_admin::{
    model::application_settings::{IntegrationDocument, MailSettings},
    ports::{application_settings::ApplicationSettingsStore, site_settings::SiteSettingsStore},
};
use ovload_admin::{
    model::identity_access::{IdentityError, IdentityResult},
    ports::identity_notification::{IdentityNotification, IdentityNotificationSender},
};
use secrecy::{ExposeSecret as _, SecretString};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{path::Path, sync::Arc, time::Duration};

struct ConfiguredSender {
    settings: Arc<dyn ApplicationSettingsStore>,
    site: Arc<dyn SiteSettingsStore>,
    fallback: Option<Arc<dyn IdentityNotificationSender>>,
    origin: String,
}
pub fn configured_sender(
    settings: Arc<dyn ApplicationSettingsStore>,
    site: Arc<dyn SiteSettingsStore>,
    fallback: Option<Arc<dyn IdentityNotificationSender>>,
    origin: String,
) -> Arc<dyn IdentityNotificationSender> {
    Arc::new(ConfiguredSender {
        settings,
        site,
        fallback,
        origin,
    })
}
fn transport(
    d: &IntegrationDocument,
) -> IdentityResult<(AsyncSmtpTransport<Tokio1Executor>, String)> {
    let c: MailSettings =
        serde_json::from_value(d.values.clone()).map_err(|_| IdentityError::Invalid)?;
    if c.smtp_host.is_empty() {
        return Err(IdentityError::Unavailable);
    }
    let port = c
        .smtp_port
        .parse::<u16>()
        .map_err(|_| IdentityError::Invalid)?;
    let mut builder = if c.smtp_use_tls {
        if port == 465 {
            AsyncSmtpTransport::<Tokio1Executor>::relay(&c.smtp_host)
        } else {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&c.smtp_host)
        }
        .map_err(|_| IdentityError::Invalid)?
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&c.smtp_host)
    };
    if !c.smtp_username.is_empty() {
        builder = builder.credentials(Credentials::new(
            c.smtp_username,
            d.secrets["smtpPassword"]
                .as_str()
                .ok_or(IdentityError::Invalid)?
                .to_owned(),
        ));
    }
    let from = lettre::message::Mailbox::new(
        if c.sender_name.is_empty() {
            None
        } else {
            Some(c.sender_name)
        },
        c.sender_email.parse().map_err(|_| IdentityError::Invalid)?,
    )
    .to_string();
    Ok((
        builder
            .port(port)
            .timeout(Some(Duration::from_secs(15)))
            .build(),
        from,
    ))
}
fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
fn render(mut text: &str, vars: &Value, html: bool) -> String {
    let mut result = String::new();
    while let Some((before, rest)) = text.split_once("{{") {
        result.push_str(before);
        let Some((name, tail)) = rest.split_once("}}") else {
            break;
        };
        let val = vars[name.trim()]
            .as_str()
            .map(str::to_owned)
            .or_else(|| vars[name.trim()].as_u64().map(|v| v.to_string()))
            .unwrap_or_default();
        result.push_str(&if html { escape(&val) } else { val });
        text = tail;
    }
    result.push_str(text);
    result
}
impl ConfiguredSender {
    async fn deliver(
        &self,
        d: IntegrationDocument,
        message: IdentityNotification,
    ) -> IdentityResult<()> {
        let (smtp, from) = transport(&d)?;
        let event = match message.purpose.as_str() {
            "registration" => "verification",
            "password_reset" => "passwordReset",
            "content_audit" => "auditViolation",
            v if ovload_admin::model::application_settings::MAIL_EVENTS.contains(&v) => v,
            _ => return Err(IdentityError::Invalid),
        };
        let mut vars = message.variables;
        if !vars.is_object() {
            vars = json!({})
        }
        vars["site_name"] = json!(self.site.public_get().await?.name);
        vars["recipient_email"] = json!(message.email);
        if vars["recipient_name"].is_null() {
            vars["recipient_name"] = vars["recipient_email"].clone();
        }
        vars["verification_code"] = json!(message.token.expose_secret());
        vars["reset_url"] = json!(format!(
            "{}/forgot-password#confirm&token={}",
            self.origin.trim_end_matches('/'),
            message.token.expose_secret()
        ));
        if event == "auditViolation" {
            vars["rule_name"] = json!(message.token.expose_secret());
        }
        // Template content is configuration data. Prefer the deployment's English
        // template and fall back to the configured Chinese template only when an
        // English translation is absent; never manufacture a locale-specific
        // subject/body in the transport layer.
        let fallback_subject = match event {
            "verification" => "Verify your email",
            "passwordReset" => "Reset your password",
            "rechargeSuccess" => "Recharge completed",
            "auditViolation" => "Content audit notice",
            _ => "Account notification",
        };
        let fallback_html = match event {
            "verification" => {
                "<p>{{site_name}}</p><p>Verification code: {{verification_code}}</p><p>Expires in {{expires_in_minutes}} minutes.</p>"
            }
            "passwordReset" => {
                "<p>{{site_name}}</p><p><a href=\"{{reset_url}}\">Reset your password</a></p><p>Expires in {{expires_in_minutes}} minutes.</p>"
            }
            "rechargeSuccess" => {
                "<p>Recharge completed: {{recharge_amount}}</p><p>Order: {{order_id}}</p><p>Balance: {{current_balance}}</p>"
            }
            _ => "<p>{{site_name}}</p><p>{{rule_name}}</p>",
        };
        let template = d
            .values
            .get("templates")
            .and_then(Value::as_object)
            .and_then(|templates| templates.get(event))
            .and_then(Value::as_object)
            .and_then(|locales| locales.get("en").or_else(|| locales.get("zh")))
            .and_then(Value::as_object);
        let subject = render(
            template
                .and_then(|template| template.get("subject"))
                .and_then(Value::as_str)
                .unwrap_or(fallback_subject),
            &vars,
            false,
        );
        let html = render(
            template
                .and_then(|template| template.get("html"))
                .and_then(Value::as_str)
                .unwrap_or(fallback_html),
            &vars,
            true,
        );
        let email = Message::builder()
            .from(from.parse().map_err(|_| IdentityError::Invalid)?)
            .to(message.email.parse().map_err(|_| IdentityError::Invalid)?)
            .subject(subject)
            .header(lettre::message::header::ContentType::TEXT_HTML)
            .body(html)
            .map_err(|_| IdentityError::Invalid)?;
        smtp.send(email)
            .await
            .map_err(|_| IdentityError::Unavailable)?;
        Ok(())
    }
}
#[async_trait::async_trait]
impl IdentityNotificationSender for ConfiguredSender {
    async fn available(&self) -> bool {
        match self.settings.load("mail", None).await {
            Ok(d) if d.values["smtpHost"].as_str().is_some_and(|s| !s.is_empty()) => {
                transport(&d).is_ok()
            }
            Ok(_) => self.fallback.is_some(),
            Err(_) => false,
        }
    }
    async fn test(&self, recipient: Option<String>) -> IdentityResult<()> {
        let d = self.settings.load("mail", None).await?;
        if let Some(email) = recipient {
            if email.parse::<lettre::message::Mailbox>().is_err() {
                return Err(IdentityError::Invalid);
            }
            self.deliver(
                d,
                IdentityNotification {
                    email,
                    purpose: "registration".to_owned(),
                    token: SecretString::from("SMTP-TEST"),
                    variables: json!({"expires_in_minutes":20}),
                },
            )
            .await
        } else {
            let (smtp, _) = transport(&d)?;
            if smtp
                .test_connection()
                .await
                .map_err(|_| IdentityError::Unavailable)?
            {
                Ok(())
            } else {
                Err(IdentityError::Unavailable)
            }
        }
    }
    async fn send(&self, message: IdentityNotification) -> IdentityResult<()> {
        let d = self.settings.load("mail", None).await?;
        if d.values["smtpHost"].as_str().is_none_or(str::is_empty) {
            self.fallback
                .as_ref()
                .ok_or(IdentityError::Unavailable)?
                .send(message)
                .await
        } else {
            self.deliver(d, message).await
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SmtpConfig {
    host: String,
    port: u16,
    username: String,
    password: SecretString,
    from: String,
    frontend_origin: String,
}
pub struct SmtpIdentitySender {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: String,
    origin: String,
}
pub async fn notification_sender(
    path: Option<&Path>,
) -> IdentityResult<Option<Arc<dyn IdentityNotificationSender>>> {
    let Some(path) = path else { return Ok(None) };
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|_| IdentityError::Unavailable)?;
    if bytes.len() > 16384 {
        return Err(IdentityError::Invalid);
    }
    let config: SmtpConfig = serde_json::from_slice(&bytes).map_err(|_| IdentityError::Invalid)?;
    if config.port == 0 || config.from.parse::<lettre::message::Mailbox>().is_err() {
        return Err(IdentityError::Invalid);
    }
    let origin =
        reqwest::Url::parse(&config.frontend_origin).map_err(|_| IdentityError::Invalid)?;
    if origin.scheme() != "https"
        || origin.host_str().is_none()
        || !origin.username().is_empty()
        || origin.password().is_some()
        || origin.query().is_some()
        || origin.fragment().is_some()
        || origin.path() != "/"
    {
        return Err(IdentityError::Invalid);
    }
    let transport = AsyncSmtpTransport::<Tokio1Executor>::relay(&config.host)
        .map_err(|_| IdentityError::Invalid)?
        .port(config.port)
        .timeout(Some(Duration::from_secs(20)))
        .credentials(Credentials::new(
            config.username,
            config.password.expose_secret().to_owned(),
        ))
        .build();
    Ok(Some(Arc::new(SmtpIdentitySender {
        transport,
        from: config.from,
        origin: origin.origin().ascii_serialization(),
    })))
}
#[async_trait::async_trait]
impl IdentityNotificationSender for SmtpIdentitySender {
    async fn send(&self, message: IdentityNotification) -> IdentityResult<()> {
        let (subject, path) = match message.purpose.as_str() {
            "registration" => ("Verify your email", "/sign-up#verify-email"),
            "password_reset" => ("Reset your password", "/forgot-password#confirm"),
            "content_audit" => ("Content audit policy notice", "/user/dashboard"),
            _ => return Err(IdentityError::Invalid),
        };
        let body = if message.purpose == "content_audit" {
            format!(
                "Your model request matched the site's content audit policy.\n\n{}\n\nPlease review the site rules before making further requests.",
                message.token.expose_secret()
            )
        } else {
            format!(
                "{subject}\n\nOpen {}{} and enter this verification token:\n{}\n\nThis token expires after 20 minutes. Ignore this email if you did not request it.",
                self.origin,
                path,
                message.token.expose_secret()
            )
        };
        let email = Message::builder()
            .from(self.from.parse().map_err(|_| IdentityError::Invalid)?)
            .to(message.email.parse().map_err(|_| IdentityError::Invalid)?)
            .subject(subject)
            .body(body)
            .map_err(|_| IdentityError::Invalid)?;
        self.transport
            .send(email)
            .await
            .map_err(|_| IdentityError::Unavailable)?;
        Ok(())
    }
}

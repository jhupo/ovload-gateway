//! Independent customer commands with bounded password work and encrypted intents.

use std::{net::IpAddr, sync::Arc};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use ovload_core::access::{TenantId, UserId};
use rand_core::{OsRng, RngCore as _};
use ring::aead::{AES_256_GCM, Aad, LessSafeKey, Nonce, UnboundKey};
use secrecy::{ExposeSecret as _, SecretBox, SecretString};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest as _, Sha256};
use tokio::sync::Semaphore;
use uuid::Uuid;

use super::identity::{hash_password, validate_password, verify_password};
use crate::{
    model::{
        identity_access::{
            IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
        },
        identity_lifecycle::*,
    },
    ports::{identity::IdentityStore, identity_lifecycle::IdentityLifecycleStore},
};

pub struct IdentityLifecycleService {
    pub(super) store: Arc<dyn IdentityLifecycleStore>,
    pub(super) identity: Arc<dyn IdentityStore>,
    pub(super) password_capacity: Arc<Semaphore>,
    notification_key: Option<SecretBox<[u8; 32]>>,
    notification_sender:
        Option<Arc<dyn crate::ports::identity_notification::IdentityNotificationSender>>,
    pub(super) oauth: Option<Arc<dyn crate::ports::customer_oauth::CustomerOAuth>>,
}

impl IdentityLifecycleService {
    pub async fn new(
        store: Arc<dyn IdentityLifecycleStore>,
        identity: Arc<dyn IdentityStore>,
        notification_key: Option<SecretBox<[u8; 32]>>,
        notification_sender: Option<
            Arc<dyn crate::ports::identity_notification::IdentityNotificationSender>,
        >,
        oauth: Option<Arc<dyn crate::ports::customer_oauth::CustomerOAuth>>,
    ) -> IdentityResult<Self> {
        Ok(Self {
            store,
            identity,
            password_capacity: Arc::new(Semaphore::new(4)),
            notification_key,
            notification_sender,
            oauth,
        })
    }

    pub async fn registration_policy(&self) -> IdentityResult<RegistrationPolicy> {
        self.store.registration_policy().await
    }
    pub async fn mail_available(&self) -> bool {
        self.notification_key.is_some()
            && if let Some(sender) = &self.notification_sender {
                sender.available().await
            } else {
                false
            }
    }
    pub async fn management_policy(
        &self,
        current: &IdentitySession,
    ) -> IdentityResult<RegistrationPolicy> {
        self.store.management_policy(actor(current)?).await
    }
    pub async fn update_policy(
        &self,
        current: &IdentitySession,
        policy: RegistrationPolicy,
    ) -> IdentityResult<RegistrationPolicy> {
        policy.validate()?;
        // Mail capability requires a configured encryption key; transport readiness is checked separately.
        if (policy.verification_required
            || policy.recovery_enabled
            || !policy.enabled_providers.is_empty())
            && !self.mail_available().await
        {
            return Err(IdentityError::Unavailable);
        }
        let available = self.oauth_providers().await?;
        if policy
            .enabled_providers
            .iter()
            .any(|p| !available.contains(p))
        {
            return Err(IdentityError::Unavailable);
        }
        self.store.update_policy(actor(current)?, policy).await
    }
    pub async fn register(&self, input: RegistrationInput, source: IpAddr) -> IdentityResult<()> {
        let email = normalize_email(&input.email)?;
        self.budget("registration", &email, source).await?;
        text(&input.display_name, 160)?;
        validate_password(input.password.expose_secret())?;
        let policy = self.store.registration_policy().await?;
        if (!policy.registration_enabled
            && input
                .invitation_code
                .as_deref()
                .is_none_or(|v| v.trim().is_empty()))
            || !policy.permits_email(&email)
        {
            return Err(IdentityError::Forbidden);
        }
        if policy.verification_required && !self.mail_available().await {
            return Err(IdentityError::Unavailable);
        }
        let password_hash = hash_password(self.password_capacity.clone(), input.password).await?;
        let registration = PreparedRegistration {
            invitation_code: input.invitation_code,
            external_identity: None,
            consent_revision: input.consent_revision,
            email: email.clone(),
            display_name: input.display_name,
            password_hash,
        };
        let challenge = if policy.verification_required {
            Some(self.issue(
                ChallengePurpose::Registration,
                &email,
                json!({
                    "consent_revision": registration.consent_revision,"email":registration.email,"display_name":registration.display_name,
                    "password_hash":registration.password_hash.expose_secret(),
                    "invitation_code":registration.invitation_code,
                }),
            ).await?)
        } else {
            None
        };
        self.store.register(registration, challenge).await
    }

    pub async fn request_password_reset(
        &self,
        email: String,
        source: IpAddr,
    ) -> IdentityResult<()> {
        let email = normalize_email(&email)?;
        self.budget("password_reset", &email, source).await?;
        let policy = self.store.registration_policy().await?;
        if !policy.recovery_enabled {
            return Err(IdentityError::Forbidden);
        }
        if !self.mail_available().await {
            return Err(IdentityError::Unavailable);
        }
        let challenge = self
            .issue(
                ChallengePurpose::PasswordReset,
                &email,
                json!({"email":email}),
            )
            .await?;
        self.store.request_password_reset(email, challenge).await
    }

    pub async fn verify_registration(
        &self,
        token: SecretString,
        source: IpAddr,
    ) -> IdentityResult<()> {
        let digest = challenge_digest(ChallengePurpose::Registration, token.expose_secret())?;
        self.identity.consume_auth_attempt(source, digest).await?;
        let challenge = self
            .store
            .challenge(ChallengePurpose::Registration, digest)
            .await?;
        let payload = self.open(&challenge)?;
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct PendingRegistration {
            invitation_code: Option<String>,
            external_identity: Option<(String, String)>,
            consent_revision: Option<u64>,
            email: String,
            display_name: String,
            password_hash: SecretString,
        }
        let payload: PendingRegistration =
            serde_json::from_value(payload).map_err(|_| IdentityError::Unavailable)?;
        if normalize_email(&payload.email)? != payload.email {
            return Err(IdentityError::Unavailable);
        }
        text(&payload.display_name, 160)?;
        self.store
            .consume_registration(
                challenge,
                PreparedRegistration {
                    invitation_code: payload.invitation_code,
                    external_identity: payload.external_identity,
                    consent_revision: payload.consent_revision,
                    email: payload.email,
                    display_name: payload.display_name,
                    password_hash: payload.password_hash,
                },
            )
            .await
    }

    pub async fn reset_password(
        &self,
        token: SecretString,
        password: SecretString,
        source: IpAddr,
    ) -> IdentityResult<()> {
        let digest = challenge_digest(ChallengePurpose::PasswordReset, token.expose_secret())?;
        self.identity.consume_auth_attempt(source, digest).await?;
        validate_password(password.expose_secret())?;
        let challenge = self
            .store
            .challenge(ChallengePurpose::PasswordReset, digest)
            .await?;
        let _payload = self.open(&challenge)?;
        let hash = hash_password(self.password_capacity.clone(), password).await?;
        self.store.consume_password_reset(challenge, hash).await
    }

    pub async fn profile(
        &self,
        current: &IdentitySession,
    ) -> IdentityResult<CustomerAccountRecord> {
        self.store.profile(current).await
    }
    pub async fn customer(
        &self,
        current: &IdentitySession,
        tenant: TenantId,
        user: UserId,
    ) -> IdentityResult<CustomerAccountRecord> {
        self.store.customer(actor(current)?, tenant, user).await
    }
    pub async fn update_profile(
        &self,
        current: &IdentitySession,
        command: UpdateOwnProfile,
    ) -> IdentityResult<CustomerAccountRecord> {
        version(command.expected_revision)?;
        text(&command.display_name, 160)?;
        self.store.update_profile(current, command).await
    }
    pub async fn update_customer(
        &self,
        current: &IdentitySession,
        mut command: UpdateCustomerAccount,
    ) -> IdentityResult<CustomerAccountRecord> {
        let actor = actor(current)?;
        version(command.changes.expected_revision)?;
        command.changes.email = normalize_email(&command.changes.email)?;
        text(&command.changes.display_name, 160)?;
        notes(&command.changes.notes)?;
        limits(
            command.changes.max_concurrency,
            command.changes.requests_per_minute,
        )?;
        let password_hash = if let Some(password) = command.password {
            validate_password(password.expose_secret())?;
            Some(hash_password(self.password_capacity.clone(), password).await?)
        } else {
            None
        };
        self.store
            .update_customer(
                actor,
                PreparedCustomerAccountUpdate {
                    changes: command.changes,
                    password_hash,
                },
            )
            .await
    }
    pub async fn change_password(
        &self,
        current: &IdentitySession,
        expected_revision: u64,
        current_password: SecretString,
        new_password: SecretString,
        source: IpAddr,
    ) -> IdentityResult<()> {
        version(expected_revision)?;
        if current_password.expose_secret().len() > 256 {
            return Err(IdentityError::Invalid);
        }
        validate_password(new_password.expose_secret())?;
        let budget =
            Sha256::digest(format!("password_change:{:?}", current.owner).as_bytes()).into();
        self.identity.consume_auth_attempt(source, budget).await?;
        let credential = self.store.credential(current).await?;
        if credential.revision != expected_revision {
            return Err(IdentityError::Conflict);
        }
        if !verify_password(
            self.password_capacity.clone(),
            current_password,
            credential.credential.password_hash.clone(),
        )
        .await?
        {
            self.identity
                .record_authentication_failure(Some(current.owner))
                .await?;
            return Err(IdentityError::Unauthorized);
        }
        let new_hash = hash_password(self.password_capacity.clone(), new_password).await?;
        self.store
            .change_password(
                current,
                expected_revision,
                credential.credential.password_hash,
                new_hash,
            )
            .await
    }

    async fn configured_oauth(
        &self,
    ) -> IdentityResult<Arc<dyn crate::ports::customer_oauth::CustomerOAuth>> {
        let base = self.oauth.as_ref().ok_or(IdentityError::Unavailable)?;
        let d = self.store.security_document(None).await?;
        let secrets = self.security_secrets(&d)?;
        let mut config = json!({});
        for name in ["github", "google", "linuxdo"] {
            let p = &d.policy.providers[name];
            if let (Some(id), Some(uri)) = (
                p["clientId"].as_str().filter(|s| !s.is_empty()),
                p["callbackUrl"].as_str().filter(|s| !s.is_empty()),
            ) {
                let secret = secrets[name].as_str().unwrap_or("");
                if secret.is_empty() && !base.providers().iter().any(|p| p == name) {
                    continue;
                }
                config[name] = json!({"client_id":id,"redirect_uri":uri,"client_secret":secret});
            }
        }
        if config.as_object().is_some_and(|o| o.is_empty()) {
            return Ok(base.clone());
        }
        base.configured(config)
    }
    pub async fn oauth_providers(&self) -> IdentityResult<Vec<String>> {
        if self.oauth.is_none() {
            return Ok(Vec::new());
        }
        Ok(self.configured_oauth().await?.providers())
    }
    pub async fn begin_oauth(
        &self,
        provider: String,
        email: Option<String>,
        display_name: Option<String>,
        consent_revision: Option<u64>,
        source: IpAddr,
        invitation_code: Option<String>,
    ) -> IdentityResult<(String, String)> {
        self.budget("oauth", &provider, source).await?;
        let policy = self.store.registration_policy().await?;
        if !policy.enabled_providers.contains(&provider) {
            return Err(IdentityError::Forbidden);
        }
        let oauth = self.configured_oauth().await?;
        let state = super::identity::random_token();
        let browser = super::identity::random_token();
        let verifier = super::identity::random_token();
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let url = oauth.authorization_url(&provider, &state, &challenge)?;
        if let Some(email) = &email {
            normalize_email(email)?;
        }
        if let Some(name) = &display_name {
            text(name, 160)?;
        }
        let encrypted=self.seal(&json!({"provider":provider,"verifier":verifier,"email":email,"display_name":display_name,"consent_revision":consent_revision,"invitation_code":invitation_code}),&format!("oauth:{state}"))?;
        self.store
            .save_oauth(OAuthAttempt {
                digest: Sha256::digest(state.as_bytes()).into(),
                browser_digest: Sha256::digest(browser.as_bytes()).into(),
                encrypted,
            })
            .await?;
        Ok((url, browser))
    }
    pub async fn complete_oauth(
        &self,
        state: String,
        browser: String,
        provider: String,
        code: SecretString,
        identity: &super::identity::IdentityService,
    ) -> IdentityResult<Option<crate::model::identity_access::IdentitySessionGrant>> {
        if state.len() != 43
            || browser.len() != 43
            || code.expose_secret().is_empty()
            || code.expose_secret().len() > 4096
        {
            return Err(IdentityError::Invalid);
        }
        let encrypted = self
            .store
            .take_oauth(
                Sha256::digest(state.as_bytes()).into(),
                Sha256::digest(browser.as_bytes()).into(),
            )
            .await?;
        if !(29..=8192).contains(&encrypted.len()) {
            return Err(IdentityError::Unavailable);
        }
        let mut nonce = [0u8; 12];
        nonce.copy_from_slice(&encrypted[..12]);
        let mut body = encrypted[12..].to_vec();
        let aad = format!("oauth:{state}");
        let plain = self
            .key()?
            .open_in_place(
                Nonce::assume_unique_for_key(nonce),
                Aad::from(aad.as_bytes()),
                &mut body,
            )
            .map_err(|_| IdentityError::Unavailable)?;
        #[derive(Deserialize)]
        struct Attempt {
            invitation_code: Option<String>,
            provider: String,
            verifier: SecretString,
            email: Option<String>,
            display_name: Option<String>,
            consent_revision: Option<u64>,
        }
        let attempt: Attempt =
            serde_json::from_slice(plain).map_err(|_| IdentityError::Unavailable)?;
        if attempt.provider != provider {
            return Err(IdentityError::Invalid);
        }
        let subject = self
            .configured_oauth()
            .await?
            .exchange(&provider, code, attempt.verifier)
            .await?;
        if subject.provider != provider || subject.subject.is_empty() || subject.subject.len() > 256
        {
            return Err(IdentityError::Unavailable);
        }
        let policy = self.store.registration_policy().await?;
        if !policy.enabled_providers.contains(&provider) {
            return Err(IdentityError::Forbidden);
        }
        if let Some(credential) = self
            .store
            .external_credential(&provider, &subject.subject)
            .await?
        {
            return identity
                .external_session(credential, attempt.consent_revision)
                .await
                .map(Some);
        }
        let policy = self.store.registration_policy().await?;
        if !self
            .store
            .security_document(None)
            .await?
            .policy
            .identity_binding_enabled
        {
            return Err(IdentityError::Forbidden);
        }
        let email = normalize_email(&attempt.email.ok_or(IdentityError::Invalid)?)?;
        let name = attempt.display_name.ok_or(IdentityError::Invalid)?;
        text(&name, 160)?;
        if (!policy.registration_enabled
            && attempt
                .invitation_code
                .as_deref()
                .is_none_or(|v| v.trim().is_empty()))
            || !policy.permits_email(&email)
        {
            return Err(IdentityError::Forbidden);
        }
        let password_hash = hash_password(
            self.password_capacity.clone(),
            SecretString::from(super::identity::random_token()),
        )
        .await?;
        let external = Some((provider, subject.subject));
        let challenge=self.issue(ChallengePurpose::Registration,&email,json!({"email":email,"display_name":name,"password_hash":password_hash.expose_secret(),"external_identity":external,"consent_revision":attempt.consent_revision,"invitation_code":attempt.invitation_code})).await?;
        self.store
            .register(
                PreparedRegistration {
                    invitation_code: attempt.invitation_code,
                    email,
                    display_name: name,
                    password_hash,
                    external_identity: external,
                    consent_revision: attempt.consent_revision,
                },
                Some(challenge),
            )
            .await?;
        Ok(None)
    }

    pub async fn deliver_notification(&self) -> IdentityResult<()> {
        let Some(sender) = &self.notification_sender else {
            return Ok(());
        };
        if !sender.available().await {
            return Ok(());
        }
        let Some(item) = self.store.claim_notification().await? else {
            if let Some((id, email, summary)) = self.store.claim_audit_notification().await? {
                tokio::time::timeout(
                    std::time::Duration::from_secs(30),
                    sender.send(crate::ports::identity_notification::IdentityNotification {
                        email,
                        purpose: "content_audit".to_owned(),
                        token: SecretString::from(summary),
                        variables: json!({}),
                    }),
                )
                .await
                .map_err(|_| IdentityError::Unavailable)??;
                self.store.finish_audit_notification(id).await?;
            }
            return Ok(());
        };
        let result = async {
            if !(29..=8192).contains(&item.encrypted.len()) {
                return Err(IdentityError::Unavailable);
            }
            let mut nonce = [0u8; 12];
            nonce.copy_from_slice(&item.encrypted[..12]);
            let mut body = item.encrypted[12..].to_vec();
            let aad = format!("notification:{}", item.id);
            let plain = self
                .key()?
                .open_in_place(
                    Nonce::assume_unique_for_key(nonce),
                    Aad::from(aad.as_bytes()),
                    &mut body,
                )
                .map_err(|_| IdentityError::Unavailable)?;
            #[derive(Deserialize)]
            struct Message {
                email: String,
                purpose: String,
                token: SecretString,
                #[serde(default)]
                expires_in_seconds: u64,
            }
            let message: Message =
                serde_json::from_slice(plain).map_err(|_| IdentityError::Unavailable)?;
            tokio::time::timeout(
                std::time::Duration::from_secs(30),
                sender.send(crate::ports::identity_notification::IdentityNotification {
                    email: message.email,
                    purpose: message.purpose,
                    token: message.token,
                    variables: json!({"expires_in_minutes":message.expires_in_seconds/60}),
                }),
            )
            .await
            .map_err(|_| IdentityError::Unavailable)?
        }
        .await;
        self.store
            .finish_notification(item.id, item.lease, result.is_ok())
            .await?;
        result
    }

    async fn budget(&self, purpose: &str, email: &str, source: IpAddr) -> IdentityResult<()> {
        self.identity
            .consume_auth_attempt(
                source,
                Sha256::digest(format!("{purpose}:{email}").as_bytes()).into(),
            )
            .await
    }
    async fn issue(
        &self,
        purpose: ChallengePurpose,
        email: &str,
        payload: Value,
    ) -> IdentityResult<LifecycleChallenge> {
        let expires_in_seconds = if matches!(purpose, ChallengePurpose::Registration) {
            u64::from(
                self.store
                    .security_document(None)
                    .await?
                    .policy
                    .pending_identity_hours,
            ) * 3600
        } else {
            1200
        };
        let id = Uuid::now_v7();
        let mut bytes = [0u8; 32];
        OsRng
            .try_fill_bytes(&mut bytes)
            .map_err(|_| IdentityError::Unavailable)?;
        let token = SecretString::from(URL_SAFE_NO_PAD.encode(bytes));
        let encrypted_payload =
            self.seal(&payload, &format!("challenge:{}:{id}", purpose.as_str()))?;
        let encrypted_notification = self.seal(
            &json!({
                "format":"ovload.identity_notification.v1","purpose":purpose.as_str(),"email":email,
                "token":token.expose_secret(),"expires_in_seconds":expires_in_seconds,
            }),
            &format!("notification:{id}"),
        )?;
        Ok(LifecycleChallenge {
            id,
            purpose,
            token_digest: challenge_digest(purpose, token.expose_secret())?,
            email_digest: Sha256::digest(email.as_bytes()).into(),
            encrypted_payload,
            encrypted_notification,
        })
    }
    pub(super) fn key(&self) -> IdentityResult<LessSafeKey> {
        let key = self
            .notification_key
            .as_ref()
            .ok_or(IdentityError::Unavailable)?;
        Ok(LessSafeKey::new(
            UnboundKey::new(&AES_256_GCM, key.expose_secret())
                .map_err(|_| IdentityError::Unavailable)?,
        ))
    }
    pub(super) fn seal(&self, payload: &Value, aad: &str) -> IdentityResult<Vec<u8>> {
        let mut body = serde_json::to_vec(payload).map_err(|_| IdentityError::Unavailable)?;
        if body.len() > 8000 {
            return Err(IdentityError::Invalid);
        }
        let mut nonce = [0u8; 12];
        OsRng
            .try_fill_bytes(&mut nonce)
            .map_err(|_| IdentityError::Unavailable)?;
        self.key()?
            .seal_in_place_append_tag(
                Nonce::assume_unique_for_key(nonce),
                Aad::from(aad.as_bytes()),
                &mut body,
            )
            .map_err(|_| IdentityError::Unavailable)?;
        let mut result = Vec::with_capacity(12 + body.len());
        result.extend_from_slice(&nonce);
        result.extend_from_slice(&body);
        Ok(result)
    }
    fn open(&self, challenge: &ChallengeRecord) -> IdentityResult<Value> {
        if !(29..=8192).contains(&challenge.encrypted_payload.len()) {
            return Err(IdentityError::Unavailable);
        }
        let mut nonce = [0u8; 12];
        nonce.copy_from_slice(&challenge.encrypted_payload[..12]);
        let mut body = challenge.encrypted_payload[12..].to_vec();
        let aad = format!("challenge:{}:{}", challenge.purpose.as_str(), challenge.id);
        let plaintext = self
            .key()?
            .open_in_place(
                Nonce::assume_unique_for_key(nonce),
                Aad::from(aad.as_bytes()),
                &mut body,
            )
            .map_err(|_| IdentityError::Unavailable)?;
        serde_json::from_slice(plaintext).map_err(|_| IdentityError::Unavailable)
    }
}

fn challenge_digest(purpose: ChallengePurpose, token: &str) -> IdentityResult<[u8; 32]> {
    if token.len() != 43 {
        return Err(IdentityError::Invalid);
    }
    let bytes = URL_SAFE_NO_PAD
        .decode(token)
        .map_err(|_| IdentityError::Invalid)?;
    if bytes.len() != 32 || URL_SAFE_NO_PAD.encode(&bytes) != token {
        return Err(IdentityError::Invalid);
    }
    Ok(Sha256::digest(format!("ovload.identity.{}:{token}", purpose.as_str()).as_bytes()).into())
}
fn actor(current: &IdentitySession) -> IdentityResult<IdentityManagementActor> {
    let IdentityOwner::Management(principal_id) = current.owner else {
        return Err(IdentityError::Forbidden);
    };
    Ok(IdentityManagementActor {
        principal_id,
        session_id: current.id,
        authority_generation: current.authority_generation,
    })
}

pub(crate) struct NotificationTask(
    pub Arc<IdentityLifecycleService>,
    pub Arc<super::application_settings::ApplicationSettingsService>,
);
impl ovload_core::task::ScheduledTask for NotificationTask {
    fn run_cycle(
        &self,
        _context: ovload_core::task::WorkerCycleContext,
    ) -> futures::future::BoxFuture<'_, Result<(), ovload_core::task::WorkerTaskError>> {
        Box::pin(async move {
            let lifecycle = self.0.deliver_notification().await;
            let integration = self.1.deliver_mail().await;
            lifecycle.and(integration).map_err(|_| {
                ovload_core::task::WorkerTaskError::safe("identity notification delivery failed")
            })
        })
    }
}

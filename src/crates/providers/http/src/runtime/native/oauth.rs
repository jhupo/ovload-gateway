//! PKCE authorization, owner-bound pending flows and revision-fenced token refresh.
use super::super::{Credential, PublicApiProvider};
use super::oauth_http::{self, Stage};
use super::profile::ANTIGRAVITY_USER_AGENT;
use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, TimeDelta, Utc};
use ovload_admin::{
    model::{AdminError, Revision, accounts::CredentialState, provider_credentials::*},
    ports::provider::{ProviderAdminError, ProviderAdminErrorKind},
};
use ovload_core::{
    account::{OpaqueProviderData, OutboundProxy, ProviderAccount, ProviderAccountId},
    provider_ports::*,
    routing::ProviderKind,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{sync::{Arc, OnceLock}, time::Duration};

const CLAUDE_CLIENT: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const GEMINI_CLIENT_ID_ENV: &str = "CPR_ANTIGRAVITY_CLIENT_ID";
const GEMINI_CLIENT_SECRET_ENV: &str = "CPR_ANTIGRAVITY_CLIENT_SECRET";
const CLAUDE_REDIRECT: &str = "http://localhost:54545/callback";
const GEMINI_REDIRECT: &str = "https://antigravity.google/oauth-callback";
const GEMINI_SCOPES: &str = "openid https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/cclog https://www.googleapis.com/auth/experimentsandconfigs";
const GEMINI_OAUTH_CONFIG_MESSAGE: &str = "Gemini OAuth 服务端未配置 Antigravity 客户端凭据，请检查 CPR_ANTIGRAVITY_CLIENT_ID 与 CPR_ANTIGRAVITY_CLIENT_SECRET";

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(in super::super) struct Tokens {
    pub refresh_token: String,
    pub expires_at: DateTime<Utc>,
    pub project: Option<String>,
    pub subject: String,
    pub email: Option<String>,
}

fn failure(kind: ProviderAdminErrorKind) -> ProviderAdminError {
    ProviderAdminError::new(kind)
}
fn invalid() -> ProviderAdminError {
    failure(ProviderAdminErrorKind::Invalid)
}
fn unavailable() -> ProviderAdminError {
    failure(ProviderAdminErrorKind::Unavailable)
}
fn upstream() -> ProviderAdminError {
    failure(ProviderAdminErrorKind::BadGateway)
}
fn binding(value: &str) -> Result<OAuthPendingBinding, ProviderAdminError> {
    OAuthPendingBinding::try_new(value).map_err(|_| invalid())
}
fn random() -> Result<String, ProviderAdminError> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| unavailable())?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}
fn owner(owner: &AuthorizationOwner) -> String {
    let value = match owner {
        AuthorizationOwner::ManagementSession { principal_id } => {
            format!("management:{principal_id}")
        }
        AuthorizationOwner::AdminSession { admin_user_id } => format!("admin:{admin_user_id}"),
        AuthorizationOwner::AdminApiKey => "key".into(),
        AuthorizationOwner::System => "system".into(),
    };
    hex::encode(Sha256::digest(value))
}
fn token_url(kind: &str) -> &'static str {
    if kind == "claude" {
        "https://platform.claude.com/v1/oauth/token"
    } else {
        "https://oauth2.googleapis.com/token"
    }
}
fn redirect(kind: &str) -> &'static str {
    if kind == "claude" {
        CLAUDE_REDIRECT
    } else {
        GEMINI_REDIRECT
    }
}

fn configured_gemini_client_id() -> &'static str {
    static VALUE: OnceLock<String> = OnceLock::new();
    VALUE
        .get_or_init(|| std::env::var(GEMINI_CLIENT_ID_ENV).unwrap_or_default())
        .as_str()
}

fn configured_gemini_secret() -> Result<String, ProviderAdminError> {
    let value = std::env::var(GEMINI_CLIENT_SECRET_ENV).map_err(|_| invalid())?;
    if value.trim().is_empty() {
        return Err(invalid());
    }
    Ok(value)
}

fn ensure_gemini_oauth_config() -> Result<(), ProviderAdminError> {
    if configured_gemini_client_id().trim().is_empty() {
        return Err(
            ProviderAdminError::new(ProviderAdminErrorKind::Unavailable)
                .with_public_message(GEMINI_OAUTH_CONFIG_MESSAGE),
        );
    }
    configured_gemini_secret().map(|_| ())
}

fn client_id(kind: &str) -> &'static str {
    if kind == "claude" {
        CLAUDE_CLIENT
    } else {
        configured_gemini_client_id()
    }
}
fn client(proxy: Option<&OutboundProxy>) -> Result<reqwest::Client, ProviderAdminError> {
    let mut builder = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .timeout(Duration::from_secs(30));
    if let Some(proxy) = proxy {
        builder = builder.proxy(reqwest::Proxy::all(proxy.expose_url()).map_err(|_| invalid())?);
    }
    provider_openai::transport::tls::build_reqwest_client_with_custom_ca(builder)
        .map_err(|_| unavailable())
}
struct PendingGuard {
    port: Arc<dyn OAuthPendingFlowPort>,
    kind: ProviderKind,
    flow: OAuthPendingBinding,
    owner: OAuthPendingBinding,
    claim: OAuthPendingBinding,
}
#[async_trait]
impl AuthorizationCommitGuard for PendingGuard {
    async fn commit(self: Box<Self>) -> Result<(), AdminError> {
        match self
            .port
            .consume_claim(&self.kind, &self.flow, &self.owner, &self.claim)
            .await
            .map_err(|_| AdminError::unavailable("授权状态暂时无法确认"))?
        {
            OAuthPendingConsumeOutcome::Consumed => Ok(()),
            _ => Err(AdminError::conflict("授权状态已发生变化")),
        }
    }
    async fn abort(self: Box<Self>) -> Result<(), AdminError> {
        match self
            .port
            .release_claim(&self.kind, &self.flow, &self.owner, &self.claim)
            .await
            .map_err(|_| AdminError::unavailable("授权状态暂时无法释放"))?
        {
            OAuthPendingReleaseOutcome::Released => Ok(()),
            _ => Err(AdminError::conflict("授权状态已发生变化")),
        }
    }
}
pub(super) struct RefreshGuard {
    _lease: Box<dyn ProviderLeaseGuard>,
    _capacity: Box<dyn ProviderLeaseGuard>,
}
impl CredentialCommitGuard for RefreshGuard {
    fn finish(self: Box<Self>) {}
}
struct NoopGuard;
impl CredentialCommitGuard for NoopGuard {
    fn finish(self: Box<Self>) {}
}

impl PublicApiProvider {
    pub(in super::super) async fn native_start(
        &self,
        pending: PendingAuthorizationMutation,
    ) -> Result<AuthorizationStarted, ProviderAdminError> {
        if !super::is_native(self.kind.as_str()) || pending.provider_kind() != &self.kind {
            return Err(invalid());
        }
        if self.kind.as_str() == "gemini" {
            ensure_gemini_oauth_config()?;
        }
        if let AuthorizationMutationTarget::Reauthorize { account_id } = pending.target() {
            let account = self.account(account_id).await.map_err(|_| invalid())?;
            if account.authentication_kind() != "oauth" {
                return Err(invalid());
            }
        }
        let state = random()?;
        let verifier = random()?;
        let flow_id = random()?;
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let expires_at = Utc::now() + TimeDelta::minutes(30);
        let mut url = reqwest::Url::parse(if self.kind.as_str() == "claude" {
            "https://claude.ai/oauth/authorize"
        } else {
            "https://accounts.google.com/o/oauth2/v2/auth"
        })
        .map_err(|_| invalid())?;
        url.query_pairs_mut().extend_pairs([("client_id",client_id(self.kind.as_str())),("response_type","code"),("redirect_uri",redirect(self.kind.as_str())),("code_challenge",&challenge),("code_challenge_method","S256"),("state",&state),("scope",if self.kind.as_str()=="claude" {"user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload"}else{GEMINI_SCOPES})]);
        if self.kind.as_str() == "gemini" {
            url.query_pairs_mut()
                .append_pair("access_type", "offline")
                .append_pair("prompt", "consent");
        } else {
            url.query_pairs_mut().append_pair("code", "true");
        }
        let payload = super::profile::object(
            json!({"mutation":pending.to_storage_v1(),"verifier":verifier,"state":state,"expiresAt":expires_at}),
        );
        let flow = NewOAuthPendingFlow::try_new(
            self.kind.clone(),
            binding(&flow_id)?,
            binding(&owner(pending.owner_binding().owner()))?,
            Duration::from_secs(1800),
            payload,
        )
        .map_err(|_| invalid())?;
        match self
            .ports
            .oauth_pending()
            .put_if_absent(flow)
            .await
            .map_err(|_| unavailable())?
        {
            OAuthPendingPutOutcome::Stored => Ok(AuthorizationStarted {
                flow_id,
                authorization_url: url.to_string(),
                expires_at,
            }),
            _ => Err(failure(ProviderAdminErrorKind::Conflict)),
        }
    }
    pub(in super::super) async fn native_complete(
        &self,
        command: CompleteAuthorization,
    ) -> Result<PreparedAuthorizationCommit, ProviderAdminError> {
        let guard = Box::new(PendingGuard {
            port: self.ports.oauth_pending(),
            kind: self.kind.clone(),
            flow: binding(&command.flow_id)?,
            owner: binding(&owner(
                AuthorizationOwnerBinding::from_context(&command.context).owner(),
            ))?,
            claim: binding(&random()?)?,
        });
        let payload = match guard
            .port
            .claim_if_owner(
                &guard.kind,
                &guard.flow,
                &guard.owner,
                &guard.claim,
                Duration::from_secs(120),
            )
            .await
            .map_err(|_| unavailable())?
        {
            OAuthPendingClaimOutcome::Claimed(payload) => payload,
            OAuthPendingClaimOutcome::InProgress => {
                return Err(failure(ProviderAdminErrorKind::Conflict));
            }
            _ => return Err(failure(ProviderAdminErrorKind::NotFound)),
        };
        let result = tokio::time::timeout(
            Duration::from_secs(90),
            self.complete_claimed(&command, &payload),
        )
        .await
        .map_err(|_| unavailable())
        .and_then(|result| result);
        match result {
            Ok(prepared) => Ok(prepared.with_authorization_guard(guard)),
            Err(error) => {
                guard.abort().await.map_err(|_| unavailable())?;
                Err(error)
            }
        }
    }
    async fn complete_claimed(
        &self,
        command: &CompleteAuthorization,
        payload: &OpaqueProviderData,
    ) -> Result<PreparedAuthorizationCommit, ProviderAdminError> {
        let data = payload.expose_to_provider();
        let pending = PendingAuthorizationMutation::from_storage_v1(
            data.get("mutation").cloned().ok_or_else(invalid)?,
        )
        .map_err(|_| invalid())?;
        if pending.provider_kind() != &self.kind
            || !pending.owner_binding().matches_context(&command.context)
        {
            return Err(invalid());
        }
        let expires: DateTime<Utc> =
            serde_json::from_value(data.get("expiresAt").cloned().ok_or_else(invalid)?)
                .map_err(|_| invalid())?;
        if expires <= Utc::now() {
            return Err(invalid());
        }
        let state = data
            .get("state")
            .and_then(Value::as_str)
            .ok_or_else(invalid)?;
        let code = callback_code(self.kind.as_str(), &command.callback_url, state)?;
        let verifier = data
            .get("verifier")
            .and_then(Value::as_str)
            .ok_or_else(invalid)?;
        let client = client(pending.outbound_proxy())?;
        let mut body = json!({"grant_type":"authorization_code","client_id":client_id(self.kind.as_str()),"code":code,"redirect_uri":redirect(self.kind.as_str()),"code_verifier":verifier});
        if self.kind.as_str() == "gemini" {
            ensure_gemini_oauth_config()?;
            body["client_secret"] = json!(configured_gemini_secret()?);
        } else {
            body["state"] = json!(state);
        }
        let response = token_request(&client, self.kind.as_str(), &body).await?;
        let mut credential = tokens(self.kind.as_str(), response, None)?;
        let identity = if self.kind.as_str() == "gemini" {
            oauth_http::json(
                client
                    .get("https://www.googleapis.com/oauth2/v3/userinfo")
                    .bearer_auth(&credential.api_key),
                self.kind.as_str(),
                Stage::Profile,
            )
            .await?
        } else {
            oauth_http::json(
                client
                    .get("https://api.anthropic.com/api/oauth/profile")
                    .bearer_auth(&credential.api_key)
                    .header("anthropic-version", "2023-06-01"),
                self.kind.as_str(),
                Stage::Profile,
            )
            .await?
        };
        let token = credential.oauth.as_mut().ok_or_else(invalid)?;
        token.subject = if self.kind.as_str() == "gemini" {
            identity.get("sub")
        } else {
            identity
                .get("account")
                .and_then(|account| account.get("uuid"))
        }
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty() && id.len() <= 512)
        .ok_or_else(upstream)?
        .to_owned();
        token.email = if self.kind.as_str() == "gemini" {
            identity.get("email")
        } else {
            identity
                .get("account")
                .and_then(|account| account.get("email"))
        }
        .and_then(Value::as_str)
        .map(str::to_owned);
        let plan_type = if self.kind.as_str() == "gemini" {
            let binding = project(&client, &credential.api_key).await?;
            token.project = Some(binding.project_id);
            binding.plan_type
        } else {
            None
        };
        let prepared = match pending.target() {
            AuthorizationMutationTarget::Create { name } => {
                PreparedAuthorizationCredential::Create(Box::new(create(
                    self,
                    name,
                    credential,
                    pending.outbound_proxy().cloned(),
                    plan_type,
                )?))
            }
            AuthorizationMutationTarget::Reauthorize { account_id } => {
                let account = self.account(account_id).await.map_err(|_| invalid())?;
                if account.upstream_user_id() != Some(token.subject.as_str()) {
                    return Err(failure(ProviderAdminErrorKind::Conflict));
                }
                PreparedAuthorizationCredential::Reauthorize(Box::new(rotation(
                    self,
                    &account,
                    credential,
                    Box::new(NoopGuard),
                    plan_type,
                )?))
            }
        };
        Ok(PreparedAuthorizationCommit::new(pending, prepared))
    }
    pub(in super::super) async fn native_refresh(
        &self,
        command: PrepareCredentialRefresh,
    ) -> Result<PreparedCredentialRotation, ProviderAdminError> {
        let id = ProviderAccountId::new(command.account.id.clone()).map_err(|_| invalid())?;
        let account = self.account(&id).await.map_err(|_| invalid())?;
        if account.revision().get() != command.account.credential_revision.get() {
            return Err(failure(ProviderAdminErrorKind::Conflict));
        }
        let (credential, guard) = self.refresh_tokens(&account).await?;
        rotation(self, &account, credential, Box::new(guard), None)
    }
    async fn refresh_tokens(
        &self,
        account: &ProviderAccount,
    ) -> Result<(Credential, RefreshGuard), ProviderAdminError> {
        if account.provider() != &self.kind || account.authentication_kind() != "oauth" {
            return Err(invalid());
        }
        let policy = self
            .ports
            .runtime_policy()
            .load_refresh_policy()
            .await
            .map_err(|_| unavailable())?;
        let capacity = match self
            .ports
            .leases()
            .try_acquire(ProviderLeaseRequest::RefreshCapacity(
                ProviderRefreshCapacityRequest::new(policy.concurrency()),
            ))
            .await
            .map_err(|_| unavailable())?
        {
            ProviderLeaseAcquisition::Acquired(guard) => guard,
            _ => return Err(failure(ProviderAdminErrorKind::Conflict)),
        };
        let lease = match self
            .ports
            .leases()
            .try_acquire(ProviderLeaseRequest::Refresh(
                ProviderRefreshLeaseRequest::new(account.id().clone(), account.revision()),
            ))
            .await
            .map_err(|_| unavailable())?
        {
            ProviderLeaseAcquisition::Acquired(guard) => guard,
            _ => return Err(failure(ProviderAdminErrorKind::Conflict)),
        };
        let loaded = self
            .ports
            .accounts()
            .load_credential(account.id(), account.revision())
            .await
            .map_err(|_| failure(ProviderAdminErrorKind::Conflict))?;
        let credential =
            Credential::decode(loaded.credential.expose_to_provider()).map_err(|_| invalid())?;
        let current = credential.oauth.ok_or_else(invalid)?;
        let mut body = json!({"grant_type":"refresh_token","client_id":client_id(self.kind.as_str()),"refresh_token":current.refresh_token});
        if self.kind.as_str() == "gemini" {
            ensure_gemini_oauth_config()?;
            body["client_secret"] = json!(configured_gemini_secret()?);
        }
        let response = token_request(
            &client(account.outbound_proxy())?,
            self.kind.as_str(),
            &body,
        )
        .await?;
        Ok((
            tokens(self.kind.as_str(), response, Some(current))?,
            RefreshGuard {
                _lease: lease,
                _capacity: capacity,
            },
        ))
    }
    pub(in super::super) async fn native_fresh_account(
        &self,
        account: ProviderAccount,
    ) -> Result<ProviderAccount, ovload_core::error::ProviderError> {
        use ovload_core::account::{
            CredentialCasOutcome, CredentialCasUpdate, PlaintextCredential, ProviderAccountUpdate,
        };
        if !super::is_native(self.kind.as_str()) || account.authentication_kind() != "oauth" {
            return Ok(account);
        }
        let policy = self
            .ports
            .runtime_policy()
            .load_refresh_policy()
            .await
            .map_err(|_| super::invalid())?;
        if account
            .access_token_expires_at()
            .is_some_and(|expires| expires > std::time::SystemTime::now() + policy.margin())
        {
            return Ok(account);
        }
        let (credential, _guard) = match self.refresh_tokens(&account).await {
            Ok(refreshed) => refreshed,
            Err(_) => {
                // Another request may own the refresh lease. Re-read its committed revision,
                // or retain the current token while it is still valid beyond request setup.
                let latest = self.account(account.id()).await?;
                if latest.access_token_expires_at().is_some_and(|expires| {
                    expires > std::time::SystemTime::now() + Duration::from_secs(30)
                }) {
                    return Ok(latest);
                }
                return Err(super::super::error(
                    ovload_core::error::ProviderErrorKind::ProviderInfrastructureUnavailable,
                    ovload_core::upstream::UpstreamSendState::NotSent,
                ));
            }
        };
        let token = credential.oauth.as_ref().ok_or_else(super::invalid)?;
        let fields = serde_json::to_value(&credential)
            .map_err(|_| super::invalid())?
            .as_object()
            .cloned()
            .ok_or_else(super::invalid)?;
        let update = CredentialCasUpdate::new(
            account.id().clone(),
            account.revision(),
            ProviderAccountUpdate {
                account_id: account.id().clone(),
                name: account.name().to_owned(),
                email: account.email().map(str::to_owned),
                plan_type: account.plan_type().map(str::to_owned),
            },
            PlaintextCredential::new(fields),
            true,
            Some(token.expires_at.into()),
            None,
        )
        .map_err(|_| super::invalid())?
        .preserving_profile();
        match self
            .ports
            .accounts()
            .compare_and_swap_credential(update)
            .await
            .map_err(|_| super::invalid())?
        {
            CredentialCasOutcome::Updated(_) => self.account(account.id()).await,
            CredentialCasOutcome::Conflict => Err(super::super::error(
                ovload_core::error::ProviderErrorKind::ProviderInfrastructureUnavailable,
                ovload_core::upstream::UpstreamSendState::NotSent,
            )),
        }
    }
}

fn callback_code(kind: &str, callback: &str, state: &str) -> Result<String, ProviderAdminError> {
    let callback = callback.trim();
    if callback.is_empty() || callback.len() > 16_384 || callback.chars().any(char::is_control) {
        return Err(invalid());
    }
    if callback.contains("://") {
        let url = reqwest::Url::parse(callback).map_err(|_| invalid())?;
        let expected = reqwest::Url::parse(redirect(kind)).map_err(|_| invalid())?;
        let hosted = url.origin() == expected.origin() && url.path() == expected.path();
        let local = kind == "gemini"
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
            && url.port().is_some()
            && matches!(url.path(), "/oauth-callback" | "/auth/callback");
        if (!hosted && !local)
            || !url.username().is_empty()
            || url.password().is_some()
            || url.fragment().is_some()
        {
            return Err(invalid());
        }
        let values = url.query_pairs().collect::<Vec<_>>();
        let states = values
            .iter()
            .filter(|(key, _)| key == "state")
            .collect::<Vec<_>>();
        let codes = values
            .iter()
            .filter(|(key, _)| key == "code")
            .collect::<Vec<_>>();
        if codes.len() != 1
            || codes[0].1.is_empty()
            || states.len() != 1
            || states[0].1 != state
            || values.iter().any(|(key, _)| key == "error")
        {
            return Err(invalid());
        }
        return Ok(codes[0].1.to_string());
    }
    // The official manual auth page exposes a code, still bound by PKCE and owner.
    if let Some((code, returned_state)) = callback.split_once('#') {
        if returned_state != state || code.is_empty() {
            return Err(invalid());
        }
        return Ok(code.to_owned());
    }
    if callback.contains(char::is_whitespace) {
        return Err(invalid());
    }
    Ok(callback.to_owned())
}
async fn token_request(
    client: &reqwest::Client,
    kind: &str,
    body: &Value,
) -> Result<Value, ProviderAdminError> {
    let request = client.post(token_url(kind));
    let request = if kind == "gemini" {
        request.form(body.as_object().ok_or_else(invalid)?)
    } else {
        request.json(body)
    };
    oauth_http::json(request, kind, Stage::Token).await
}
fn tokens(
    kind: &str,
    value: Value,
    previous: Option<Tokens>,
) -> Result<Credential, ProviderAdminError> {
    let access = value
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(upstream)?
        .to_owned();
    let refresh = value
        .get("refresh_token")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| previous.as_ref().map(|tokens| tokens.refresh_token.clone()))
        .ok_or_else(upstream)?;
    let expires = value
        .get("expires_in")
        .and_then(Value::as_u64)
        .filter(|seconds| *seconds > 0 && *seconds <= 31_536_000)
        .ok_or_else(upstream)?;
    if refresh.is_empty() || refresh.len() > 16_384 || refresh.chars().any(char::is_control) {
        return Err(upstream());
    }
    let credential = Credential {
        schema_version: 1,
        api_key: access,
        base_url: if kind == "claude" {
            "https://api.anthropic.com/v1"
        } else {
            "https://cloudcode-pa.googleapis.com"
        }
        .into(),
        oauth: Some(Tokens {
            refresh_token: refresh,
            expires_at: Utc::now() + TimeDelta::seconds(expires as i64),
            project: previous.as_ref().and_then(|tokens| tokens.project.clone()),
            subject: previous
                .as_ref()
                .map_or_else(String::new, |tokens| tokens.subject.clone()),
            email: previous.and_then(|tokens| tokens.email),
        }),
    };
    credential.validate().map_err(|_| upstream())?;
    Ok(credential)
}
fn create(
    provider: &PublicApiProvider,
    name: &str,
    credential: Credential,
    proxy: Option<OutboundProxy>,
    plan_type: Option<&str>,
) -> Result<PreparedCredentialCreate, ProviderAdminError> {
    let token = credential.oauth.as_ref().ok_or_else(invalid)?;
    Ok(PreparedCredentialCreate {
        model_access: None,
        outbound_proxy: proxy,
        account_id: ProviderAccountId::new(format!("acct_{}", uuid::Uuid::now_v7().simple()))
            .map_err(|_| invalid())?,
        provider_kind: provider.kind.clone(),
        name: name.into(),
        email: token.email.clone(),
        upstream_user_id: Some(token.subject.clone()),
        upstream_account_id: Some(token.subject.clone()),
        plan_type: plan_type.map(str::to_owned),
        authentication_kind: "oauth".into(),
        provider_material: credential.document()?,
        has_refresh_token: true,
        access_token_expires_at: Some(token.expires_at),
        next_refresh_at: None,
        enabled: true,
        credential_state: CredentialState::Ready,
        credential_observed_at: Utc::now(),
    })
}
fn rotation(
    provider: &PublicApiProvider,
    account: &ProviderAccount,
    credential: Credential,
    guard: Box<dyn CredentialCommitGuard>,
    plan_type: Option<&str>,
) -> Result<PreparedCredentialRotation, ProviderAdminError> {
    let token = credential.oauth.as_ref().ok_or_else(invalid)?;
    Ok(PreparedCredentialRotation::new(
        PreparedCredentialRotationFacts {
            account_id: account.id().clone(),
            provider_kind: provider.kind.clone(),
            expected_credential_revision: Revision::new(account.revision().get())
                .map_err(|_| invalid())?,
            replacement_identity: None,
            name: account.name().into(),
            email: account.email().map(str::to_owned),
            plan_type: plan_type.or_else(|| account.plan_type()).map(str::to_owned),
            preserve_profile: plan_type.is_none(),
            preserve_credential_state: false,
            provider_material: credential.document()?,
            has_refresh_token: true,
            access_token_expires_at: Some(token.expires_at),
            next_refresh_at: None,
        },
        guard,
    ))
}
struct GeminiProjectBinding {
    project_id: String,
    plan_type: Option<&'static str>,
}

fn gemini_plan_type(value: &Value) -> Option<&'static str> {
    let tier = value
        .pointer("/paidTier/id")
        .and_then(Value::as_str)
        .or_else(|| value.pointer("/currentTier/id").and_then(Value::as_str))?;
    match tier {
        "free-tier" => Some("free"),
        "g1-pro-tier" => Some("pro"),
        "g1-ultra-tier" => Some("ultra"),
        "standard-tier" | "gcp-standard-tier" => Some("standard"),
        "gcp-enterprise-tier" => Some("enterprise"),
        _ => None,
    }
}

async fn project(
    client: &reqwest::Client,
    access: &str,
) -> Result<GeminiProjectBinding, ProviderAdminError> {
    // Keep this request aligned with Antigravity CLI's Code Assist setup flow. The
    // project hint is optional for the managed free tier, but must be sent to
    // both calls when an account is configured with a user-owned project.
    let project_hint = std::env::var("GOOGLE_CLOUD_PROJECT")
        .or_else(|_| std::env::var("GOOGLE_CLOUD_PROJECT_ID"))
        .ok()
        .filter(|value| !value.trim().is_empty());
    project_at(
        client,
        access,
        project_hint.as_deref(),
        "https://cloudcode-pa.googleapis.com/v1internal",
        Some("https://daily-cloudcode-pa.googleapis.com/v1internal"),
        "https://cloudresourcemanager.googleapis.com/v1/projects",
    )
    .await
}

fn load_project_request(
    client: &reqwest::Client,
    access: &str,
    endpoint: &str,
    body: &Value,
) -> reqwest::RequestBuilder {
    client
        .post(format!("{endpoint}:loadCodeAssist"))
        .bearer_auth(access)
        .header(reqwest::header::USER_AGENT, ANTIGRAVITY_USER_AGENT)
        .json(body)
}

async fn project_at(
    client: &reqwest::Client,
    access: &str,
    project_hint: Option<&str>,
    endpoint: &str,
    fallback_endpoint: Option<&str>,
    projects_url: &str,
) -> Result<GeminiProjectBinding, ProviderAdminError> {
    let mut load = json!({"metadata":{"ideType":"ANTIGRAVITY"}});
    if let Some(project) = project_hint {
        load["cloudaicompanionProject"] = json!(project);
        load["metadata"]["duetProject"] = json!(project);
    }
    let (endpoint, value) = match oauth_http::json_with_endpoint_fallback(
        load_project_request(client, access, endpoint, &load),
        "gemini",
        Stage::LoadProject,
    )
    .await
    {
        Ok(value) => (endpoint, value),
        Err((_, true)) if let Some(fallback) = fallback_endpoint => (
            fallback,
            oauth_http::json(
                load_project_request(client, access, fallback, &load),
                "gemini",
                Stage::LoadProject,
            )
            .await?,
        ),
        Err((error, _)) => return Err(error),
    };
    let binding = |project_id| GeminiProjectBinding {
        project_id,
        plan_type: gemini_plan_type(&value),
    };
    if let Some(project) = project_id(&value) {
        return Ok(binding(project));
    }
    if value.get("currentTier").is_some_and(|tier| !tier.is_null()) {
        if let Some(project) = project_hint {
            return Ok(binding(project.to_owned()));
        }
        return discover_project(client, access, &load, endpoint, projects_url)
            .await
            .map(binding);
    }
    let tier = value
        .get("allowedTiers")
        .and_then(Value::as_array)
        .and_then(|tiers| {
            tiers
                .iter()
                .find(|tier| tier.get("isDefault") == Some(&Value::Bool(true)))
        })
        .and_then(|tier| tier.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("legacy-tier");
    let managed_free_tier = tier == "free-tier";
    let onboard_project = if managed_free_tier {
        None
    } else {
        project_hint
    };
    let mut body = json!({
        "tierId": tier,
        "metadata": {
            "ideType":"ANTIGRAVITY",
            "platform":"PLATFORM_UNSPECIFIED",
            "pluginType":"GEMINI",
        },
    });
    if let Some(project) = onboard_project {
        body["cloudaicompanionProject"] = json!(project);
        body["metadata"]["duetProject"] = json!(project);
    }
    let mut response = oauth_http::json(
        client
            .post(format!("{endpoint}:onboardUser"))
            .bearer_auth(access)
            .header(reqwest::header::USER_AGENT, ANTIGRAVITY_USER_AGENT)
            .json(&body),
        "gemini",
        Stage::Onboard,
    )
    .await?;
    for _ in 0..18 {
        // Protobuf JSON omits false booleans; an absent "done" is still pending.
        if response.get("done").and_then(Value::as_bool) == Some(true) {
            if response.get("error").is_some() {
                return Err(Stage::Poll.failure("gemini", "operation_failed", None));
            }
            if let Some(project) = project_id(response.get("response").unwrap_or(&response)) {
                return Ok(binding(project));
            }
            if let Some(project) = project_hint {
                return Ok(binding(project.to_owned()));
            }
            return discover_project(client, access, &load, endpoint, projects_url)
                .await
                .map(binding);
        }
        let operation = response
            .get("name")
            .and_then(Value::as_str)
            .filter(|name| {
                name.starts_with("operations/")
                    && name.len() <= 512
                    && name
                        .chars()
                        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '-' | '_' | '.'))
                    && !name.contains("..")
            })
            .ok_or_else(|| Stage::Poll.failure("gemini", "invalid_operation", None))?;
        tokio::time::sleep(Duration::from_secs(5)).await;
        response = oauth_http::json(
            client
                .get(format!("{endpoint}/{operation}"))
                .bearer_auth(access)
                .header(reqwest::header::USER_AGENT, ANTIGRAVITY_USER_AGENT),
            "gemini",
            Stage::Poll,
        )
        .await?;
    }
    Err(Stage::Poll.failure("gemini", "onboarding_timeout", None))
}

async fn discover_project(
    client: &reqwest::Client,
    access: &str,
    load: &Value,
    endpoint: &str,
    projects_url: &str,
) -> Result<String, ProviderAdminError> {
    // Provisioning may complete before its operation includes the managed project.
    let refreshed = oauth_http::json(
        load_project_request(client, access, endpoint, load),
        "gemini",
        Stage::LoadProject,
    )
    .await?;
    if let Some(project) = project_id(&refreshed) {
        return Ok(project);
    }
    let projects = oauth_http::json(
        client.get(projects_url).bearer_auth(access),
        "gemini",
        Stage::DiscoverProject,
    )
    .await?;
    let rows = projects
        .get("projects")
        .and_then(Value::as_array)
        .filter(|rows| rows.len() <= 1000)
        .ok_or_else(|| Stage::DiscoverProject.failure("gemini", "project_missing", None))?;
    let candidates = rows
        .iter()
        .filter(|row| row.get("lifecycleState").and_then(Value::as_str) == Some("ACTIVE"))
        .filter_map(|row| {
            let id = row.get("projectId")?.as_str()?.trim();
            if id.is_empty() || id.len() > 512 {
                return None;
            }
            let name = row
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_ascii_lowercase();
            let companion = id.contains("cloud-ai-companion")
                || name.contains("cloud ai companion")
                || name.contains("code assist");
            Some((id, companion))
        })
        .collect::<Vec<_>>();
    // Never silently select an unrelated Cloud project for inference.
    let eligible = candidates
        .iter()
        .filter(|(_, companion)| *companion)
        .collect::<Vec<_>>();
    let selected = if eligible.len() == 1 {
        Some(eligible[0].0)
    } else if candidates.len() == 1 {
        Some(candidates[0].0)
    } else {
        None
    };
    let selected = selected.ok_or_else(|| {
        Stage::DiscoverProject.failure("gemini", "project_missing_or_ambiguous", None)
    })?;
    let mut confirm = load.clone();
    confirm["cloudaicompanionProject"] = json!(selected);
    confirm["metadata"]["duetProject"] = json!(selected);
    let confirmed = oauth_http::json(
        load_project_request(client, access, endpoint, &confirm),
        "gemini",
        Stage::LoadProject,
    )
    .await?;
    project_id(&confirmed)
        .ok_or_else(|| Stage::DiscoverProject.failure("gemini", "project_not_confirmed", None))
}
fn project_id(value: &Value) -> Option<String> {
    let project = value.get("cloudaicompanionProject")?;
    project
        .as_str()
        .or_else(|| project.get("id").and_then(Value::as_str))
        .filter(|project| !project.is_empty() && project.len() <= 512)
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::{
        Mock, MockServer, ResponseTemplate,
        matchers::{body_json, method, path},
    };

    #[tokio::test]
    async fn gemini_initialization_polls_when_google_omits_done_false() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1internal:loadCodeAssist"))
            .and(body_json(json!({"metadata":{"ideType":"ANTIGRAVITY"}})))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "allowedTiers":[{"id":"free-tier","isDefault":true}]
            })))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/v1internal:onboardUser"))
            .and(body_json(json!({
                "tierId":"free-tier",
                "metadata":{
                    "ideType":"ANTIGRAVITY",
                    "platform":"PLATFORM_UNSPECIFIED",
                    "pluginType":"GEMINI"
                }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "name":"operations/new-user"
            })))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/v1internal/operations/new-user"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "done":true,"response":{"cloudaicompanionProject":{"id":"managed-project"}}
            })))
            .expect(1)
            .mount(&server)
            .await;
        let result = project_at(
            &client(None).unwrap(),
            "fixture-access",
            None,
            &format!("{}/v1internal", server.uri()),
            None,
            &format!("{}/projects", server.uri()),
        )
        .await
        .unwrap();
        assert_eq!(result.project_id, "managed-project");
        let requests = server.received_requests().await.unwrap();
        assert!(requests.iter().all(|request| {
            !request.headers.contains_key("client-metadata")
                && request.headers["user-agent"] == ANTIGRAVITY_USER_AGENT
        }));
    }

    #[tokio::test]
    async fn gemini_project_fallback_requires_a_retryable_initial_failure() {
        for (status, expect_fallback) in [(400, false), (503, true)] {
            let server = MockServer::start().await;
            Mock::given(method("POST"))
                .and(path("/primary:loadCodeAssist"))
                .respond_with(ResponseTemplate::new(status))
                .expect(1)
                .mount(&server)
                .await;
            Mock::given(method("POST"))
                .and(path("/secondary:loadCodeAssist"))
                .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                    "cloudaicompanionProject":"managed-project"
                })))
                .expect(if expect_fallback { 1 } else { 0 })
                .mount(&server)
                .await;
            let result = project_at(
                &client(None).unwrap(),
                "fixture-access",
                None,
                &format!("{}/primary", server.uri()),
                Some(&format!("{}/secondary", server.uri())),
                &format!("{}/projects", server.uri()),
            )
            .await;
            if expect_fallback {
                assert_eq!(result.unwrap().project_id, "managed-project");
            } else {
                assert!(result.is_err());
            }
        }
    }

    #[tokio::test]
    async fn gemini_existing_project_does_not_onboard_again() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1internal:loadCodeAssist"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "currentTier":{"id":"free-tier"},
                "paidTier":{"id":"g1-pro-tier"},
                "cloudaicompanionProject":"existing-project"
            })))
            .expect(1)
            .mount(&server)
            .await;
        let result = project_at(
            &client(None).unwrap(),
            "fixture-access",
            None,
            &format!("{}/v1internal", server.uri()),
            None,
            &format!("{}/projects", server.uri()),
        )
        .await
        .unwrap();
        assert_eq!(result.project_id, "existing-project");
        assert_eq!(result.plan_type, Some("pro"));
        assert_eq!(server.received_requests().await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn gemini_completed_onboarding_reloads_project_before_failing() {
        let server = MockServer::start().await;
        let reads = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let count = reads.clone();
        Mock::given(method("POST"))
            .and(path("/v1internal:loadCodeAssist"))
            .respond_with(move |_: &wiremock::Request| {
                let value = if count.fetch_add(1, std::sync::atomic::Ordering::SeqCst) == 0 {
                    json!({"allowedTiers":[{"id":"free-tier","isDefault":true}]})
                } else {
                    json!({"cloudaicompanionProject":"new-managed-project"})
                };
                ResponseTemplate::new(200).set_body_json(value)
            })
            .expect(2)
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/v1internal:onboardUser"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(json!({"done":true,"response":{}})),
            )
            .expect(1)
            .mount(&server)
            .await;
        let result = project_at(
            &client(None).unwrap(),
            "fixture-access",
            None,
            &format!("{}/v1internal", server.uri()),
            None,
            &format!("{}/projects", server.uri()),
        )
        .await
        .unwrap();
        assert_eq!(result.project_id, "new-managed-project");
    }

    #[tokio::test]
    async fn gemini_cloud_project_is_confirmed_by_code_assist() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1internal:loadCodeAssist"))
            .respond_with(|request: &wiremock::Request| {
                let value: Value = serde_json::from_slice(&request.body).unwrap();
                let response = if value.get("cloudaicompanionProject").and_then(Value::as_str)
                    == Some("cloud-ai-companion-fixture")
                {
                    json!({"cloudaicompanionProject":"cloud-ai-companion-fixture"})
                } else {
                    json!({"currentTier":{"id":"free-tier"}})
                };
                ResponseTemplate::new(200).set_body_json(response)
            })
            .expect(3)
            .mount(&server)
            .await;
        Mock::given(method("GET")).and(path("/projects"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"projects":[
                {"projectId":"unrelated","lifecycleState":"ACTIVE","name":"Other"},
                {"projectId":"cloud-ai-companion-fixture","lifecycleState":"ACTIVE","name":"Code Assist"},
                {"projectId":"deleted","lifecycleState":"DELETE_REQUESTED","name":"Code Assist"}
            ]}))).expect(1).mount(&server).await;
        let result = project_at(
            &client(None).unwrap(),
            "fixture-access",
            None,
            &format!("{}/v1internal", server.uri()),
            None,
            &format!("{}/projects", server.uri()),
        )
        .await
        .unwrap();
        assert_eq!(result.project_id, "cloud-ai-companion-fixture");
    }
    #[test]
    fn callback_is_bound_to_expected_destination_and_state() {
        assert_eq!(
            callback_code(
                "claude",
                "http://localhost:54545/callback?code=abc&state=state",
                "state"
            )
            .unwrap(),
            "abc"
        );
        assert_eq!(
            callback_code(
                "gemini",
                "https://antigravity.google/oauth-callback?code=abc&state=state",
                "state"
            )
            .unwrap(),
            "abc"
        );
        assert_eq!(
            callback_code(
                "gemini",
                "http://127.0.0.1:1455/auth/callback?code=abc&scope=openid&state=state",
                "state"
            )
            .unwrap(),
            "abc"
        );
        assert_eq!(
            callback_code("gemini", "manual-auth-code", "state").unwrap(),
            "manual-auth-code"
        );
        for url in [
            "http://localhost:54545/callback?code=abc&state=other",
            "http://localhost:54545/callback?code=a&code=b&state=state",
            "https://attacker.invalid/callback?code=abc&state=state",
            "http://127.0.0.1:1455/auth/callback?code=a&code=b&state=state",
            "http://user:password@localhost:54545/callback?code=abc&state=state",
            "code#wrong",
        ] {
            assert!(callback_code("claude", url, "state").is_err());
        }
    }
    #[test]
    fn antigravity_oauth_registration_uses_published_client_and_scopes() {
        assert_eq!(
            redirect("gemini"),
            "https://antigravity.google/oauth-callback"
        );
        for scope in [
            "openid",
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/cclog",
            "https://www.googleapis.com/auth/experimentsandconfigs",
        ] {
            assert!(GEMINI_SCOPES.split_whitespace().any(|value| value == scope));
        }
    }
    #[test]
    fn refresh_preserves_project_identity_and_nonrotating_refresh_token() {
        let old = Tokens {
            refresh_token: "old-refresh".into(),
            expires_at: Utc::now(),
            project: Some("project-1".into()),
            subject: "user-1".into(),
            email: Some("user@example.com".into()),
        };
        let refreshed = tokens(
            "gemini",
            json!({"access_token":"new-access","expires_in":3600}),
            Some(old),
        )
        .unwrap();
        assert_eq!(refreshed.api_key, "new-access");
        let next = refreshed.oauth.unwrap();
        assert_eq!(next.refresh_token, "old-refresh");
        assert_eq!(next.project.as_deref(), Some("project-1"));
        assert_eq!(next.subject, "user-1");
        assert!(next.expires_at > Utc::now() + TimeDelta::minutes(59));
    }
    #[test]
    fn invalid_token_response_cannot_be_committed() {
        for value in [
            json!({"access_token":"token","refresh_token":"refresh","expires_in":0}),
            json!({"access_token":"bad\r\nheader","refresh_token":"refresh","expires_in":3600}),
            json!({"access_token":"token","expires_in":3600}),
        ] {
            assert!(tokens("claude", value, None).is_err());
        }
    }
}

//! Public API account administration prepares facts; Store owns persistence and CAS.

use super::{Credential, PublicApiProvider, network, pricing};
use async_trait::async_trait;
use chrono::Utc;
use ovload_admin::{
    model::{
        accounts::CredentialState,
        observability::{CalculatedBillingBreakdown, DashboardWireProfile, ProviderBillingInput},
        provider_credentials::{
            AuthorizationStarted, CompleteAuthorization, CredentialCommitGuard,
            PendingAuthorizationMutation, PrepareCredentialImport, PrepareCredentialRefresh,
            PrepareCredentialRotation, PreparedAuthorizationCommit, PreparedCredentialCreate,
            PreparedCredentialImport, PreparedCredentialRotation, PreparedCredentialRotationFacts,
            ProviderDocument, ProviderExport, ProviderExportCredentialInput, ProviderModel,
            ProviderModels, ProviderQuota, ProviderQuotaRequest,
        },
    },
    ports::provider::{ProviderAdmin, ProviderAdminError, ProviderAdminErrorKind},
};
use ovload_core::{
    account::{CredentialRevision, OpaqueProviderData, ProviderAccountId},
    operation::{GenerateRequest, Operation, ProtocolPayload},
    routing::{ProviderKind, UpstreamModelId},
};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::sync::atomic::Ordering;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Import {
    schema_version: u32,
    name: String,
    api_key: String,
    base_url: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Rotation {
    base_url: String,
    transport: String,
    api_key: Option<String>,
}

pub(super) fn admin_error(kind: ProviderAdminErrorKind) -> ProviderAdminError {
    ProviderAdminError::new(kind)
}
fn request_error(error: ovload_core::error::ProviderError) -> ProviderAdminError {
    use ovload_core::error::ProviderErrorKind as K;
    let message = match error.kind() {
        K::Unauthorized => "上游拒绝了 API 凭据（401），请检查密钥是否有效",
        K::PermissionDenied => "上游拒绝访问（403），请检查账号权限或上游访问规则",
        K::RateLimited => "上游请求受限（429），请稍后重试",
        K::Timeout => "连接上游超时，请检查网络和账号出口代理",
        K::Transport => "无法连接上游，请检查接口地址和网络",
        K::RequestPolicyDenied => "当前出口代理不支持该接口地址，请检查账号代理配置",
        K::InvalidRequest => "上游不支持此请求或接口路径，请检查模型和 API 地址",
        K::Protocol => "上游响应格式不符合接口协议",
        _ => "上游服务暂时不可用，请稍后重试",
    };
    admin_error(ProviderAdminErrorKind::BadGateway)
        .with_public_message(message)
        .with_source(error)
}

fn invalid() -> ProviderAdminError {
    admin_error(ProviderAdminErrorKind::Invalid)
}
fn unsupported() -> ProviderAdminError {
    admin_error(ProviderAdminErrorKind::Unsupported)
}

struct CommitGuard;
impl CredentialCommitGuard for CommitGuard {
    fn finish(self: Box<Self>) {}
}

#[async_trait]
impl ProviderAdmin for PublicApiProvider {
    fn account_capabilities(
        &self,
        _account_id: &ProviderAccountId,
        authentication_kind: &str,
    ) -> ovload_admin::model::accounts::ProviderAccountCapabilities {
        let supported = self.adapter.supports_oauth() && authentication_kind == "oauth";
        ovload_admin::model::accounts::ProviderAccountCapabilities {
            quota: supported,
            quota_refresh: supported,
            ..Default::default()
        }
    }

    fn client_profile_options(&self) -> Result<OpaqueProviderData, ProviderAdminError> {
        if !self.adapter.is_native() {
            return Err(unsupported());
        }
        Ok(super::native::profile::options(self.kind.as_str()))
    }

    fn default_client_profile(&self) -> Option<OpaqueProviderData> {
        self.adapter
            .is_native()
            .then(super::native::profile::defaults)
    }

    fn preview_client_profile(
        &self,
        configuration: &OpaqueProviderData,
    ) -> Result<OpaqueProviderData, ProviderAdminError> {
        if !self.adapter.is_native() {
            return Err(unsupported());
        }
        super::native::profile::preview(self.kind.as_str(), configuration).map_err(|_| invalid())
    }
    fn compile_privacy_policy(
        &self,
        policy: &ovload_core::settings::privacy::CodexPrivacyPolicy,
    ) -> Result<
        std::sync::Arc<dyn ovload_core::settings::privacy::CompiledPrivacyPolicy>,
        ovload_core::settings::privacy::PrivacyError,
    > {
        provider_openai::transport::privacy::compile(policy)
    }

    fn preview_privacy_policy(
        &self,
        request: ovload_core::settings::privacy::PrivacyPreviewRequest,
    ) -> Result<
        ovload_core::settings::privacy::PrivacyPreviewResult,
        ovload_core::settings::privacy::PrivacyError,
    > {
        provider_openai::transport::privacy::preview(request)
    }
    fn provider_kind(&self) -> &ProviderKind {
        &self.kind
    }

    async fn account_unavailable(&self, account_id: &ProviderAccountId) {
        self.catalogs.lock().await.remove(account_id);
        self.generation.fetch_add(1, Ordering::Relaxed);
    }

    async fn account_facts_changed(&self, account_ids: &[ProviderAccountId]) {
        let mut catalogs = self.catalogs.lock().await;
        for id in account_ids {
            catalogs.remove(id);
        }
        self.generation.fetch_add(1, Ordering::Relaxed);
    }

    async fn connection_test_operation(
        &self,
        model: &UpstreamModelId,
        input_text: &str,
    ) -> Result<Operation, ProviderAdminError> {
        let mut body = Map::new();
        body.insert("model".into(), Value::String(model.as_str().to_owned()));
        body.insert("input".into(), Value::String(input_text.to_owned()));
        body.insert("stream".into(), Value::Bool(true));
        body.insert("store".into(), Value::Bool(false));
        body.insert("max_output_tokens".into(), Value::from(64));
        let payload = ProtocolPayload::json_object("openai", body).map_err(|_| invalid())?;
        Ok(Operation::Generate(GenerateRequest::from_protocol_payload(
            payload,
        )))
    }

    fn supports_compact_test(&self) -> bool {
        self.adapter.supports_compact()
    }

    async fn test_compact(
        &self,
        id: &ProviderAccountId,
        model: &UpstreamModelId,
        input: &str,
    ) -> Result<(), ProviderAdminError> {
        if !self.supports_compact_test() {
            return Err(unsupported());
        }
        let _slot = self
            .catalog_capacity
            .try_acquire()
            .map_err(|_| admin_error(ProviderAdminErrorKind::Unavailable))?;
        let account = self.account(id).await.map_err(request_error)?;
        let loaded = self
            .ports
            .accounts()
            .load_credential(id, account.revision())
            .await
            .map_err(|_| admin_error(ProviderAdminErrorKind::Unavailable))?;
        let credential =
            Credential::decode(loaded.credential.expose_to_provider()).map_err(request_error)?;
        tokio::time::timeout(std::time::Duration::from_secs(60), async {
            let url = network::endpoint(&credential, "responses/compact").map_err(request_error)?;
            let response = network::client(&account, &url).await.map_err(request_error)?
                .post(url).bearer_auth(&credential.api_key)
                .json(&serde_json::json!({"model": model.as_str(), "input":[{"role":"user","content":input}]}))
                .send().await.map_err(|_| admin_error(ProviderAdminErrorKind::BadGateway).with_public_message("无法连接 Compact 接口"))?;
            if !response.status().is_success() { return Err(request_error(network::status_error(response.status()))); }
            let body = network::bounded_body(response, 2 * 1024 * 1024).await.map_err(request_error)?;
            let value: Value = serde_json::from_slice(&body).map_err(|_| invalid())?;
            if value.get("object").and_then(Value::as_str) != Some("response.compaction") ||
                !value.get("output").and_then(Value::as_array).is_some_and(|items| items.iter().any(|item| item.get("type").and_then(Value::as_str) == Some("compaction") && item.get("encrypted_content").and_then(Value::as_str).is_some_and(|v| !v.is_empty()))) {
                return Err(admin_error(ProviderAdminErrorKind::BadGateway).with_public_message("上游未返回有效的 Compact 结果"));
            }
            Ok(())
        }).await.map_err(|_| admin_error(ProviderAdminErrorKind::BadGateway).with_public_message("Compact 请求超时"))?
    }

    fn dashboard_wire_profile(&self) -> Option<DashboardWireProfile> {
        None
    }
    fn calculated_billing(
        &self,
        _input: &ProviderBillingInput,
    ) -> Result<Option<CalculatedBillingBreakdown>, ProviderAdminError> {
        Ok(None)
    }

    fn evaluate_usage_pricing(
        &self,
        input: &ovload_admin::ports::provider::ProviderUsagePricingInput,
        explicit_pricing: Option<&ovload_core::metering::ModelPriceOverride>,
    ) -> Result<Option<ovload_core::metering::CalculatedCostBreakdown>, ProviderAdminError> {
        Ok(pricing::evaluate(
            &input.usage,
            input.service_tier.as_deref(),
            explicit_pricing,
        ))
    }

    async fn preview_import_models(
        &self,
        command: PrepareCredentialImport,
    ) -> Result<ProviderModels, ProviderAdminError> {
        let _slot = self
            .catalog_capacity
            .try_acquire()
            .map_err(|_| admin_error(ProviderAdminErrorKind::Unavailable))?;
        let prepared = self.prepare_import(command).await?;
        let entry = prepared
            .credentials
            .into_iter()
            .next()
            .ok_or_else(invalid)?;
        let credential = Credential::decode(
            entry
                .provider_material
                .expose_to_provider()
                .expose_to_provider(),
        )
        .map_err(|_| invalid())?;
        let account = ovload_core::account::ProviderAccount::new(
            entry.account_id,
            self.kind.clone(),
            entry.name,
            None,
            "api_key".to_owned(),
            CredentialRevision::new(1).map_err(|_| invalid())?,
            None,
        )
        .with_outbound_proxy(entry.outbound_proxy);
        let models = tokio::time::timeout(std::time::Duration::from_secs(30), async {
            if self.adapter.is_native() {
                super::native::models(self, &account, &credential).await
            } else {
                network::models(&account, &credential).await
            }
        })
        .await
        .map_err(|_| admin_error(ProviderAdminErrorKind::BadGateway))?
        .map_err(request_error)?;
        Ok(ProviderModels {
            models: models
                .into_iter()
                .map(|id| ProviderModel {
                    name: id.as_str().to_owned(),
                    id,
                })
                .collect(),
            observed_at: Some(Utc::now()),
        })
    }

    async fn prepare_import(
        &self,
        command: PrepareCredentialImport,
    ) -> Result<PreparedCredentialImport, ProviderAdminError> {
        let imported: Import = serde_json::from_value(Value::Object(
            command
                .document
                .expose_to_provider()
                .expose_to_provider()
                .clone(),
        ))
        .map_err(|_| invalid())?;
        if imported.name.trim().is_empty()
            || imported.name.len() > 512
            || imported.name.chars().any(char::is_control)
        {
            return Err(invalid());
        }
        let credential = Credential {
            schema_version: imported.schema_version,
            api_key: imported.api_key,
            base_url: imported.base_url,
            oauth: None,
        };
        credential.validate().map_err(|_| invalid())?;
        let id = ProviderAccountId::new(format!("acct_{}", uuid::Uuid::now_v7().simple()))
            .map_err(|_| invalid())?;
        Ok(PreparedCredentialImport {
            provider_kind: self.kind.clone(),
            credentials: vec![PreparedCredentialCreate {
                model_access: None,
                outbound_proxy: command.default_outbound_proxy,
                account_id: id,
                provider_kind: self.kind.clone(),
                name: imported.name.trim().to_owned(),
                email: None,
                upstream_user_id: None,
                upstream_account_id: None,
                plan_type: None,
                authentication_kind: "api_key".to_owned(),
                provider_material: credential.document()?,
                has_refresh_token: false,
                access_token_expires_at: None,
                next_refresh_at: None,
                enabled: true,
                credential_state: CredentialState::Unknown,
                credential_observed_at: Utc::now(),
            }],
        })
    }

    async fn prepare_rotation(
        &self,
        command: PrepareCredentialRotation,
    ) -> Result<PreparedCredentialRotation, ProviderAdminError> {
        if command.account.provider_kind != self.kind
            || command.account.authentication_kind != "api_key"
        {
            return Err(invalid());
        }
        if command
            .provider_material
            .expose_to_provider()
            .expose_to_provider()
            .get("api_key")
            .is_some_and(|value| !value.is_string())
        {
            return Err(invalid());
        }
        let rotation: Rotation = serde_json::from_value(Value::Object(
            command
                .provider_material
                .expose_to_provider()
                .expose_to_provider()
                .clone(),
        ))
        .map_err(|_| invalid())?;
        if rotation.transport != "http" {
            return Err(unsupported());
        }
        let id = ProviderAccountId::new(command.account.id.clone()).map_err(|_| invalid())?;
        let revision = CredentialRevision::new(command.account.credential_revision.get())
            .map_err(|_| invalid())?;
        let loaded = self
            .ports
            .accounts()
            .load_credential(&id, revision)
            .await
            .map_err(|_| admin_error(ProviderAdminErrorKind::Conflict))?;
        if loaded.account.provider() != &self.kind {
            return Err(invalid());
        }
        let current = Credential::decode(loaded.credential.expose_to_provider())
            .map_err(|_| admin_error(ProviderAdminErrorKind::Internal))?;
        let credential = Credential {
            schema_version: 1,
            api_key: rotation.api_key.unwrap_or(current.api_key),
            base_url: rotation.base_url,
            oauth: None,
        };
        credential.validate().map_err(|_| invalid())?;
        Ok(PreparedCredentialRotation::new(
            PreparedCredentialRotationFacts {
                account_id: id,
                provider_kind: self.kind.clone(),
                expected_credential_revision: command.account.credential_revision,
                replacement_identity: None,
                name: command.account.name,
                email: command.account.email,
                plan_type: command.account.plan_type,
                preserve_profile: true,
                preserve_credential_state: true,
                provider_material: credential.document()?,
                has_refresh_token: false,
                access_token_expires_at: None,
                next_refresh_at: None,
            },
            Box::new(CommitGuard),
        ))
    }

    async fn account_configuration(
        &self,
        account_id: &ProviderAccountId,
    ) -> Result<Option<ProviderDocument>, ProviderAdminError> {
        let account = self
            .account(account_id)
            .await
            .map_err(|_| admin_error(ProviderAdminErrorKind::NotFound))?;
        let loaded = self
            .ports
            .accounts()
            .load_credential(account_id, account.revision())
            .await
            .map_err(|_| admin_error(ProviderAdminErrorKind::Unavailable))?;
        let credential = Credential::decode(loaded.credential.expose_to_provider())
            .map_err(|_| admin_error(ProviderAdminErrorKind::Internal))?;
        let fields = Map::from_iter([
            ("base_url".into(), Value::String(credential.base_url)),
            ("transport".into(), Value::String("http".into())),
        ]);
        Ok(Some(ProviderDocument::new(OpaqueProviderData::new(fields))))
    }

    async fn models(
        &self,
        account_id: &ProviderAccountId,
        refresh: bool,
    ) -> Result<ProviderModels, ProviderAdminError> {
        let account = self
            .account(account_id)
            .await
            .map_err(|_| admin_error(ProviderAdminErrorKind::NotFound))?;
        let catalog = self
            .catalog(
                &self
                    .native_fresh_account(account)
                    .await
                    .map_err(|_| admin_error(ProviderAdminErrorKind::BadGateway))?,
                refresh,
            )
            .await
            .map_err(request_error)?;
        Ok(ProviderModels {
            models: catalog
                .models
                .into_iter()
                .map(|id| ProviderModel {
                    name: id.as_str().to_owned(),
                    id,
                })
                .collect(),
            observed_at: Some(catalog.observed_at),
        })
    }

    async fn quota(
        &self,
        request: ProviderQuotaRequest,
    ) -> Result<ProviderQuota, ProviderAdminError> {
        let account = self
            .account(&request.account_id)
            .await
            .map_err(|_| admin_error(ProviderAdminErrorKind::NotFound))?;
        if self.adapter.supports_oauth() && account.authentication_kind() == "oauth" {
            return self.native_quota(request).await;
        }
        self.account(&request.account_id)
            .await
            .map_err(|_| admin_error(ProviderAdminErrorKind::NotFound))?;
        if request.refresh {
            return Err(unsupported());
        }
        Ok(ProviderQuota {
            plan_type: None,
            observed_at: None,
            refresh_token_expires_at: None,
            windows: Vec::new(),
            credits: None,
            limit_reached: false,
            provider_data: None,
        })
    }

    async fn start_authorization(
        &self,
        pending: PendingAuthorizationMutation,
    ) -> Result<AuthorizationStarted, ProviderAdminError> {
        if self.adapter.is_native() {
            self.native_start(pending).await
        } else {
            Err(unsupported())
        }
    }
    async fn complete_authorization(
        &self,
        command: CompleteAuthorization,
    ) -> Result<PreparedAuthorizationCommit, ProviderAdminError> {
        if self.adapter.is_native() {
            self.native_complete(command).await
        } else {
            Err(unsupported())
        }
    }
    async fn prepare_refresh(
        &self,
        command: PrepareCredentialRefresh,
    ) -> Result<PreparedCredentialRotation, ProviderAdminError> {
        if self.adapter.is_native() {
            self.native_refresh(command).await
        } else {
            Err(unsupported())
        }
    }
    async fn export_credentials(
        &self,
        _credentials: Vec<ProviderExportCredentialInput>,
    ) -> Result<ProviderExport, ProviderAdminError> {
        Err(unsupported())
    }
}

#[cfg(test)]
mod connection_test_diagnostics {
    use super::*;
    #[test]
    fn model_request_failures_keep_actionable_safe_classification() {
        for (status, fragment) in [(401, "401"), (403, "403"), (429, "429"), (404, "接口路径")]
        {
            let error = request_error(network::status_error(
                reqwest::StatusCode::from_u16(status).unwrap(),
            ));
            assert!(error.public_message().unwrap().contains(fragment));
            assert_eq!(error.kind(), ProviderAdminErrorKind::BadGateway);
        }
    }
}

//! Persisted generated-image settings and bounded asynchronous result storage.

use std::{sync::Mutex, time::Duration};

use aws_sdk_s3::{presigning::PresigningConfig, primitives::ByteStream};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use ovload_admin::{
    model::{
        AdminError, MutationContext,
        audit::MutationAuditOperation,
        backup::{BackupStorageConfig, ConnectionTestResult},
    },
    ports::{backup::BackupObjectStorePort, backup_extensions::*},
};
use secrecy::SecretString;
use serde_json::{Value, json};
use sqlx::{PgPool, Row as _};
use url::Url;
use uuid::Uuid;

use crate::{StoreConfig, postgres::ProviderCredentialCipher};

pub struct StorageExtensions {
    pub(super) pool: PgPool,
    pub(super) config: StoreConfig,
    pub(super) shutdown: Mutex<Option<ovload_core::lifecycle::CancellationToken>>,
}

pub(super) fn unavailable<E>(_error: E) -> AdminError {
    AdminError::bad_gateway("存储服务请求失败")
}

impl StorageExtensions {
    pub fn new(pool: PgPool, config: StoreConfig) -> Self {
        Self {
            pool,
            config,
            shutdown: Mutex::new(None),
        }
    }

    async fn cipher(&self) -> Result<ProviderCredentialCipher, AdminError> {
        ProviderCredentialCipher::load(self.config.provider_credential_key_file.clone())
            .await
            .map_err(unavailable)
    }

    async fn load(&self) -> Result<(i64, ImageStorageUpdate, bool), AdminError> {
        let row = sqlx::query("select revision,settings,credentials,verified_revision from generated_image_storage where singleton")
            .fetch_one(&self.pool).await.map_err(unavailable)?;
        let revision: i64 = row.get("revision");
        let mut settings: ImageStorageUpdate =
            serde_json::from_value(row.get("settings")).map_err(unavailable)?;
        if let Some(value) = row.get::<Option<Value>, _>("credentials") {
            let value = self
                .cipher()
                .await?
                .open("generated-image-storage", value)
                .map_err(unavailable)?
                .as_value()
                .clone();
            settings.access_key_id = value
                .get("accessKeyId")
                .and_then(Value::as_str)
                .map(str::to_owned);
            settings.secret_access_key = value
                .get("secretAccessKey")
                .and_then(Value::as_str)
                .map(str::to_owned);
        }
        Ok((
            revision,
            settings,
            row.get::<Option<i64>, _>("verified_revision") == Some(revision),
        ))
    }

    pub(super) async fn audit(
        &self,
        context: &MutationContext,
        operation: MutationAuditOperation,
        id: &str,
    ) -> Result<(), AdminError> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        crate::postgres::append_admin_audit_event_in_transaction(
            &mut tx,
            crate::mutation_audit(context, operation, id, vec![]),
            None,
        )
        .await
        .map_err(unavailable)?;
        tx.commit().await.map_err(unavailable)
    }

    async fn store_result(&self, id: Uuid, mut result: Value) -> Result<Value, AdminError> {
        let (revision, settings, verified) = self.load().await?;
        if !settings.enabled || !verified {
            return Err(AdminError::conflict("生图存储尚未启用或验证"));
        }
        let expected: i64 = sqlx::query_scalar(
            "select storage_revision from generated_image_jobs where id=$1 and status='running'",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(unavailable)?;
        if revision != expected {
            return Err(AdminError::conflict("生图存储配置已经变化"));
        }
        let config = storage_config(revision, &settings)?;
        let client = super::s3::build_client(&config);
        let images = result
            .get_mut("data")
            .and_then(Value::as_array_mut)
            .filter(|images| !images.is_empty() && images.len() <= 10)
            .ok_or_else(|| AdminError::bad_gateway("上游没有返回图片数据"))?;
        let mut uploaded = Vec::new();
        let mut bytes_total = 0_usize;
        let upload = async {
            for (index, image) in images.iter_mut().enumerate() {
                let encoded = image.get("b64_json").and_then(Value::as_str)
                    .filter(|value| value.len() <= 90 * 1024 * 1024)
                    .ok_or_else(|| AdminError::bad_gateway("异步生图需要上游返回 b64_json"))?;
                let bytes = STANDARD.decode(encoded).map_err(|_| AdminError::bad_gateway("上游图片编码无效"))?;
                bytes_total = bytes_total.saturating_add(bytes.len());
                if bytes_total > 64 * 1024 * 1024 { return Err(AdminError::bad_gateway("图片总大小超过 64 MiB")); }
                let (extension, content_type) = image_format(&bytes)?;
                let key = format!("{}{id}/{index}.{extension}", prefix(&settings.prefix));
                sqlx::query("update generated_image_jobs set object_keys=array_append(object_keys,$2) where id=$1 and status='running'")
                    .bind(id).bind(&key).execute(&self.pool).await.map_err(unavailable)?;
                client.put_object().bucket(&config.bucket).key(&key)
                    .content_type(content_type).body(ByteStream::from(bytes))
                    .send().await.map_err(unavailable)?;
                uploaded.push(key.clone());
                let mut stored = serde_json::Map::new();
                if let Some(prompt) = image.get("revised_prompt") { stored.insert("revised_prompt".to_owned(), prompt.clone()); }
                stored.insert("objectKey".to_owned(), Value::String(key));
                *image = Value::Object(stored);
            }
            Ok::<(), AdminError>(())
        }.await;
        if let Err(error) = upload {
            for key in uploaded {
                let _ = client
                    .delete_object()
                    .bucket(&config.bucket)
                    .key(key)
                    .send()
                    .await;
            }
            return Err(error);
        }
        Ok(result)
    }

    async fn present_job(&self, row: sqlx::postgres::PgRow) -> Result<ImageJob, AdminError> {
        let mut result: Option<Value> = row.get("result");
        if let Some(data) = result
            .as_mut()
            .and_then(|value| value.get_mut("data"))
            .and_then(Value::as_array_mut)
        {
            let (revision, settings, _) = self.load().await?;
            let config = storage_config(revision, &settings)?;
            let client = super::s3::build_client(&config);
            let ttl = Duration::from_secs(u64::from(settings.presigned_expiry_hours) * 3600);
            for image in data {
                let key = image
                    .get("objectKey")
                    .and_then(Value::as_str)
                    .ok_or_else(|| unavailable(()))?;
                let url = if settings.public_domain.is_empty() {
                    client
                        .get_object()
                        .bucket(&config.bucket)
                        .key(key)
                        .presigned(PresigningConfig::expires_in(ttl).map_err(unavailable)?)
                        .await
                        .map_err(unavailable)?
                        .uri()
                        .to_owned()
                } else {
                    let mut url = Url::parse(&settings.public_domain).map_err(unavailable)?;
                    {
                        let mut segments = url.path_segments_mut().map_err(|_| unavailable(()))?;
                        segments.pop_if_empty();
                        for segment in key.split('/') {
                            segments.push(segment);
                        }
                    }
                    url.into()
                };
                let object = image.as_object_mut().ok_or_else(|| unavailable(()))?;
                object.remove("objectKey");
                object.insert("url".to_owned(), Value::String(url));
            }
        }
        Ok(ImageJob {
            id: row.get::<Uuid, _>("id").to_string(),
            status: row.get("status"),
            created_at: row.get("created_at"),
            expires_at: row.get("expires_at"),
            result,
            error: row.get("error"),
        })
    }
}

#[async_trait::async_trait]
impl BackupExtensionsPort for StorageExtensions {
    fn bind_shutdown(&self, token: ovload_core::lifecycle::CancellationToken) {
        if let Ok(mut shutdown) = self.shutdown.lock() {
            *shutdown = Some(token);
        }
    }

    async fn image_settings(&self) -> Result<ImageStorageSettings, AdminError> {
        let (_, settings, verified) = self.load().await?;
        Ok(settings_view(settings, verified))
    }

    async fn update_image_settings(
        &self,
        mut command: ImageStorageUpdate,
        context: &MutationContext,
    ) -> Result<ImageStorageSettings, AdminError> {
        validate(&command)?;
        let (revision, previous, _) = self.load().await?;
        command.access_key_id = command
            .access_key_id
            .filter(|value| !value.is_empty())
            .or(previous.access_key_id.clone());
        command.secret_access_key = command
            .secret_access_key
            .filter(|value| !value.is_empty())
            .or(previous.secret_access_key.clone());
        if command.enabled {
            storage_config(revision, &command)?;
        }
        let credentials = self.cipher().await?.seal("generated-image-storage", &crate::JsonObject::try_from_value("image storage credentials", json!({"accessKeyId":command.access_key_id,"secretAccessKey":command.secret_access_key}), 4096).map_err(unavailable)?).map_err(unavailable)?;
        let mut saved = command.clone();
        saved.access_key_id = None;
        saved.secret_access_key = None;
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        // Serialize settings updates and job admission across service instances.
        sqlx::query("select pg_advisory_xact_lock(709841032)")
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        let current: i64 = sqlx::query_scalar(
            "select revision from generated_image_storage where singleton for update",
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(unavailable)?;
        if current != revision {
            return Err(AdminError::conflict("设置已经变化，请刷新后重试"));
        }
        let running: bool = sqlx::query_scalar("select exists(select 1 from generated_image_jobs where status='running' and created_at>now()-interval '21 minutes')").fetch_one(&mut *tx).await.map_err(unavailable)?;
        if running {
            return Err(AdminError::conflict(
                "有生图任务正在执行，请完成后再修改存储",
            ));
        }
        let identity_changed = command.endpoint != previous.endpoint
            || command.region != previous.region
            || command.bucket != previous.bucket
            || command.force_path_style != previous.force_path_style;
        if identity_changed {
            let retained: bool = sqlx::query_scalar("select exists(select 1 from generated_image_jobs where cardinality(object_keys)>0)").fetch_one(&mut *tx).await.map_err(unavailable)?;
            if retained {
                return Err(AdminError::conflict("仍有有效图片结果，不能切换存储位置"));
            }
        }
        sqlx::query("update generated_image_storage set revision=revision+1,settings=$1,credentials=$2,verified_revision=null,updated_at=now() where singleton")
            .bind(serde_json::to_value(saved).map_err(unavailable)?).bind(credentials).execute(&mut *tx).await.map_err(unavailable)?;
        crate::postgres::append_admin_audit_event_in_transaction(
            &mut tx,
            crate::mutation_audit(
                context,
                MutationAuditOperation::ImageStorageUpdate,
                "1",
                vec![],
            ),
            None,
        )
        .await
        .map_err(unavailable)?;
        tx.commit().await.map_err(unavailable)?;
        Ok(settings_view(command, false))
    }

    async fn test_image_storage(
        &self,
        context: &MutationContext,
    ) -> Result<ConnectionTestResult, AdminError> {
        let (revision, settings, _) = self.load().await?;
        let config = storage_config(revision, &settings)?;
        let result = super::s3::S3ObjectStoreAdapter::new()
            .test_connection(&config)
            .await
            .map_err(unavailable)?;
        if result.ok {
            let affected = sqlx::query("update generated_image_storage set verified_revision=revision where singleton and revision=$1").bind(revision).execute(&self.pool).await.map_err(unavailable)?.rows_affected();
            if affected == 0 {
                return Err(AdminError::conflict("测试期间设置已经变化，请重新测试"));
            }
        }
        self.audit(context, MutationAuditOperation::ImageStorageTest, "1")
            .await?;
        Ok(result)
    }

    async fn create_image_job(&self, owner: &str) -> Result<ImageJob, AdminError> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        sqlx::query("select pg_advisory_xact_lock(709841032)")
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        let (revision, settings, verified) = self.load().await?;
        if !settings.enabled || !verified {
            return Err(AdminError::conflict("异步生图存储尚未启用或通过连接测试"));
        }
        sqlx::query("update generated_image_jobs set status='failed',error='任务已超时或服务已重启' where status='running' and created_at<now()-interval '21 minutes'").execute(&mut *tx).await.map_err(unavailable)?;
        let (total, own): (i64, i64) = sqlx::query_as("select count(*),count(*) filter(where owner_key_id=$1) from generated_image_jobs where status='running'").bind(owner).fetch_one(&mut *tx).await.map_err(unavailable)?;
        if total >= 16 || own >= 2 {
            return Err(AdminError::new(
                ovload_admin::model::AdminErrorKind::RateLimited,
                "异步生图任务数量已达上限，请稍后重试",
            ));
        }
        let row = sqlx::query("insert into generated_image_jobs(id,owner_key_id,status,storage_revision) values($1,$2,'running',$3) returning *").bind(Uuid::now_v7()).bind(owner).bind(revision).fetch_one(&mut *tx).await.map_err(unavailable)?;
        tx.commit().await.map_err(unavailable)?;
        self.present_job(row).await
    }

    async fn finish_image_job(
        &self,
        id: &str,
        response: Result<Value, String>,
    ) -> Result<(), AdminError> {
        let id = Uuid::parse_str(id).map_err(|_| AdminError::bad_request("任务编号无效"))?;
        let stored = match response {
            Ok(value) => self
                .store_result(id, value)
                .await
                .map_err(|error| error.to_string()),
            Err(message) => Err(message),
        };
        let (status, result, error) = match stored {
            Ok(value) => ("completed", Some(value), None),
            Err(message) => (
                "failed",
                None,
                Some(message.chars().take(300).collect::<String>()),
            ),
        };
        sqlx::query("update generated_image_jobs set status=$2,result=$3,error=$4 where id=$1 and status='running'").bind(id).bind(status).bind(result).bind(error).execute(&self.pool).await.map_err(unavailable)?;
        Ok(())
    }

    async fn image_job(&self, owner: &str, id: &str) -> Result<ImageJob, AdminError> {
        let id = Uuid::parse_str(id).map_err(|_| AdminError::not_found("任务不存在"))?;
        let row = sqlx::query("select * from generated_image_jobs where id=$1 and owner_key_id=$2 and expires_at>now()")
            .bind(id).bind(owner).fetch_optional(&self.pool).await.map_err(unavailable)?.ok_or_else(|| AdminError::not_found("任务不存在或已过期"))?;
        self.present_job(row).await
    }

    async fn cleanup_images(&self) -> Result<(), AdminError> {
        sqlx::query("update generated_image_jobs set status='failed',error='任务已超时或服务已重启' where status='running' and created_at<now()-interval '21 minutes'").execute(&self.pool).await.map_err(unavailable)?;
        let rows = sqlx::query("select id,object_keys from generated_image_jobs where (status='failed' and cardinality(object_keys)>0) or (status<>'running' and expires_at<=now()) order by created_at limit 20").fetch_all(&self.pool).await.map_err(unavailable)?;
        if rows.is_empty() {
            return Ok(());
        }
        let (revision, settings, _) = self.load().await?;
        let client = super::s3::build_client(&storage_config(revision, &settings)?);
        for row in rows {
            let id: Uuid = row.get("id");
            for key in row.get::<Vec<String>, _>("object_keys") {
                client
                    .delete_object()
                    .bucket(&settings.bucket)
                    .key(key)
                    .send()
                    .await
                    .map_err(unavailable)?;
            }
            sqlx::query("update generated_image_jobs set object_keys='{}' where id=$1 and status<>'running'").bind(id).execute(&self.pool).await.map_err(unavailable)?;
            sqlx::query("delete from generated_image_jobs where id=$1 and status<>'running' and expires_at<=now()").bind(id).execute(&self.pool).await.map_err(unavailable)?;
        }
        Ok(())
    }

    async fn request_restore(
        &self,
        backup_id: &str,
        context: &MutationContext,
    ) -> Result<RestoreAccepted, AdminError> {
        super::restore::request(self, backup_id, context).await
    }

    async fn restore_status(&self, id: &str, ticket: &str) -> Result<RestoreStatus, AdminError> {
        super::restore::status(&self.config, id, ticket)
    }
}

fn settings_view(settings: ImageStorageUpdate, verified: bool) -> ImageStorageSettings {
    ImageStorageSettings {
        enabled: settings.enabled,
        endpoint: settings.endpoint,
        region: settings.region,
        bucket: settings.bucket,
        prefix: settings.prefix,
        has_access_key: settings.access_key_id.is_some(),
        has_secret: settings.secret_access_key.is_some(),
        force_path_style: settings.force_path_style,
        public_domain: settings.public_domain,
        presigned_expiry_hours: settings.presigned_expiry_hours,
        verified,
    }
}

fn validate(settings: &ImageStorageUpdate) -> Result<(), AdminError> {
    if !settings.endpoint.is_empty() {
        validate_url(&settings.endpoint)?;
    }
    if !settings.public_domain.is_empty() {
        validate_url(&settings.public_domain)?;
    }
    if !(1..=168).contains(&settings.presigned_expiry_hours) {
        return Err(AdminError::bad_request(
            "预签名链接有效期必须为 1 到 168 小时",
        ));
    }
    for value in [&settings.region, &settings.bucket, &settings.prefix] {
        if value.len() > 255 || value.chars().any(char::is_control) {
            return Err(AdminError::bad_request("存储字段格式无效"));
        }
    }
    for value in [&settings.access_key_id, &settings.secret_access_key]
        .into_iter()
        .flatten()
    {
        if value.len() > 512 || value.chars().any(char::is_control) {
            return Err(AdminError::bad_request("存储凭据格式无效"));
        }
    }
    if settings
        .prefix
        .split('/')
        .any(|part| part == ".." || part == ".")
    {
        return Err(AdminError::bad_request("对象前缀不能包含相对路径"));
    }
    Ok(())
}

fn validate_url(value: &str) -> Result<(), AdminError> {
    let url = Url::parse(value).map_err(|_| AdminError::bad_request("存储地址无效"))?;
    if value.len() > 2048
        || url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(AdminError::bad_request(
            "存储地址必须为不含凭据、查询参数的 HTTPS 地址",
        ));
    }
    Ok(())
}

fn storage_config(
    revision: i64,
    settings: &ImageStorageUpdate,
) -> Result<BackupStorageConfig, AdminError> {
    validate(settings)?;
    let access = settings
        .access_key_id
        .clone()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AdminError::bad_request("请填写 Access Key"))?;
    let secret = settings
        .secret_access_key
        .clone()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AdminError::bad_request("请填写 Secret Key"))?;
    if settings.endpoint.is_empty() || settings.region.is_empty() || settings.bucket.is_empty() {
        return Err(AdminError::bad_request("存储配置不完整"));
    }
    Ok(BackupStorageConfig {
        storage_revision: revision as u64,
        endpoint: settings.endpoint.clone(),
        region: settings.region.clone(),
        bucket: settings.bucket.clone(),
        access_key_id: access,
        secret_access_key: SecretString::from(secret),
        prefix: settings.prefix.clone(),
        force_path_style: settings.force_path_style,
    })
}

fn prefix(value: &str) -> String {
    let value = value.trim_matches('/');
    if value.is_empty() {
        String::new()
    } else {
        format!("{value}/")
    }
}

fn image_format(bytes: &[u8]) -> Result<(&'static str, &'static str), AdminError> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Ok(("png", "image/png"))
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Ok(("jpg", "image/jpeg"))
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Ok(("webp", "image/webp"))
    } else {
        Err(AdminError::bad_gateway("上游返回了不支持的图片格式"))
    }
}

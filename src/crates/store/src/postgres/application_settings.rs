//! Versioned integration settings, encrypted credentials and payment transactions.
mod alipay;
mod payments;
use super::{
    ProviderCredentialCipher,
    identity::{access, db_error},
};
use crate::JsonObject;
use ovload_admin::{
    model::{
        application_settings::{self, IntegrationDocument},
        identity_access::{
            IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
        },
    },
    ports::application_settings::ApplicationSettingsStore,
};
use ovload_core::access::Permission;
use serde_json::{Value, json};
use sqlx::{PgPool, Postgres, Row, Transaction};

#[derive(Clone)]
pub struct PgApplicationSettings {
    pub(super) pool: PgPool,
    pub(super) cipher: ProviderCredentialCipher,
}
impl PgApplicationSettings {
    pub fn new(pool: PgPool, cipher: ProviderCredentialCipher) -> Self {
        Self { pool, cipher }
    }
    pub(super) async fn authorize(
        tx: &mut Transaction<'_, Postgres>,
        s: &IdentitySession,
    ) -> IdentityResult<()> {
        let IdentityOwner::Management(principal_id) = s.owner else {
            return Err(IdentityError::Forbidden);
        };
        access::authorize(
            tx,
            IdentityManagementActor {
                principal_id,
                session_id: s.id,
                authority_generation: s.authority_generation,
            },
            Permission::SecuritySettingsManage,
            None,
        )
        .await
    }
    pub(super) fn seal(&self, kind: &str, secrets: &Value) -> IdentityResult<Value> {
        self.cipher
            .seal(
                &format!("application:{kind}"),
                &JsonObject::try_from_value("application credentials", secrets.clone(), 512 * 1024)
                    .map_err(|_| IdentityError::Invalid)?,
            )
            .map_err(|_| IdentityError::Unavailable)
    }
    pub(super) fn open(&self, kind: &str, value: Option<Value>) -> IdentityResult<Value> {
        value
            .map(|v| {
                self.cipher
                    .open(&format!("application:{kind}"), v)
                    .map(|v| v.as_value().clone())
                    .map_err(|_| IdentityError::Unavailable)
            })
            .unwrap_or(Ok(json!({})))
    }
    pub(super) async fn read(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        kind: &str,
        lock: bool,
    ) -> IdentityResult<IntegrationDocument> {
        let defaults = application_settings::defaults(kind)?;
        sqlx::query("insert into application_settings(kind,values) values($1,$2) on conflict(kind) do nothing").bind(kind).bind(defaults).execute(&mut **tx).await.map_err(db_error)?;
        let sql = if lock {
            "select revision,values,credentials from application_settings where kind=$1 for update"
        } else {
            "select revision,values,credentials from application_settings where kind=$1"
        };
        let row = sqlx::query(sql)
            .bind(kind)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?;
        Ok(IntegrationDocument {
            revision: row.get::<i64, _>("revision") as u64,
            values: row.get("values"),
            secrets: self.open(kind, row.get("credentials"))?,
        })
    }
    pub async fn audit_key(
        pool: &PgPool,
        cipher: &ProviderCredentialCipher,
        node: &str,
    ) -> IdentityResult<Option<String>> {
        let value: Option<Option<Value>> =
            sqlx::query_scalar("select credentials from application_settings where kind='audit'")
                .fetch_optional(pool)
                .await
                .map_err(db_error)?;
        let Some(Some(value)) = value else {
            return Ok(None);
        };
        let secrets = cipher
            .open("application:audit", value)
            .map_err(|_| IdentityError::Unavailable)?;
        Ok(secrets.as_value()[node]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(str::to_owned))
    }
}
#[async_trait::async_trait]
impl ApplicationSettingsStore for PgApplicationSettings {
    async fn backup_storage(
        &self,
        s: &IdentitySession,
        revision: Option<u64>,
        enabled: Option<bool>,
    ) -> IdentityResult<Value> {
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        Self::authorize(&mut tx, s).await?;
        let row=sqlx::query("select storage_revision,storage_enabled,last_verified_at is not null verified from backup_settings where id=1 for update").fetch_one(&mut *tx).await.map_err(db_error)?;
        if let Some(enabled) = enabled {
            if revision != Some(row.get::<i64, _>("storage_revision") as u64) {
                return Err(IdentityError::Conflict);
            }
            if enabled && !row.get::<bool, _>("verified") {
                return Err(IdentityError::Invalid);
            }
            let active:bool=sqlx::query_scalar("select exists(select 1 from backup_records where status in('queued','dumping','uploading'))").fetch_one(&mut *tx).await.map_err(db_error)?;
            if active {
                return Err(IdentityError::Conflict);
            }
            sqlx::query("update backup_settings set storage_enabled=$1,storage_revision=storage_revision+1,schedule_enabled=case when $1 then schedule_enabled else false end,next_run_at=case when $1 then next_run_at else null end,updated_at=clock_timestamp() where id=1").bind(enabled).execute(&mut *tx).await.map_err(db_error)?;
            sqlx::query("insert into identity_audit_events(actor_kind,actor_id,session_id,action,target_kind,metadata) values('management_principal',$1,$2,'backup.storage_enabled','backup_settings',$3)").bind(match s.owner{IdentityOwner::Management(id)=>id.as_uuid(),_=>unreachable!()}).bind(s.id.to_string()).bind(json!({"enabled":enabled})).execute(&mut *tx).await.map_err(db_error)?;
        }
        let v:Value=sqlx::query_scalar("select jsonb_build_object('revision',storage_revision,'enabled',storage_enabled) from backup_settings where id=1").fetch_one(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(v)
    }
    async fn claim_mail(
        &self,
    ) -> IdentityResult<Option<(uuid::Uuid, uuid::Uuid, String, String, Value)>> {
        let lease = uuid::Uuid::now_v7();
        let row=sqlx::query("update integration_mail_outbox set lease=$1,attempts=attempts+1,next_attempt_at=clock_timestamp()+interval '60 seconds' where id=(select id from integration_mail_outbox where delivered_at is null and next_attempt_at<=clock_timestamp() and attempts<12 order by next_attempt_at for update skip locked limit 1) returning id,email,purpose,variables").bind(lease).fetch_optional(&self.pool).await.map_err(db_error)?;
        Ok(row.map(|r| {
            (
                r.get("id"),
                lease,
                r.get("email"),
                r.get("purpose"),
                r.get("variables"),
            )
        }))
    }
    async fn finish_mail(&self, id: uuid::Uuid, lease: uuid::Uuid, ok: bool) -> IdentityResult<()> {
        sqlx::query("update integration_mail_outbox set delivered_at=case when $3 then clock_timestamp() else null end,lease=null,next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::double precision) where id=$1 and lease=$2").bind(id).bind(lease).bind(ok).execute(&self.pool).await.map_err(db_error)?;
        Ok(())
    }
    async fn load(
        &self,
        kind: &str,
        current: Option<&IdentitySession>,
    ) -> IdentityResult<IntegrationDocument> {
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        if let Some(s) = current {
            Self::authorize(&mut tx, s).await?;
        }
        let d = self.read(&mut tx, kind, false).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(d)
    }
    async fn save(
        &self,
        kind: &str,
        s: &IdentitySession,
        revision: u64,
        values: Value,
        input: Value,
    ) -> IdentityResult<IntegrationDocument> {
        application_settings::validate(kind, &values)?;
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        Self::authorize(&mut tx, s).await?;
        let mut d = self.read(&mut tx, kind, true).await?;
        if revision != d.revision {
            return Err(IdentityError::Conflict);
        }
        for (key, value) in input.as_object().ok_or(IdentityError::Invalid)? {
            let allowed = match kind {
                "mail" => key == "smtpPassword",
                "payment" => ["privateKey", "publicKey"].contains(&key.as_str()),
                "audit" => {
                    key.len() <= 64
                        && key
                            .bytes()
                            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
                }
                _ => false,
            };
            if !allowed {
                return Err(IdentityError::Invalid);
            }
            if value.is_null() {
                d.secrets
                    .as_object_mut()
                    .ok_or(IdentityError::Unavailable)?
                    .remove(key);
            } else {
                let value = value
                    .as_str()
                    .filter(|v| v.len() <= 16384 && !v.contains('\0'))
                    .ok_or(IdentityError::Invalid)?;
                if !value.is_empty() {
                    d.secrets[key] = json!(value);
                }
            }
        }
        if kind == "payment" {
            if let Some(key) = d.secrets["privateKey"].as_str() {
                alipay::private_key(key)?;
            }
            if let Some(key) = d.secrets["publicKey"].as_str() {
                alipay::public_key(key)?;
            }
            if values["enabled"] == true
                && ["privateKey", "publicKey"]
                    .iter()
                    .any(|k| d.secrets[*k].as_str().is_none_or(str::is_empty))
            {
                return Err(IdentityError::Invalid);
            }
        }
        if kind == "audit" {
            for key in d
                .secrets
                .as_object()
                .ok_or(IdentityError::Unavailable)?
                .keys()
            {
                let exists:bool=sqlx::query_scalar("select exists(select 1 from workspace_settings w,jsonb_array_elements(w.values->'audit'->'shared'->'endpoints') n where w.kind='features' and n->>'id'=$1)").bind(key).fetch_one(&mut *tx).await.map_err(db_error)?;
                if !exists && input.get(key).is_some() {
                    return Err(IdentityError::Invalid);
                }
            }
        }
        if kind == "payment" {
            for offer in values["userOffers"]
                .as_array()
                .ok_or(IdentityError::Invalid)?
            {
                let exists: bool = sqlx::query_scalar(
                    "select exists(select 1 from identity_users where id::text=$1)",
                )
                .bind(offer["userId"].as_str())
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
                if !exists {
                    return Err(IdentityError::Invalid);
                }
            }
        }
        sqlx::query("update application_settings set values=$1,credentials=$2,revision=revision+1,updated_at=clock_timestamp() where kind=$3").bind(&values).bind(self.seal(kind,&d.secrets)?).bind(kind).execute(&mut *tx).await.map_err(db_error)?;
        sqlx::query("insert into identity_audit_events(actor_kind,actor_id,session_id,action,target_kind,metadata) values('management_principal',$1,$2,'application_settings.updated','application_settings',$3)").bind(match s.owner{IdentityOwner::Management(id)=>id.as_uuid(),_=>unreachable!()}).bind(s.id.to_string()).bind(json!({"kind":kind,"revision":revision+1,"changedSecrets":input.as_object().map(|v|v.keys().collect::<Vec<_>>())})).execute(&mut *tx).await.map_err(db_error)?;
        d.values = values;
        d.revision += 1;
        tx.commit().await.map_err(db_error)?;
        Ok(d)
    }
    async fn audit_probe(&self, s: &IdentitySession, id: &str) -> IdentityResult<Value> {
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        Self::authorize(&mut tx, s).await?;
        let node:Option<Value>=sqlx::query_scalar("select n from workspace_settings w,jsonb_array_elements(w.values->'audit'->'shared'->'endpoints') n where w.kind='features' and n->>'id'=$1").bind(id).fetch_optional(&mut *tx).await.map_err(db_error)?;
        let node = node.ok_or(IdentityError::NotFound)?;
        tx.commit().await.map_err(db_error)?;
        let mut builder = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_millis(
                node["timeoutMs"]
                    .as_str()
                    .and_then(|v| v.parse::<u64>().ok())
                    .unwrap_or(5000),
            ));
        if let Some(proxy) = node["proxyId"]
            .as_str()
            .filter(|v| !v.is_empty() && *v != "direct")
        {
            let url: String =
                sqlx::query_scalar("select proxy_url from outbound_proxies where id=$1")
                    .bind(proxy)
                    .fetch_one(&self.pool)
                    .await
                    .map_err(db_error)?;
            builder = builder.proxy(reqwest::Proxy::all(&url).map_err(|_| IdentityError::Invalid)?);
        }
        let base = node["baseUrl"]
            .as_str()
            .ok_or(IdentityError::Invalid)?
            .trim_end_matches('/');
        let url = if base.ends_with("/systemone") {
            base.to_owned()
        } else if base.ends_with("/v1") {
            format!("{base}/systemone")
        } else {
            format!("{base}/v1/systemone")
        };
        let mut request=builder.build().map_err(|_|IdentityError::Unavailable)?.post(url).json(&json!({"model":node["model"],"state":"Connection verification","questions":{"connection":{"type":"noul","instructions":"Return true","criteria":{"true":"connection established","false":"connection failed"}}}}));
        if let Some(key) = Self::audit_key(&self.pool, &self.cipher, id).await? {
            request = request.bearer_auth(key)
        }
        let started = std::time::Instant::now();
        let response = request
            .send()
            .await
            .map_err(|_| IdentityError::Unavailable)?;
        if !response.status().is_success() {
            return Err(IdentityError::Unavailable);
        }
        let mut response = response;
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| IdentityError::Unavailable)?
        {
            if bytes.len() + chunk.len() > 262144 {
                return Err(IdentityError::Unavailable);
            }
            bytes.extend(chunk);
        }
        let value: Value =
            serde_json::from_slice(&bytes).map_err(|_| IdentityError::Unavailable)?;
        if value["answers"]["connection"]["type"] != "noul"
            || value["answers"]["connection"]["noul"]
                .as_f64()
                .is_none_or(|v| !(0.0..=1.0).contains(&v))
        {
            return Err(IdentityError::Unavailable);
        }
        Ok(json!({"ok":true,"latencyMs":started.elapsed().as_millis()}))
    }
    async fn payment_command(
        &self,
        s: &IdentitySession,
        input: Value,
        origin: &str,
    ) -> IdentityResult<Value> {
        payments::command(self, s, input, origin).await
    }
    async fn payment_notification(&self, input: Vec<(String, String)>) -> IdentityResult<()> {
        payments::notify(self, input).await
    }
}

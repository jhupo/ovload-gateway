//! Jev Noul adapter and durable enforcement. API shape: docs.typesafe.ai/api/system-one.
use super::{identity::db_error, workspace_settings};
use futures::future::BoxFuture;
use ovload_admin::model::{
    identity_access::IdentityError, workspace_settings::WorkspaceSettingsKind,
};
use ovload_core::{
    content_audit::{AuditContext, AuditPlan, ContentAudit},
    error::{ClientVisibleUpstreamError, GatewayError, GatewayErrorKind},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use uuid::Uuid;

pub(crate) struct PgContentAudit {
    pool: PgPool,
    capacity: Arc<tokio::sync::Semaphore>,
    cipher: Option<super::ProviderCredentialCipher>,
}
impl PgContentAudit {
    pub(crate) fn new(pool: PgPool) -> Self {
        Self {
            pool,
            capacity: Arc::new(tokio::sync::Semaphore::new(32)),
            cipher: None,
        }
    }
    pub(crate) fn with_settings_cipher(mut self, cipher: super::ProviderCredentialCipher) -> Self {
        self.cipher = Some(cipher);
        self
    }
}
fn unavailable(_: impl std::fmt::Debug) -> GatewayError {
    GatewayError::new(
        GatewayErrorKind::UpstreamUnavailable,
        "content audit is unavailable",
    )
}
fn number(v: &Value, default: f64) -> f64 {
    v.as_str().and_then(|s| s.parse().ok()).unwrap_or(default)
}
fn denied(settings: &Value) -> GatewayError {
    GatewayError::new(
        GatewayErrorKind::PolicyDenied,
        "content rejected by site audit policy",
    )
    .with_client_visible_upstream_error(ClientVisibleUpstreamError::new(
        settings["blockMessage"]
            .as_str()
            .filter(|s| !s.is_empty())
            .unwrap_or("Content rejected by site audit policy"),
        Some("content_audit_blocked".into()),
        Some("content_policy_error".into()),
    ))
    .with_http_status(number(&settings["blockStatus"], 403.) as u16)
}
impl ContentAudit for PgContentAudit {
    fn prepare(
        &self,
        mut context: AuditContext,
        input: String,
    ) -> BoxFuture<'_, Result<Option<AuditPlan>, GatewayError>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await.map_err(unavailable)?;
            let settings =
                workspace_settings::load(&mut tx, WorkspaceSettingsKind::Features, false)
                    .await
                    .map_err(unavailable)?
                    .values["audit"]
                    .clone();
            tx.commit().await.map_err(unavailable)?;
            if settings["prompt"]["enabled"] != true && settings["content"]["enabled"] != true {
                return Ok(None);
            }
            let groups = settings["shared"]["groupIds"]
                .as_array()
                .ok_or_else(|| unavailable(()))?;
            context
                .groups
                .retain(|id| groups.iter().any(|g| g.as_str() == Some(id.as_str())));
            if context.groups.is_empty() {
                return Ok(None);
            }
            let hash = Sha256::digest(context.request_id.as_bytes());
            let bucket = u16::from_be_bytes([hash[0], hash[1]]) as f64 / 65536. * 100.;
            if bucket >= number(&settings["shared"]["sampleRate"], 100.) {
                return Ok(None);
            }
            let plan = AuditPlan {
                context,
                config: settings,
            };
            if plan.config["prompt"]["enabled"] == true {
                self.evaluate(&plan, "input", &input, input.chars().count() > 1000000)
                    .await?;
            }
            Ok(Some(plan))
        })
    }
    fn evaluate<'a>(
        &'a self,
        plan: &'a AuditPlan,
        stage: &'a str,
        text: &'a str,
        overflow: bool,
    ) -> BoxFuture<'a, Result<(), GatewayError>> {
        Box::pin(async move {
            let start = Instant::now();
            let settings = &plan.config[if stage == "input" {
                "prompt"
            } else {
                "content"
            }];
            let shared = &plan.config["shared"];
            let evaluation = async {
                let _permit = self.capacity.clone().try_acquire_owned().map_err(|_| ())?;
                if overflow {
                    return Err(());
                }
                let mode = shared["keywordMode"].as_str().unwrap_or("api_only");
                let folded = text.to_lowercase();
                let keyword = shared["keywords"]
                    .as_str()
                    .unwrap_or_default()
                    .split([',', '\n', '\r'])
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .any(|s| folded.contains(&s.to_lowercase()));
                if mode == "keyword_only" {
                    return Ok((
                        keyword,
                        keyword,
                        if keyword {
                            vec![json!({"category":"keyword","score":1.0,"threshold":1.0})]
                        } else {
                            vec![]
                        },
                        if keyword {
                            "Keyword matched".to_owned()
                        } else {
                            "Passed".to_owned()
                        },
                    ));
                }
                if mode == "keyword_and_api"
                    && !keyword
                    && !shared["keywords"]
                        .as_str()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return Ok((false, false, vec![], "No keyword matched".to_owned()));
                }
                let rules = settings["rules"]
                    .as_array()
                    .ok_or(())?
                    .iter()
                    .filter(|r| r["enabled"] == true)
                    .collect::<Vec<_>>();
                let nodes = shared["endpoints"]
                    .as_array()
                    .ok_or(())?
                    .iter()
                    .filter(|n| n["enabled"] == true)
                    .collect::<Vec<_>>();
                if rules.is_empty() || nodes.is_empty() {
                    return Err(());
                }
                let questions=rules.iter().enumerate().map(|(i,r)|(format!("rule_{i}"),json!({"type":"noul","instructions":r["instructions"],"criteria":{"true":r["trueCriteria"],"false":r["falseCriteria"]}}))).collect::<serde_json::Map<_,_>>();
                let retries = number(&shared["retries"], 0.) as usize;
                for attempt in 0..=retries {
                    let node = nodes[attempt % nodes.len()];
                    if text.chars().count() > number(&node["stateCharLimit"], 100000.) as usize {
                        continue;
                    }
                    let response=async {
                    let mut builder=reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_millis(number(&node["timeoutMs"],5000.) as u64));
                    if let Some(proxy)=node["proxyId"].as_str().filter(|p|!p.is_empty()&&*p!="direct") {
                        let url:String=sqlx::query_scalar("select proxy_url from outbound_proxies where id=$1").bind(proxy).fetch_one(&self.pool).await.map_err(|_|())?;
                        builder=builder.proxy(reqwest::Proxy::all(&url).map_err(|_|())?);
                    }
                    let client=builder.build().map_err(|_|())?;
                    let base=node["baseUrl"].as_str().ok_or(())?.trim_end_matches('/');
                    let url=if base.ends_with("/systemone") {base.to_owned()} else if base.ends_with("/v1") {format!("{base}/systemone")} else {format!("{base}/v1/systemone")};
                    let mut request=client.post(url).json(&json!({"model":node["model"],"state":text,"questions":questions}));
                    let saved=if let Some(cipher)=&self.cipher{super::application_settings::PgApplicationSettings::audit_key(&self.pool,cipher,node["id"].as_str().ok_or(())?).await.map_err(|_|())?}else{None};
                    if let Some(key)=saved {request=request.bearer_auth(key);}else if let Ok(keys)=std::env::var("OVLOAD_AUDIT_API_KEYS") {
                        let keys:Value=serde_json::from_str(&keys).map_err(|_|())?;
                        if let Some(key)=node["id"].as_str().and_then(|id|keys[id].as_str()) {request=request.bearer_auth(key);}
                    } else if let Ok(key)=std::env::var("OVLOAD_AUDIT_API_KEY") {request=request.bearer_auth(key);}
                    let mut response=request.send().await.map_err(|_|())?.error_for_status().map_err(|_|())?;
                    let mut bytes=Vec::new();
                    while let Some(chunk)=response.chunk().await.map_err(|_|())? { if bytes.len()+chunk.len()>262144 {return Err(());} bytes.extend_from_slice(&chunk); }
                    let value:Value=serde_json::from_slice(&bytes).map_err(|_|())?;
                    let mut hit=false; let mut flag=false; let mut risks=Vec::new(); let mut labels=Vec::new();
                    for (i,rule) in rules.iter().enumerate() {
                        let answer=&value["answers"][format!("rule_{i}")];
                        if answer["type"]!="noul" {return Err(());}
                        let score=answer["noul"].as_f64().filter(|n|n.is_finite()&&(0.0..=1.0).contains(n)).ok_or(())?*100.;
                        let threshold=number(&rule["hitThreshold"],100.);
                        hit|=score>=threshold; flag|=score>=number(&rule["flagThreshold"],100.);
                        if score>=number(&rule["flagThreshold"],100.) {labels.push(rule["name"].as_str().unwrap_or("Rule").to_owned());}
                        risks.push(json!({"category":"custom","name":rule["name"],"score":score/100.,"threshold":threshold/100.}));
                    }
                    Ok((hit,flag,risks,if labels.is_empty() {"Passed".to_owned()} else {labels.join(", ")}))
                }.await;
                    if response.is_ok() {
                        return response;
                    }
                }
                Err(())
            };
            let evaluation = tokio::time::timeout(Duration::from_secs(30), evaluation)
                .await
                .unwrap_or(Err(()));
            let (hit, flag, risks, summary, failed) = match evaluation {
                Ok((h, f, r, s)) => (h, f, r, s, false),
                Err(()) => (
                    false,
                    false,
                    vec![],
                    if overflow {
                        "Audit input exceeded configured limit"
                    } else {
                        "Audit service failed"
                    }
                    .to_owned(),
                    true,
                ),
            };
            let block = (hit && settings["mode"] == "block")
                || (failed && settings["failureAction"] == "block");
            if hit || flag || failed || shared["recordNonHits"] == true {
                let persistence = async {
            let mut tx=self.pool.begin().await.map_err(unavailable)?;
            sqlx::query("set local statement_timeout='5s'").execute(&mut *tx).await.map_err(unavailable)?;
            // Serialize violation counters for this customer without holding locks during HTTP.
            sqlx::query("select id from identity_tenants where id=$1 for key share").bind(plan.context.identity.tenant_id.as_uuid()).execute(&mut *tx).await.map_err(unavailable)?;
            sqlx::query("select id from identity_users where id=$1 for update").bind(plan.context.identity.user_id.as_uuid()).execute(&mut *tx).await.map_err(unavailable)?;
            let user=sqlx::query("select display_name,email from identity_users where id=$1").bind(plan.context.identity.user_id.as_uuid()).fetch_one(&mut *tx).await.map_err(unavailable)?;
            let id=Uuid::now_v7();
            let result=if block {"blocked"} else if failed {"error"} else if hit||flag {"flagged"} else {"pass"};
            let record=json!({"id":id,"at":chrono::Utc::now(),"stage":stage,"groupId":plan.context.groups.first(),"user":user.get::<String,_>("display_name"),"email":user.get::<String,_>("email"),"keyId":plan.context.identity.key_id.as_str(),"keyName":plan.context.key_name,"endpoint":plan.context.endpoint,"model":plan.context.model,"result":result,"action":if block {"blocked"} else if failed {"failed"} else {"recorded"},"latencyMs":start.elapsed().as_millis() as u64,"summary":summary,"risks":risks});
            let days=number(&shared[if hit||flag||failed {"hitRetentionDays"} else {"nonHitRetentionDays"}],1.) as i32;
            let stored:Option<Uuid>=sqlx::query_scalar("insert into content_audit_records(id,request_id,user_id,stage,hit,record,expires_at) values($1,$2,$3,$4,$5,$6,clock_timestamp()+make_interval(days=>$7)) on conflict(request_id,stage) do nothing returning id")
                .bind(id).bind(&plan.context.request_id).bind(plan.context.identity.user_id.as_uuid()).bind(stage).bind(hit).bind(record).bind(days).fetch_optional(&mut *tx).await.map_err(unavailable)?;
            if stored.is_some()&&hit&&settings["emailOnHit"]==true {
                sqlx::query("insert into content_audit_notifications(record_id) values($1)").bind(id).execute(&mut *tx).await.map_err(unavailable)?;
            }
            if stored.is_some()&&hit&&settings["autoBan"]==true {
                sqlx::query("insert into content_audit_violations(request_id,stage,user_id) values($1,$2,$3) on conflict do nothing").bind(&plan.context.request_id).bind(stage).bind(plan.context.identity.user_id.as_uuid()).execute(&mut *tx).await.map_err(unavailable)?;
                let count:i64=sqlx::query_scalar("select count(distinct request_id) from content_audit_violations where user_id=$1 and created_at>=clock_timestamp()-make_interval(hours=>$2)").bind(plan.context.identity.user_id.as_uuid()).bind(number(&settings["violationHours"],720.) as i32).fetch_one(&mut *tx).await.map_err(unavailable)?;
                if count>=number(&settings["banThreshold"],10.) as i64 {
                    sqlx::query("update identity_users set status='suspended',revision=revision+1,authority_generation=authority_generation+1,updated_at=clock_timestamp() where id=$1 and status='active'").bind(plan.context.identity.user_id.as_uuid()).execute(&mut *tx).await.map_err(unavailable)?;
                    sqlx::query("insert into identity_audit_events(tenant_id,actor_kind,action,target_kind,target_id,metadata) values($1,'system','content_audit.auto_banned','user',$2,$3)").bind(plan.context.identity.tenant_id.as_uuid()).bind(plan.context.identity.user_id.as_uuid()).bind(json!({"request_id":plan.context.request_id,"violations":count})).execute(&mut *tx).await.map_err(unavailable)?;
                }
            }
            sqlx::query("delete from content_audit_records where id in(select id from content_audit_records where expires_at<clock_timestamp() limit 500)").execute(&mut *tx).await.map_err(unavailable)?;
            tx.commit().await.map_err(unavailable)?;
            Ok::<(),GatewayError>(())
            }.await;
                if persistence.is_err() && settings["failureAction"] == "block" {
                    return Err(denied(settings));
                }
            }
            if block { Err(denied(settings)) } else { Ok(()) }
        })
    }
}

pub(super) async fn claim_notification(
    pool: &PgPool,
) -> Result<Option<(Uuid, String, String)>, IdentityError> {
    let row=sqlx::query("with candidate as(select id from content_audit_notifications where delivered_at is null and attempts<8 and next_attempt_at<=clock_timestamp() order by next_attempt_at for update skip locked limit 1), leased as(update content_audit_notifications n set attempts=attempts+1,next_attempt_at=clock_timestamp()+interval '5 minutes' from candidate c where n.id=c.id returning n.id,n.record_id) select l.id,u.email,r.record->>'summary' summary from leased l join content_audit_records r on r.id=l.record_id join identity_users u on u.id=r.user_id").fetch_optional(pool).await.map_err(db_error)?;
    Ok(row.map(|r| (r.get("id"), r.get("email"), r.get("summary"))))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ovload_core::{
        access::{TenantId, UserId},
        engine::authentication::ModelKeyIdentity,
        policy::ClientApiKeyId,
    };
    #[tokio::test]
    #[ignore = "requires the independent engagement verification database and a local Jev fixture"]
    async fn audit_policy_enforcement_with_real_database_and_http() {
        let url = std::env::var("DATABASE_URL").unwrap();
        assert!(
            url.ends_with("/ovload_engagement_verify"),
            "must use an isolated verification database"
        );
        let mock = std::env::var("OVLOAD_AUDIT_TEST_URL").unwrap();
        let pool = PgPool::connect(&url).await.unwrap();
        let original: Value =
            sqlx::query_scalar("select values from workspace_settings where kind='features'")
                .fetch_one(&pool)
                .await
                .unwrap();
        let user = Uuid::now_v7();
        let tenant = Uuid::now_v7();
        sqlx::query(
            "insert into identity_tenants(id,slug,display_name) values($1,$2,'Audit verification')",
        )
        .bind(tenant)
        .bind(format!("audit-{tenant}"))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("insert into identity_tenant_wallets(tenant_id) values($1)")
            .bind(tenant)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("insert into identity_users(id,tenant_id,email,display_name,password_hash) values($1,$2,$3,'Audit verification','unused-test-hash')").bind(user).bind(tenant).bind(format!("audit-{user}@example.com")).execute(&pool).await.unwrap();
        let mut config = WorkspaceSettingsKind::Features.defaults()["audit"].clone();
        config["prompt"]["enabled"] = json!(true);
        config["prompt"]["mode"] = json!("block");
        config["shared"]["groupIds"] = json!(["audit-group"]);
        config["shared"]["keywordMode"] = json!("keyword_only");
        config["shared"]["keywords"] = json!("forbidden");
        config["prompt"]["blockMessage"] = json!("Custom audit rejection");
        let port = PgContentAudit::new(pool.clone());
        async fn save(pool: &PgPool, config: &Value) {
            sqlx::query("update workspace_settings set values=jsonb_set(values,'{audit}',$1) where kind='features'").bind(config).execute(pool).await.unwrap();
        }
        let context = || AuditContext {
            request_id: format!("verify-{}", Uuid::now_v7()),
            identity: ModelKeyIdentity {
                key_id: ClientApiKeyId::new("verification-key").unwrap(),
                tenant_id: TenantId::new(tenant),
                user_id: UserId::new(user),
                key_generation: 1,
                user_generation: 1,
                tenant_generation: 1,
            },
            groups: vec!["audit-group".into()],
            endpoint: "/v1/chat/completions".into(),
            model: "local-verification".into(),
            key_name: "verification".into(),
        };
        save(&pool, &config).await;
        let rejected = port
            .prepare(context(), "FORBIDDEN content".into())
            .await
            .err()
            .unwrap();
        assert_eq!(rejected.http_status(), Some(403));
        assert_eq!(rejected.client_message(), "Custom audit rejection");
        assert!(
            port.prepare(context(), "clean content".into())
                .await
                .unwrap()
                .is_some()
        );
        config["prompt"]["mode"] = json!("observe");
        save(&pool, &config).await;
        assert!(
            port.prepare(context(), "forbidden observed".into())
                .await
                .is_ok()
        );
        config["shared"]["sampleRate"] = json!("0");
        save(&pool, &config).await;
        assert!(
            port.prepare(context(), "forbidden unsampled".into())
                .await
                .unwrap()
                .is_none()
        );
        config["shared"]["sampleRate"] = json!("100");
        save(&pool, &config).await;
        let mut other = context();
        other.groups = vec!["other".into()];
        assert!(
            port.prepare(other, "forbidden outside scope".into())
                .await
                .unwrap()
                .is_none()
        );
        config["prompt"]["mode"] = json!("block");
        config["shared"]["keywordMode"] = json!("api_only");
        config["shared"]["endpoints"] = json!([{"id":"fixture","name":"Fixture","baseUrl":mock,"model":"jev-latest","timeoutMs":"500","enabled":true,"stateCharLimit":"100000","proxyId":"direct"}]);
        config["prompt"]["rules"] = json!([{"id":"rule","name":"Local risk","enabled":true,"instructions":"Is the input unsafe?","trueCriteria":"unsafe","falseCriteria":"safe","flagThreshold":"70","hitThreshold":"90"}]);
        save(&pool, &config).await;
        assert!(port.prepare(context(), "api_hit".into()).await.is_err());
        assert!(port.prepare(context(), "api_clean".into()).await.is_ok());
        config["prompt"]["failureAction"] = json!("allow");
        save(&pool, &config).await;
        assert!(port.prepare(context(), "malformed".into()).await.is_ok());
        config["prompt"]["failureAction"] = json!("block");
        config["prompt"]["blockStatus"] = json!("422");
        save(&pool, &config).await;
        assert_eq!(
            port.prepare(context(), "malformed".into())
                .await
                .err()
                .unwrap()
                .http_status(),
            Some(422)
        );
        let node = config["shared"]["endpoints"][0].clone();
        let mut fail = node.clone();
        fail["baseUrl"] = json!(format!("{mock}/fail"));
        config["shared"]["endpoints"] = json!([fail, node]);
        config["shared"]["retries"] = json!("1");
        save(&pool, &config).await;
        assert!(
            port.prepare(context(), "api_clean_after_failover".into())
                .await
                .is_ok()
        );
        config["shared"]["keywordMode"] = json!("keyword_only");
        config["prompt"]["autoBan"] = json!(true);
        config["prompt"]["emailOnHit"] = json!(true);
        config["prompt"]["banThreshold"] = json!("2");
        save(&pool, &config).await;
        assert!(
            port.prepare(context(), "forbidden first violation".into())
                .await
                .is_err()
        );
        // Deleting a sample must not clear the violation counter.
        sqlx::query("delete from content_audit_records where user_id=$1 and hit")
            .bind(user)
            .execute(&pool)
            .await
            .unwrap();
        assert!(
            port.prepare(context(), "forbidden second violation".into())
                .await
                .is_err()
        );
        let status: String = sqlx::query_scalar("select status from identity_users where id=$1")
            .bind(user)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(status, "suspended");
        let generation: i64 =
            sqlx::query_scalar("select authority_generation from identity_users where id=$1")
                .bind(user)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(generation, 2);
        let queued:i64=sqlx::query_scalar("select count(*) from content_audit_notifications n join content_audit_records r on r.id=n.record_id where r.user_id=$1").bind(user).fetch_one(&pool).await.unwrap();
        assert_eq!(queued, 1);
        sqlx::query("update workspace_settings set values=$1 where kind='features'")
            .bind(original)
            .execute(&pool)
            .await
            .unwrap();
        println!(
            "Validated keyword/API decisions, thresholds, malformed replies, failover, sampling, scope, custom rejection, notice outbox and durable auto-ban counters"
        );
    }
}

//! Canonical customer paging, financial visibility and atomic profile authority.

use chrono::{Duration, Utc};
use ovload_admin::{
    model::{
        commerce::CommerceCommand,
        identity::{CustomerUserRecord, IdentityStatus},
        identity_access::*,
        identity_lifecycle::*,
    },
    ports::{
        commerce::CommerceStore as _, identity::IdentityStore as _,
        identity_lifecycle::IdentityLifecycleStore as _,
    },
};
use ovload_core::{
    access::{AccessSessionId, ManagementPrincipalId, TenantId},
    engine::authentication::model_key_digest,
};
use ovload_store::postgres::{PgCommerceStore, PgIdentityLifecycleStore, PgIdentityStore};
use sqlx::PgPool;
use uuid::Uuid;

use super::TestDatabase;

async fn operator(
    pool: &PgPool,
    tenant: Option<TenantId>,
    permissions: Vec<&str>,
) -> IdentityManagementActor {
    let principal = Uuid::now_v7();
    let session = Uuid::now_v7();
    sqlx::query("insert into identity_management_principals(id,username,password_hash) values($1,$2,'synthetic-directory-hash')")
        .bind(principal).bind(format!("directory_{}", principal.simple()))
        .execute(pool).await.expect("seed management owner");
    sqlx::query("insert into identity_sessions(id,access_digest,csrf_digest,audience,principal_id,authority_generation,expires_at) values($1,$2,$3,'management',$4,1,$5)")
        .bind(session).bind(model_key_digest(&format!("fixture-access-{session}")).to_vec())
        .bind(model_key_digest(&format!("fixture-csrf-{session}")).to_vec()).bind(principal)
        .bind(Utc::now()+Duration::hours(1)).execute(pool).await.expect("seed live session");
    grant(pool, principal, tenant, permissions).await;
    IdentityManagementActor {
        session_id: AccessSessionId::new(session),
        principal_id: ManagementPrincipalId::new(principal),
        authority_generation: 1,
    }
}

async fn grant(pool: &PgPool, principal: Uuid, tenant: Option<TenantId>, permissions: Vec<&str>) {
    sqlx::query("insert into identity_grants(principal_id,tenant_id,permissions) values($1,$2,$3)")
        .bind(principal)
        .bind(tenant.map(TenantId::as_uuid))
        .bind(permissions)
        .execute(pool)
        .await
        .expect("seed scope grant");
}

async fn customer(
    store: &PgIdentityStore,
    actor: IdentityManagementActor,
    name: &str,
) -> CustomerUserRecord {
    store
        .provision_customer(
            actor,
            NewCustomerIdentity {
                tenant_id: Uuid::now_v7().into(),
                user_id: Uuid::now_v7().into(),
                slug: format!("directory-{}", Uuid::now_v7().simple()),
                email: format!("{name}@fixture.example"),
                display_name: name.into(),
                password_hash: "$argon2id$synthetic-directory-original".into(),
                max_concurrency: 7,
                requests_per_minute: 91,
                notes: "Internal fixture note".into(),
            },
        )
        .await
        .expect("provision independent customer")
}

async fn assert_customer_audit(
    pool: &PgPool,
    actor: IdentityManagementActor,
    customer: &CustomerUserRecord,
    action: &str,
    description: &str,
) {
    let (kind, principal, session, reason): (String, Option<Uuid>, Option<String>, Option<String>) =
        sqlx::query_as(
            "select actor_kind,actor_id,session_id,reason from identity_audit_events
             where tenant_id=$1 and target_id=$2 and action=$3
             order by created_at desc,id desc limit 1",
        )
        .bind(customer.tenant_id.as_uuid())
        .bind(customer.id.as_uuid())
        .bind(action)
        .fetch_one(pool)
        .await
        .expect("committed customer audit evidence");
    assert_eq!(kind, "management_principal");
    assert_eq!(principal, Some(actor.principal_id.as_uuid()));
    assert_eq!(session, Some(actor.session_id.to_string()));
    assert_eq!(reason.as_deref(), Some(description));
}

fn query() -> CustomerDirectoryQuery {
    CustomerDirectoryQuery {
        tenant_id: None,
        page: 1,
        page_size: 2,
        query: String::new(),
        statuses: Vec::new(),
        sort: CustomerDirectorySort::DisplayName,
        descending: false,
    }
}

#[tokio::test]
async fn revoke_subscription_for_suspended_customer_preserves_revision_check() {
    let Some(db) = TestDatabase::create("subscription_revoke").await else {
        return;
    };
    let identity = PgIdentityStore::new(db.pool.clone());
    let commerce = PgCommerceStore::new(db.pool.clone());
    let admin = operator(
        &db.pool,
        None,
        vec!["identity.users.manage", "billing.manage"],
    )
    .await;
    let user = customer(&identity, admin, "Suspended").await;
    let plan = Uuid::now_v7();
    let subscription = Uuid::now_v7();
    sqlx::query("insert into commerce_plans(id,document) values($1,'{}')")
        .bind(plan)
        .execute(&db.pool)
        .await
        .expect("seed subscription plan");
    sqlx::query(
        "insert into commerce_subscriptions(id,tenant_id,user_id,plan_id,plan,ends_at)
         values($1,$2,$3,$4,'{}',now()+interval '1 day')",
    )
    .bind(subscription)
    .bind(user.tenant_id.as_uuid())
    .bind(user.id.as_uuid())
    .bind(plan)
    .execute(&db.pool)
    .await
    .expect("seed active subscription");
    identity
        .set_customer_active(
            admin,
            SetCustomerActive {
                tenant_id: user.tenant_id,
                user_id: user.id,
                expected_revision: 1,
                active: false,
            },
        )
        .await
        .expect("suspend customer");
    let session = IdentitySession {
        id: admin.session_id,
        owner: IdentityOwner::Management(admin.principal_id),
        authority_generation: admin.authority_generation,
        expires_at: Utc::now() + Duration::hours(1),
    };
    let revoke = |revision| CommerceCommand::Revoke {
        id: subscription,
        revision,
    };
    assert!(matches!(
        commerce.execute(&session, "stale".into(), revoke(2)).await,
        Err(IdentityError::Conflict)
    ));
    commerce
        .execute(&session, "revoke".into(), revoke(1))
        .await
        .expect("revoke suspended customer's subscription");
    let state: (bool, i64, i64) = sqlx::query_as(
        "select revoked,revision,quota_generation from commerce_subscriptions where id=$1",
    )
    .bind(subscription)
    .fetch_one(&db.pool)
    .await
    .expect("read revoked subscription");
    assert_eq!(state, (true, 2, 1));
    db.close().await;
}

#[tokio::test]
async fn directory_pages_global_facts_and_derives_all_live_scopes_without_balance_leaks() {
    let Some(db) = TestDatabase::create("customer_directory").await else {
        return;
    };
    let store = PgIdentityStore::new(db.pool.clone());
    let admin = operator(
        &db.pool,
        None,
        vec![
            "identity.users.read",
            "identity.users.manage",
            "billing.read",
        ],
    )
    .await;
    let alpha = customer(&store, admin, "Alpha").await;
    let beta = customer(&store, admin, "Beta").await;
    let gamma = customer(&store, admin, "Gamma").await;
    assert_customer_audit(
        &db.pool,
        admin,
        &alpha,
        "identity.customer_provisioned",
        "System-generated event description: customer account created.",
    )
    .await;
    let first = store
        .customers(admin, query())
        .await
        .expect("first global page");
    assert_eq!(first.total, 3);
    assert_eq!(
        first
            .items
            .iter()
            .map(|row| row.customer.id)
            .collect::<Vec<_>>(),
        vec![alpha.id, beta.id]
    );
    assert_eq!(first.items[0].balance_usd.as_deref(), Some("0.0000000000"));
    assert_eq!(first.items[0].max_concurrency, 7);
    assert_eq!(first.items[0].notes, "Internal fixture note");
    assert!(first.items[0].last_active_at.is_none());
    assert!(first.items[0].last_called_at.is_none());
    let second = store
        .customers(admin, CustomerDirectoryQuery { page: 2, ..query() })
        .await
        .expect("second page");
    assert_eq!(second.total, 3);
    assert_eq!(second.items[0].customer.id, gamma.id);
    let beyond = store
        .customers(
            admin,
            CustomerDirectoryQuery {
                page: 100,
                ..query()
            },
        )
        .await
        .expect("empty high page retains total");
    assert_eq!(beyond.total, 3);
    assert!(beyond.items.is_empty());
    let filtered = store
        .customers(
            admin,
            CustomerDirectoryQuery {
                query: "BETA@".into(),
                ..query()
            },
        )
        .await
        .expect("case insensitive global search");
    assert_eq!(filtered.total, 1);
    assert_eq!(filtered.items[0].customer.id, beta.id);
    let by_id = store
        .customers(
            admin,
            CustomerDirectoryQuery {
                query: gamma.id.to_string(),
                ..query()
            },
        )
        .await
        .expect("global UUID search");
    assert_eq!(by_id.items[0].customer.id, gamma.id);
    store
        .set_customer_active(
            admin,
            SetCustomerActive {
                tenant_id: beta.tenant_id,
                user_id: beta.id,
                expected_revision: 1,
                active: false,
            },
        )
        .await
        .expect("suspend one customer");
    assert_customer_audit(
        &db.pool,
        admin,
        &beta,
        "identity.customer_suspended",
        "System-generated event description: customer account suspended.",
    )
    .await;
    let suspended = store
        .customers(
            admin,
            CustomerDirectoryQuery {
                statuses: vec![IdentityStatus::Suspended],
                ..query()
            },
        )
        .await
        .expect("status filter");
    assert_eq!(suspended.total, 1);
    assert_eq!(suspended.items[0].customer.id, beta.id);
    store
        .set_customer_active(
            admin,
            SetCustomerActive {
                tenant_id: beta.tenant_id,
                user_id: beta.id,
                expected_revision: 2,
                active: true,
            },
        )
        .await
        .expect("activate the suspended customer without restoring sessions");
    assert_customer_audit(
        &db.pool,
        admin,
        &beta,
        "identity.customer_activated",
        "System-generated event description: customer account activated.",
    )
    .await;

    let scoped = operator(&db.pool, Some(alpha.tenant_id), vec!["identity.users.read"]).await;
    grant(
        &db.pool,
        scoped.principal_id.as_uuid(),
        Some(beta.tenant_id),
        vec!["identity.users.read"],
    )
    .await;
    let scope_page = store
        .customers(scoped, query())
        .await
        .expect("aggregate permitted scopes");
    assert_eq!(scope_page.total, 2);
    assert!(scope_page.items.iter().all(|row| row.balance_usd.is_none()));
    assert!(matches!(
        store
            .customers(
                scoped,
                CustomerDirectoryQuery {
                    sort: CustomerDirectorySort::BalanceUsd,
                    ..query()
                }
            )
            .await,
        Err(IdentityError::Forbidden)
    ));
    assert!(matches!(
        store
            .customers(
                scoped,
                CustomerDirectoryQuery {
                    tenant_id: Some(gamma.tenant_id),
                    ..query()
                }
            )
            .await,
        Err(IdentityError::Forbidden)
    ));
    assert!(matches!(
        store
            .customers(admin, CustomerDirectoryQuery { page: 0, ..query() })
            .await,
        Err(IdentityError::Invalid)
    ));
    sqlx::query("update identity_sessions set revoked_at=clock_timestamp() where id=$1")
        .bind(scoped.session_id.as_uuid())
        .execute(&db.pool)
        .await
        .expect("revoke management session");
    assert!(matches!(
        store.customers(scoped, query()).await,
        Err(IdentityError::Unauthorized)
    ));
    db.close().await;
}

#[tokio::test]
async fn profile_email_password_notes_and_limits_commit_together_and_revoke_prior_authority() {
    let Some(db) = TestDatabase::create("customer_profile_atomic").await else {
        return;
    };
    let identity = PgIdentityStore::new(db.pool.clone());
    let profiles = PgIdentityLifecycleStore::new(db.pool.clone());
    let admin = operator(
        &db.pool,
        None,
        vec!["identity.users.read", "identity.users.manage"],
    )
    .await;
    let owner = customer(&identity, admin, "Original").await;
    let other = customer(&identity, admin, "Other").await;
    let session = IdentitySession {
        id: Uuid::now_v7().into(),
        owner: IdentityOwner::Customer {
            tenant_id: owner.tenant_id,
            user_id: owner.id,
        },
        authority_generation: 1,
        expires_at: Utc::now() + Duration::hours(1),
    };
    let access_digest = model_key_digest("synthetic-customer-access");
    identity
        .create_session(NewIdentitySession {
            consent_revision: None,
            session: session.clone(),
            access_digest,
            csrf_digest: model_key_digest("synthetic-customer-csrf"),
            previous_session: None,
        })
        .await
        .expect("create real customer session");
    let before = identity
        .customers(admin, query())
        .await
        .expect("persisted successful activity");
    assert!(
        before
            .items
            .iter()
            .find(|row| row.customer.id == owner.id)
            .expect("owner row")
            .last_active_at
            .is_some()
    );
    let command = |expected_revision, email: String, note: &str| PreparedCustomerAccountUpdate {
        changes: CustomerAccountChanges {
            tenant_id: owner.tenant_id,
            user_id: owner.id,
            expected_revision,
            email,
            display_name: "Edited".into(),
            max_concurrency: 13,
            requests_per_minute: 137,
            notes: note.into(),
        },
        password_hash: Some("$argon2id$synthetic-directory-replacement".into()),
    };
    let result = profiles
        .update_customer(
            admin,
            command(1, "edited@fixture.example".into(), "Operator-only\nnotes"),
        )
        .await
        .expect("atomic management edit");
    assert_eq!(result.customer.revision, 2);
    assert_eq!(result.customer.email, "edited@fixture.example");
    assert_eq!(result.notes, "Operator-only\nnotes");
    assert_eq!(result.max_concurrency, 13);
    assert_eq!(result.customer_max_concurrency, 13);
    assert_eq!(result.requests_per_minute, 137);
    assert_eq!(result.customer_requests_per_minute, 137);
    assert!(result.email_verified_at.is_none());
    assert_customer_audit(
        &db.pool,
        admin,
        &owner,
        "identity.customer_updated",
        "System-generated event description: customer account updated.",
    )
    .await;
    assert!(
        identity
            .session(IdentityAudience::Customer, access_digest)
            .await
            .expect("revalidate prior session")
            .is_none()
    );
    assert!(matches!(
        profiles
            .update_customer(
                admin,
                command(1, "stale@fixture.example".into(), "Stale note")
            )
            .await,
        Err(IdentityError::Conflict)
    ));
    assert!(matches!(
        profiles
            .update_customer(admin, command(2, other.email, "Must roll back"))
            .await,
        Err(IdentityError::Conflict)
    ));
    let unchanged = profiles
        .customer(admin, owner.tenant_id, owner.id)
        .await
        .expect("read after failed edit");
    assert_eq!(unchanged.customer.revision, 2);
    assert_eq!(unchanged.notes, "Operator-only\nnotes");
    assert_eq!(unchanged.customer.email, "edited@fixture.example");
    let generation: i64 =
        sqlx::query_scalar("select authority_generation from identity_users where id=$1")
            .bind(owner.id.as_uuid())
            .fetch_one(&db.pool)
            .await
            .expect("durable authority generation");
    assert_eq!(generation, 2);
    db.close().await;
}

#[tokio::test]
async fn management_sessions_can_exceed_ten_and_honor_idle_timeout() {
    let Some(db) = TestDatabase::create("management_session_policy").await else {
        return;
    };
    let identities = PgIdentityStore::new(db.pool.clone());
    let profiles = PgIdentityLifecycleStore::new(db.pool.clone());
    let admin = operator(&db.pool, None, vec!["security.settings.manage"]).await;
    let owner = IdentityOwner::Management(admin.principal_id);
    let expires_at = Utc::now() + Duration::hours(1);
    for _ in 0..10 {
        let id = Uuid::now_v7();
        identities
            .create_session(NewIdentitySession {
                session: IdentitySession {
                    id: id.into(),
                    owner,
                    authority_generation: 1,
                    expires_at,
                },
                access_digest: model_key_digest(&format!("fixture-access-{id}")),
                csrf_digest: model_key_digest(&format!("fixture-csrf-{id}")),
                previous_session: None,
                consent_revision: None,
            })
            .await
            .expect("permit independent management sessions");
    }

    let access = model_key_digest(&format!("fixture-access-{}", admin.session_id.as_uuid()));
    let last_seen = Utc::now() - Duration::hours(2);
    let seed_last_seen = || {
        sqlx::query_scalar::<_, chrono::DateTime<Utc>>(
            "update identity_sessions set last_seen_at=$2 where id=$1 returning last_seen_at",
        )
        .bind(admin.session_id.as_uuid())
        .bind(last_seen)
        .fetch_one(&db.pool)
    };
    let last_seen = seed_last_seen().await.expect("seed old activity");
    let session = identities
        .session(IdentityAudience::Management, access)
        .await
        .expect("validate idle session with timeout off")
        .expect("session is valid");
    let actual: chrono::DateTime<Utc> =
        sqlx::query_scalar("select last_seen_at from identity_sessions where id=$1")
            .bind(admin.session_id.as_uuid())
            .fetch_one(&db.pool)
            .await
            .expect("read session activity");
    assert_eq!(actual, last_seen);

    let mut document = profiles
        .security_document(Some(&session))
        .await
        .expect("load authentication settings");
    document.policy.access_token_minutes = 1;
    profiles
        .save_security(&session, document)
        .await
        .expect("enable idle timeout");
    assert!(
        identities
            .session(IdentityAudience::Management, access)
            .await
            .expect("validate using activation baseline")
            .is_some()
    );
    seed_last_seen().await.expect("age session activity");
    sqlx::query("update authentication_security set idle_timeout_enabled_at=$1")
        .bind(last_seen)
        .execute(&db.pool)
        .await
        .expect("age timeout activation");
    assert!(
        identities
            .session(IdentityAudience::Management, access)
            .await
            .expect("check expired idle session")
            .is_none()
    );
    db.close().await;
}

#[tokio::test]
async fn quota_edits_and_redemption_keep_customer_sessions() {
    let Some(db) = TestDatabase::create("customer_quota_sessions").await else {
        return;
    };
    let identities = PgIdentityStore::new(db.pool.clone());
    let profiles = PgIdentityLifecycleStore::new(db.pool.clone());
    let commerce = PgCommerceStore::new(db.pool.clone());
    let admin = operator(&db.pool, None, vec!["identity.users.manage"]).await;
    let customer = customer(&identities, admin, "Quota").await;
    let owner = IdentityOwner::Customer {
        tenant_id: customer.tenant_id,
        user_id: customer.id,
    };
    let mut sessions = Vec::new();
    for _ in 0..2 {
        let id = Uuid::now_v7();
        let session = IdentitySession {
            id: id.into(),
            owner,
            authority_generation: 1,
            expires_at: Utc::now() + Duration::hours(1),
        };
        let digest = model_key_digest(&format!("fixture-access-{id}"));
        identities
            .create_session(NewIdentitySession {
                session: session.clone(),
                access_digest: digest,
                csrf_digest: model_key_digest(&format!("fixture-csrf-{id}")),
                previous_session: None,
                consent_revision: None,
            })
            .await
            .expect("open customer browser session");
        sessions.push((session, digest));
    }
    profiles
        .update_customer(
            admin,
            PreparedCustomerAccountUpdate {
                changes: CustomerAccountChanges {
                    tenant_id: customer.tenant_id,
                    user_id: customer.id,
                    expected_revision: 1,
                    email: customer.email,
                    display_name: customer.display_name,
                    max_concurrency: 13,
                    requests_per_minute: 137,
                    notes: "Internal fixture note".into(),
                },
                password_hash: None,
            },
        )
        .await
        .expect("update customer quotas");
    let code = "SYNTHETIC-CONCURRENCY-CODE";
    sqlx::query(
        "insert into commerce_codes(id,code,kind,value,max_uses,per_user) values($1,$2,'concurrency',2,1,1)",
    )
    .bind(Uuid::now_v7())
    .bind(code)
    .execute(&db.pool)
    .await
    .expect("seed concurrency code");
    commerce
        .execute(
            &sessions[0].0,
            "quota-redemption".into(),
            CommerceCommand::Redeem { code: code.into() },
        )
        .await
        .expect("redeem concurrency on original session");
    for (_, digest) in sessions {
        assert!(
            identities
                .session(IdentityAudience::Customer, digest)
                .await
                .expect("validate session after quota changes")
                .is_some()
        );
    }
    let quotas: (i64, i64, i64, i64) = sqlx::query_as(
        "select max_concurrency,requests_per_minute,authority_generation,limits_revision
         from identity_users where id=$1",
    )
    .bind(customer.id.as_uuid())
    .fetch_one(&db.pool)
    .await
    .expect("read quota and credential generations");
    assert_eq!(quotas, (15, 137, 1, 2));
    db.close().await;
}

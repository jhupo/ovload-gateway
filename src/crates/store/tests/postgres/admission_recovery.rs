// Modified for Ovload on 2026-10-27: workspace integration.

//! 验证准入恢复读取精确时间窗口与运行中请求事实

use chrono::{DateTime, Duration, Utc};
use ovload_store::postgres::{
    ClientAdmissionRecentRequest, ClientAdmissionRecovery, ClientAdmissionRecoveryRepository,
    ClientAdmissionRunningRequest, PgClientAdmissionRecoveryRepository,
};
use sqlx::PgPool;

use super::TestDatabase;

#[tokio::test]
async fn recovery_loads_precise_window_and_running_request_facts() {
    let Some(database) = TestDatabase::create("admission_recovery").await else {
        return;
    };
    let now = DateTime::from_timestamp_micros(Utc::now().timestamp_micros())
        .expect("current time is representable at PostgreSQL precision");
    sqlx::query("insert into identity_tenants(id,slug,display_name) values ('00000000-0000-0000-0000-000000000001','recovery-customer','Recovery customer')")
        .execute(&database.pool).await.expect("seed recovery customer");
    sqlx::query("insert into identity_users(id,tenant_id,email,password_hash,display_name) values ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','recovery@example.test','fixture','Recovery user')")
        .execute(&database.pool).await.expect("seed recovery user");
    let window_started_at = now - Duration::seconds(60);
    seed_request(
        &database.pool,
        "old-running",
        now - Duration::seconds(120),
        now + Duration::seconds(30),
        "running",
    )
    .await;
    seed_request(
        &database.pool,
        "old-complete",
        now - Duration::seconds(90),
        now - Duration::seconds(30),
        "succeeded",
    )
    .await;
    seed_request(
        &database.pool,
        "recent-complete",
        now - Duration::seconds(20),
        now + Duration::seconds(10),
        "succeeded",
    )
    .await;
    seed_request(
        &database.pool,
        "recent-running",
        now - Duration::seconds(10),
        now + Duration::seconds(40),
        "running",
    )
    .await;
    seed_request(
        &database.pool,
        "old-missing-lease",
        now - Duration::seconds(121),
        now + Duration::seconds(50),
        "running",
    )
    .await;
    sqlx::query("delete from model_request_leases where request_id = 'old-missing-lease'")
        .execute(&database.pool)
        .await
        .expect("remove missing lease fixture");

    let repository = PgClientAdmissionRecoveryRepository::new(database.pool.clone());
    let actual = repository
        .load_client_admission_recovery(window_started_at)
        .await
        .expect("load precise admission recovery facts");
    let expected = vec![ClientAdmissionRecovery {
        scope: ovload_core::engine::admission::ClientAdmissionScope {
            group_id: None,
            client_api_key_id: ovload_core::policy::ClientApiKeyId::new("key-recovery").unwrap(),
            tenant_id: ovload_core::access::TenantId::new(uuid::Uuid::from_u128(1)),
            user_id: ovload_core::access::UserId::new(uuid::Uuid::from_u128(2)),
        },
        recent_requests: vec![
            ClientAdmissionRecentRequest {
                model_request_id: "recent-complete".to_owned(),
                started_at: now - Duration::seconds(20),
            },
            ClientAdmissionRecentRequest {
                model_request_id: "recent-running".to_owned(),
                started_at: now - Duration::seconds(10),
            },
        ],
        running_requests: vec![
            ClientAdmissionRunningRequest {
                model_request_id: "old-running".to_owned(),
                lease_expires_at: now + Duration::seconds(30),
            },
            ClientAdmissionRunningRequest {
                model_request_id: "recent-running".to_owned(),
                lease_expires_at: now + Duration::seconds(40),
            },
        ],
    }];
    assert_eq!(actual, expected);

    database.close().await;
}

async fn seed_request(
    pool: &PgPool,
    id: &str,
    started_at: DateTime<Utc>,
    lease_expires_at: DateTime<Utc>,
    outcome: &str,
) {
    let completed_at = (outcome != "running").then_some(started_at + Duration::seconds(1));
    sqlx::query(
        "insert into model_requests (
           id, client_api_key_ref, operation, client_transport, requested_model_id, outcome, started_at, recovery_lease_expires_at, completed_at, tenant_id,user_id,key_generation,user_generation,tenant_generation,owns_client_admission,request_observation_json
         ) values (
           $1, 'key-recovery', 'responses', 'http_sse', 'coding', $2, $3, $4, $5,
           '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',1,1,1,true,
           jsonb_strip_nulls(jsonb_build_object(
           'request', jsonb_build_object(
             'configRevision', 1,
             'protocol', 'openai',
             'endpoint', '/v1/responses',
             'compact', false),
           'routing', jsonb_build_object(
             'scope', 'all',
             'groupRefs', '{}'::text[],
             'groupNamesSnapshot', '[]'::jsonb)))
         )",
    )
    .bind(id)
    .bind(outcome)
    .bind(started_at)
    .bind((outcome != "running").then_some(lease_expires_at))
    .bind(completed_at)
    .execute(pool)
    .await
    .expect("seed model request recovery fact");
    if outcome == "running" {
        sqlx::query(
            "insert into model_request_leases (request_id, lease_expires_at) values ($1, $2)",
        )
        .bind(id)
        .bind(lease_expires_at)
        .execute(pool)
        .await
        .expect("seed running lease");
    }
}

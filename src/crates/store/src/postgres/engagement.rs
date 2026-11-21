//! Promotional operations use the same authority locks and wallet ledger as billing.
mod announcements;
mod commerce;
mod commerce_pages;
use super::{
    identity::{access, db_error},
    workspace_settings,
};
use ovload_admin::model::{
    engagement::EngagementCommand,
    identity_access::{
        IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
    },
    workspace_settings::WorkspaceSettingsKind,
};
use ovload_admin::ports::commerce::{CommercePageQuery, CommerceQuery};
use ovload_core::access::Permission;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction};
use uuid::Uuid;

async fn begin(pool: &PgPool) -> IdentityResult<Transaction<'_, Postgres>> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    sqlx::query("set local statement_timeout='10s'")
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    Ok(tx)
}
async fn management(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
    permission: Permission,
) -> IdentityResult<Uuid> {
    let IdentityOwner::Management(principal_id) = session.owner else {
        return Err(IdentityError::Forbidden);
    };
    access::authorize(
        tx,
        IdentityManagementActor {
            session_id: session.id,
            principal_id,
            authority_generation: session.authority_generation,
        },
        permission,
        None,
    )
    .await?;
    Ok(principal_id.as_uuid())
}
fn customer(session: &IdentitySession) -> IdentityResult<(Uuid, Uuid)> {
    let IdentityOwner::Customer { tenant_id, user_id } = session.owner else {
        return Err(IdentityError::Forbidden);
    };
    Ok((tenant_id.as_uuid(), user_id.as_uuid()))
}
fn key(value: &str) -> IdentityResult<()> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_:".contains(&c))
    {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

pub(super) async fn view(
    pool: &PgPool,
    session: &IdentitySession,
    view: &str,
) -> IdentityResult<Value> {
    let mut tx = begin(pool).await?;
    access::lock_session(&mut tx, session).await?;
    let result = match view {
        value if value == "commerce" || value.starts_with("commerce-") => {
            return Err(IdentityError::Invalid);
        }
        "management-test-data" => {
            management(&mut tx, session, Permission::BillingRead).await?;
            sqlx::query_scalar("select coalesce((select document from management_test_datasets where id='ui-preview'),'{}'::jsonb)")
                .fetch_one(&mut *tx).await.map_err(db_error)?
        }
        "announcements" => announcements::list(&mut tx, session).await?,
        "audit" => {
            management(&mut tx, session, Permission::SecuritySettingsManage).await?;
            sqlx::query_scalar("select coalesce(jsonb_agg(record order by created_at desc),'[]') from (select record,created_at from content_audit_records where expires_at>clock_timestamp() order by created_at desc limit 500) r").fetch_one(&mut *tx).await.map_err(db_error)?
        }
        "referrals" => referrals(&mut tx, session, None).await?,
        value if value.starts_with("referrals-") => {
            referrals(
                &mut tx,
                session,
                Some(value[10..].parse().map_err(|_| IdentityError::Invalid)?),
            )
            .await?
        }
        "lottery" => lottery(&mut tx, session).await?,
        _ => return Err(IdentityError::NotFound),
    };
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}

/// Execute a typed commerce query inside one transaction and one session lock.
pub(super) async fn commerce_query(
    pool: &PgPool,
    session: &IdentitySession,
    query: CommerceQuery,
) -> IdentityResult<Value> {
    let mut tx = begin(pool).await?;
    access::lock_session(&mut tx, session).await?;
    let result = match query {
        CommerceQuery::Overview => commerce::view(&mut tx, session, "all").await?,
        CommerceQuery::Scope(scope) => {
            if !matches!(
                scope.split(':').next().unwrap_or_default(),
                "plans"
                    | "records"
                    | "users"
                    | "subscriptions"
                    | "codes"
                    | "orders"
                    | "redemptions"
            ) {
                return Err(IdentityError::Invalid);
            }
            commerce::view(&mut tx, session, &scope).await?
        }
        CommerceQuery::Page(CommercePageQuery { scope, params }) => {
            commerce_pages::read(&mut tx, session, CommercePageQuery { scope, params }).await?
        }
        CommerceQuery::PaymentSummary { from, to, timezone } => {
            commerce::payment_summary(&mut tx, session, from, to, &timezone).await?
        }
    };
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}

/// Execute a typed commerce command.  The store owns its transaction, locks,
/// idempotency receipt and audit event as one atomic unit.
pub(super) async fn commerce_command(
    pool: &PgPool,
    session: &IdentitySession,
    key: String,
    command: ovload_admin::model::commerce::CommerceCommand,
) -> IdentityResult<Value> {
    let mut tx = begin(pool).await?;
    access::lock_session(&mut tx, session).await?;
    let result = commerce::command(&mut tx, session, key, command).await?;
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}

async fn referrals(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
    requested: Option<Uuid>,
) -> IdentityResult<Value> {
    if requested.is_some() {
        management(tx, session, Permission::BillingRead).await?;
    }
    let user = match session.owner {
        IdentityOwner::Customer { user_id, .. } => Some(user_id.as_uuid()),
        _ => {
            management(tx, session, Permission::BillingRead).await?;
            requested
        }
    };
    let settings = workspace_settings::load(tx, WorkspaceSettingsKind::Features, false)
        .await?
        .values["referral"]
        .clone();
    let mut summary: Value = if let Some(user) = user {
        sqlx::query_scalar("select jsonb_build_object('code',a.code,'invited',(select count(*) from referral_invitations where inviter_id=a.user_id),'total',(select coalesce(sum(amount_usd),0)::text from referral_rebates where inviter_id=a.user_id),'available',((select coalesce(sum(amount_usd),0) from referral_rebates where inviter_id=a.user_id and available_at<=clock_timestamp())-(select coalesce(sum(amount_usd),0) from referral_transfers where user_id=a.user_id))::text,'frozen',(select coalesce(sum(amount_usd),0)::text from referral_rebates where inviter_id=a.user_id and available_at>clock_timestamp())) from referral_accounts a where user_id=$1")
            .bind(user).fetch_one(&mut **tx).await.map_err(db_error)?
    } else {
        json!({})
    };
    if let Some(user) = user {
        let rewarded: i64 = sqlx::query_scalar(
            "select count(distinct invitee_id) from referral_rebates where inviter_id=$1",
        )
        .bind(user)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
        summary["rewarded"] = json!(rewarded);
    }
    let invitations: Value = sqlx::query_scalar("select coalesce(jsonb_agg(v),'[]') from (select jsonb_build_object('id',i.invitee_id,'user',jsonb_build_object('id',a.id,'name',a.display_name,'email',a.email),'invitee',jsonb_build_object('id',u.id,'name',u.display_name,'email',u.email),'at',i.created_at,'code',i.code,'registeredAt',i.created_at,'inviteeName',u.display_name) v from referral_invitations i join identity_users u on u.id=i.invitee_id join identity_users a on a.id=i.inviter_id where ($1::uuid is null or i.inviter_id=$1) order by i.created_at desc limit 500) s")
        .bind(user).fetch_one(&mut **tx).await.map_err(db_error)?;
    let rebates: Value = sqlx::query_scalar("select coalesce(jsonb_agg(v),'[]') from (select jsonb_build_object('id',r.id,'user',jsonb_build_object('id',a.id,'name',a.display_name,'email',a.email),'invitee',jsonb_build_object('id',u.id,'name',u.display_name,'email',u.email),'inviteeName',u.display_name,'at',r.created_at,'createdAt',r.created_at,'availableAt',r.available_at,'rate',r.rate::text,'amount',round(r.amount_usd*100)::bigint,'rebateCents',round(r.amount_usd*100)::bigint,'credited',round(c.amount_usd*100)::bigint,'purchaseCents',round(c.amount_usd*100)::bigint,'paid',round(c.paid_cny*100)::bigint,'status',case when r.available_at>clock_timestamp() then 'frozen' else 'released' end) v from referral_rebates r join confirmed_recharges c on c.id=r.recharge_id join identity_users u on u.id=r.invitee_id join identity_users a on a.id=r.inviter_id where ($1::uuid is null or r.inviter_id=$1) order by r.created_at desc limit 500) s")
        .bind(user).fetch_one(&mut **tx).await.map_err(db_error)?;
    let transfers: Value = sqlx::query_scalar("select coalesce(jsonb_agg(v),'[]') from (select jsonb_build_object('id',r.id,'user',jsonb_build_object('id',u.id,'name',u.display_name,'email',u.email),'at',r.created_at,'createdAt',r.created_at,'amount',round(r.amount_usd*100)::bigint,'amountCents',round(r.amount_usd*100)::bigint,'balance',round(r.wallet_balance_after_usd*100)::bigint,'available',0,'frozen',round(r.frozen_usd*100)::bigint,'total',round(r.total_usd*100)::bigint) v from referral_transfers r join identity_users u on u.id=r.user_id where ($1::uuid is null or r.user_id=$1) order by r.created_at desc limit 500) s")
        .bind(user).fetch_one(&mut **tx).await.map_err(db_error)?;
    let rate = settings["overrides"]
        .as_array()
        .and_then(|a| {
            a.iter().find(|x| {
                Some(x["userId"].as_str().unwrap_or_default().to_owned())
                    == user.map(|v| v.to_string())
            })
        })
        .and_then(|r| r["rate"].as_str())
        .filter(|v| !v.is_empty())
        .unwrap_or(settings["rate"].as_str().unwrap_or("0"));
    Ok(
        json!({"summary":summary,"rate":rate,"freezeHours":settings["freezeHours"],"enabled":settings["enabled"],"invitations":invitations,"rebates":rebates,"withdrawals":transfers}),
    )
}

async fn lottery(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
) -> IdentityResult<Value> {
    let user = match session.owner {
        IdentityOwner::Customer { user_id, .. } => {
            let pages = workspace_settings::load(tx, WorkspaceSettingsKind::Pages, false).await?;
            if pages.values["lotteryEnabled"] != true {
                return Err(IdentityError::Forbidden);
            }
            Some(user_id.as_uuid())
        }
        _ => {
            management(tx, session, Permission::SecuritySettingsManage).await?;
            None
        }
    };
    let current: Option<Value> = sqlx::query_scalar("select jsonb_build_object('id',r.id,'rewardCents',reward_cents,'winnerCount',winner_count,'participantTarget',participant_target,'minimumRechargeCents',minimum_recharge_cents,'humanVerification',human_verification,'participants',(select count(*) from lottery_participants p where p.round_id=r.id),'joined',exists(select 1 from lottery_participants p where p.round_id=r.id and p.user_id=$1)) from lottery_rounds r where status='active'")
        .bind(user).fetch_optional(&mut **tx).await.map_err(db_error)?;
    let winners: Value = sqlx::query_scalar("select coalesce(jsonb_agg(v),'[]') from (select jsonb_build_object('id',w.id,'round',r.id,'name',case when $1 then u.display_name else left(u.display_name,1)||'***' end,'username',case when $1 then u.display_name else left(u.display_name,1)||'***' end,'email',case when $1 then u.email else '' end,'rewardCents',r.reward_cents,'drawnAt',r.drawn_at) v from lottery_winners w join lottery_rounds r on r.id=w.round_id join identity_users u on u.id=w.user_id order by r.drawn_at desc,w.id limit 500) s")
        .bind(user.is_none()).fetch_one(&mut **tx).await.map_err(db_error)?;
    let personal: Value = sqlx::query_scalar("select coalesce(jsonb_agg(v),'[]') from (select jsonb_build_object('id',r.id,'rewardCents',r.reward_cents,'drawnAt',r.drawn_at) v from lottery_winners w join lottery_rounds r on r.id=w.round_id where w.user_id=$1 order by r.drawn_at desc limit 500) s")
        .bind(user).fetch_one(&mut **tx).await.map_err(db_error)?;
    let rounds: Value = sqlx::query_scalar("select coalesce(jsonb_agg(v),'[]') from (select jsonb_build_object('id',r.id,'status',r.status,'participants',(select count(*) from lottery_participants p where p.round_id=r.id),'winners',(select count(*) from lottery_winners w where w.round_id=r.id),'rewardCents',reward_cents,'drawnAt',drawn_at) v from lottery_rounds r where status<>'active' order by id desc limit 500) s")
        .fetch_one(&mut **tx).await.map_err(db_error)?;
    Ok(json!({"current":current,"winners":winners,"personalWinnings":personal,"rounds":rounds}))
}

pub(super) async fn command(
    pool: &PgPool,
    session: &IdentitySession,
    command: EngagementCommand,
) -> IdentityResult<Value> {
    let mut tx = begin(pool).await?;
    // Lock a round before its participants' owner rows: awarding can otherwise
    // deadlock on a tenant foreign key held by a duplicate join awaiting this round.
    if let EngagementCommand::JoinLottery { round_id, .. }
    | EngagementCommand::EndLottery { round_id }
    | EngagementCommand::LotteryChallenge { round_id } = &command
    {
        sqlx::query("select id from lottery_rounds where id=$1 for update")
            .bind(round_id)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
    }
    access::lock_session(&mut tx, session).await?;
    let result = match command {
        EngagementCommand::Commerce { .. } => return Err(IdentityError::Invalid),
        EngagementCommand::SaveAnnouncement {
            id,
            revision,
            document,
        } => announcements::save(&mut tx, session, id, revision, document).await?,
        EngagementCommand::DeleteAnnouncement { id, revision } => {
            announcements::delete(&mut tx, session, id, revision).await?
        }
        EngagementCommand::ReadAnnouncement { id, revision } => {
            announcements::mark_read(&mut tx, session, id, revision).await?
        }
        EngagementCommand::TransferReferral { key: idempotency } => {
            key(&idempotency)?;
            let (tenant, user) = customer(session)?;
            sqlx::query("select 1 from referral_accounts where user_id=$1 for update")
                .bind(user)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            let old: Option<Value> = sqlx::query_scalar("select jsonb_build_object('id',id,'amountUsd',amount_usd::text) from referral_transfers where user_id=$1 and idempotency_key=$2").bind(user).bind(&idempotency).fetch_optional(&mut *tx).await.map_err(db_error)?;
            if let Some(old) = old {
                old
            } else {
                let id = Uuid::now_v7();
                sqlx::query(
                    "select tenant_id from identity_tenant_wallets where tenant_id=$1 for update",
                )
                .bind(tenant)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
                let amount: Option<String> = sqlx::query_scalar("insert into referral_transfers(id,user_id,tenant_id,idempotency_key,amount_usd,wallet_balance_after_usd,frozen_usd,total_usd) select $1,$2,$3,$4,amount,(select balance_usd from identity_tenant_wallets where tenant_id=$3)+amount,(select coalesce(sum(amount_usd),0) from referral_rebates where inviter_id=$2 and available_at>clock_timestamp()),(select coalesce(sum(amount_usd),0) from referral_rebates where inviter_id=$2) from (select (select coalesce(sum(amount_usd),0) from referral_rebates where inviter_id=$2 and available_at<=clock_timestamp())-(select coalesce(sum(amount_usd),0) from referral_transfers where user_id=$2) amount) b where amount>0 returning amount_usd::text")
                    .bind(id).bind(user).bind(tenant).bind(idempotency).fetch_optional(&mut *tx).await.map_err(db_error)?;
                let amount = amount.ok_or(IdentityError::Conflict)?;
                credit(&mut tx, tenant, id, "referral_transfer", &amount).await?;
                json!({"id":id,"amountUsd":amount})
            }
        }
        EngagementCommand::StartLottery {
            key: idempotency,
            reward_cents,
            winner_count,
            participant_target,
            minimum_recharge_cents,
            human_verification,
        } => {
            key(&idempotency)?;
            let actor = management(&mut tx, session, Permission::SecuritySettingsManage).await?;
            if !(1..=1000000).contains(&reward_cents)
                || !(1..=1000).contains(&winner_count)
                || !(winner_count..=100000).contains(&participant_target)
                || !(0..=100000000).contains(&minimum_recharge_cents)
            {
                return Err(IdentityError::Invalid);
            }
            // Concurrent retries must observe the first command's receipt.
            sqlx::query("select pg_advisory_xact_lock(706485301)")
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            let old = sqlx::query("select * from lottery_rounds where idempotency_key=$1")
                .bind(&idempotency)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db_error)?;
            let id = if let Some(old) = old {
                if old.get::<i64, _>("reward_cents") != reward_cents
                    || old.get::<i32, _>("winner_count") != winner_count
                    || old.get::<i32, _>("participant_target") != participant_target
                    || old.get::<i64, _>("minimum_recharge_cents") != minimum_recharge_cents
                    || old.get::<bool, _>("human_verification") != human_verification
                {
                    return Err(IdentityError::Conflict);
                }
                old.get::<i64, _>("id")
            } else {
                sqlx::query_scalar("insert into lottery_rounds(reward_cents,winner_count,participant_target,minimum_recharge_cents,human_verification,created_by,idempotency_key) values($1,$2,$3,$4,$5,$6,$7) returning id")
                    .bind(reward_cents).bind(winner_count).bind(participant_target).bind(minimum_recharge_cents).bind(human_verification).bind(actor).bind(idempotency).fetch_one(&mut *tx).await.map_err(db_error)?
            };
            audit(&mut tx, session, "lottery.started", json!({"round":id})).await?;
            json!({"id":id})
        }
        EngagementCommand::EndLottery { round_id } => {
            management(&mut tx, session, Permission::SecuritySettingsManage).await?;
            let row = sqlx::query("select * from lottery_rounds where id=$1 for update")
                .bind(round_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db_error)?
                .ok_or(IdentityError::NotFound)?;
            if row.get::<String, _>("status") == "active" {
                draw(
                    &mut tx,
                    round_id,
                    row.get("winner_count"),
                    row.get("reward_cents"),
                )
                .await?;
            }
            audit(&mut tx, session, "lottery.ended", json!({"round":round_id})).await?;
            json!({"id":round_id})
        }
        EngagementCommand::LotteryChallenge { round_id } => {
            let (_, user) = customer(session)?;
            let attempts:i32=sqlx::query_scalar("insert into lottery_challenge_limits(user_id,attempts) values($1,1) on conflict(user_id) do update set attempts=case when lottery_challenge_limits.window_start<clock_timestamp()-interval '1 minute' then 1 else lottery_challenge_limits.attempts+1 end,window_start=case when lottery_challenge_limits.window_start<clock_timestamp()-interval '1 minute' then clock_timestamp() else lottery_challenge_limits.window_start end returning attempts").bind(user).fetch_one(&mut *tx).await.map_err(db_error)?;
            if attempts > 5 {
                return Err(IdentityError::RateLimited);
            }
            let pages =
                workspace_settings::load(&mut tx, WorkspaceSettingsKind::Pages, false).await?;
            if pages.values["lotteryEnabled"] != true {
                return Err(IdentityError::Forbidden);
            }
            let active:bool=sqlx::query_scalar("select exists(select 1 from lottery_rounds where id=$1 and status='active' and human_verification)").bind(round_id).fetch_one(&mut *tx).await.map_err(db_error)?;
            if !active {
                return Err(IdentityError::Conflict);
            }
            sqlx::query("delete from lottery_challenges where id in(select id from lottery_challenges where expires_at<clock_timestamp() limit 500)").execute(&mut *tx).await.map_err(db_error)?;
            let count: i64 =
                sqlx::query_scalar("select count(*) from lottery_challenges where user_id=$1")
                    .bind(user)
                    .fetch_one(&mut *tx)
                    .await
                    .map_err(db_error)?;
            if count >= 5 {
                return Err(IdentityError::RateLimited);
            }
            let id = Uuid::new_v4();
            let answer = Uuid::new_v4().simple().to_string()[..6].to_uppercase();
            let digest = Sha256::digest(format!("{id}:{answer}"));
            sqlx::query("insert into lottery_challenges(id,round_id,user_id,answer_digest) values($1,$2,$3,$4)").bind(id).bind(round_id).bind(user).bind(digest.as_slice()).execute(&mut *tx).await.map_err(db_error)?;
            let image =
                ovload_admin::model::engagement::lottery_challenge_image(&answer, id.as_bytes())?;
            json!({"id":id,"image":image})
        }
        EngagementCommand::JoinLottery {
            round_id,
            challenge_id,
            answer,
        } => {
            let (tenant, user) = customer(session)?;
            let pages =
                workspace_settings::load(&mut tx, WorkspaceSettingsKind::Pages, false).await?;
            if pages.values["lotteryEnabled"] != true {
                return Err(IdentityError::Forbidden);
            }
            let row = sqlx::query("select * from lottery_rounds where id=$1 for update")
                .bind(round_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db_error)?
                .ok_or(IdentityError::NotFound)?;
            let joined:bool=sqlx::query_scalar("select exists(select 1 from lottery_participants where round_id=$1 and user_id=$2)").bind(round_id).bind(user).fetch_one(&mut *tx).await.map_err(db_error)?;
            if !joined {
                if row.get::<String, _>("status") != "active" {
                    return Err(IdentityError::Conflict);
                }
                let eligible:bool=sqlx::query_scalar("select coalesce(sum(paid_cny),0)*100 >= $2::bigint from confirmed_recharges where tenant_id=$1").bind(tenant).bind(row.get::<i64,_>("minimum_recharge_cents")).fetch_one(&mut *tx).await.map_err(db_error)?;
                if !eligible {
                    return Err(IdentityError::Forbidden);
                }
                if row.get::<bool, _>("human_verification") {
                    let id = challenge_id.ok_or(IdentityError::Invalid)?;
                    let digest = Sha256::digest(format!(
                        "{id}:{}",
                        answer.unwrap_or_default().trim().to_uppercase()
                    ));
                    let expected: Option<Vec<u8>>=sqlx::query_scalar("delete from lottery_challenges where id=$1 and round_id=$2 and user_id=$3 and expires_at>clock_timestamp() returning answer_digest").bind(id).bind(round_id).bind(user).fetch_optional(&mut *tx).await.map_err(db_error)?;
                    if expected.as_deref() != Some(digest.as_slice()) {
                        // Persist consumption on a wrong answer, so challenges cannot be brute forced.
                        tx.commit().await.map_err(db_error)?;
                        return Err(IdentityError::Invalid);
                    }
                }
                sqlx::query(
                    "insert into lottery_participants(round_id,user_id,tenant_id) values($1,$2,$3)",
                )
                .bind(round_id)
                .bind(user)
                .bind(tenant)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
                let count: i64 = sqlx::query_scalar(
                    "select count(*) from lottery_participants where round_id=$1",
                )
                .bind(round_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
                if count >= i64::from(row.get::<i32, _>("participant_target")) {
                    draw(
                        &mut tx,
                        round_id,
                        row.get("winner_count"),
                        row.get("reward_cents"),
                    )
                    .await?;
                }
            }
            json!({"joined":true})
        }
        EngagementCommand::DeleteAudit { ids } => {
            management(&mut tx, session, Permission::SecuritySettingsManage).await?;
            if ids.is_empty() || ids.len() > 500 {
                return Err(IdentityError::Invalid);
            }
            sqlx::query("delete from content_audit_records where id=any($1)")
                .bind(&ids)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            audit(
                &mut tx,
                session,
                "content_audit.deleted",
                json!({"ids":ids}),
            )
            .await?;
            json!({"deleted":ids.len()})
        }
    };
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}

async fn credit(
    tx: &mut Transaction<'_, Postgres>,
    tenant: Uuid,
    source: Uuid,
    kind: &str,
    amount: &str,
) -> IdentityResult<()> {
    sqlx::query("insert into wallet_ledger_entries(id,tenant_id,direction,entry_kind,amount_usd,source_id,idempotency_key) values($1,$2,'credit',$3,$4::text::numeric,$5,$6)")
        .bind(Uuid::now_v7()).bind(tenant).bind(kind).bind(amount).bind(source).bind(format!("{kind}:{source}")).execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}
async fn draw(
    tx: &mut Transaction<'_, Postgres>,
    round: i64,
    count: i32,
    cents: i64,
) -> IdentityResult<()> {
    // System-random UUIDs provide independent 122-bit sort keys; no seeded PRNG or client entropy.
    let mut participants=sqlx::query("select p.user_id,p.tenant_id from lottery_participants p join identity_users u on u.id=p.user_id join identity_tenants t on t.id=p.tenant_id where round_id=$1 and u.status='active' and t.status='active'").bind(round).fetch_all(&mut **tx).await.map_err(db_error)?.into_iter().map(|r|(Uuid::new_v4(),r)).collect::<Vec<_>>();
    participants.sort_by_key(|(random, _)| *random);
    let status = if participants.len() < count as usize {
        "cancelled"
    } else {
        "drawn"
    };
    sqlx::query("update lottery_rounds set status=$2,drawn_at=clock_timestamp() where id=$1 and status='active'").bind(round).bind(status).execute(&mut **tx).await.map_err(db_error)?;
    if status == "drawn" {
        // Lock wallets in a stable order before recording any awards.
        let mut selected = participants
            .into_iter()
            .take(count as usize)
            .map(|(_, r)| (r.get::<Uuid, _>("tenant_id"), r.get::<Uuid, _>("user_id")))
            .collect::<Vec<_>>();
        selected.sort_unstable();
        for (tenant, user) in selected {
            let id = Uuid::now_v7();
            let amount = format!("{}.{:02}", cents / 100, cents % 100);
            sqlx::query("insert into lottery_winners(id,round_id,user_id,tenant_id,reward_usd) values($1,$2,$3,$4,$5::text::numeric)").bind(id).bind(round).bind(user).bind(tenant).bind(&amount).execute(&mut **tx).await.map_err(db_error)?;
            credit(tx, tenant, id, "lottery_reward", &amount).await?;
        }
    }
    Ok(())
}
async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
    action: &str,
    metadata: Value,
) -> IdentityResult<()> {
    let IdentityOwner::Management(principal) = session.owner else {
        return Err(IdentityError::Forbidden);
    };
    sqlx::query("insert into identity_audit_events(actor_kind,actor_id,session_id,action,target_kind,target_id,metadata) values('management_principal',$1,$2,$3,'engagement',$4,$5)").bind(principal.as_uuid()).bind(session.id.to_string()).bind(action).bind(Uuid::nil()).bind(metadata).execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}

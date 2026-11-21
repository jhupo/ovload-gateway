//! Real commerce projections and transactional commands; fixtures are never read here.
use super::*;
use ovload_admin::model::commerce::{CodeKind, CommerceCommand};

pub(super) async fn view(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
    scope: &str,
) -> IdentityResult<Value> {
    view_selected(tx, session, scope, None).await
}
pub(super) async fn view_selected(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
    scope: &str,
    selected: Option<&[Uuid]>,
) -> IdentityResult<Value> {
    let (scope, plan_id) = scope
        .split_once(':')
        .map_or((scope, None), |(scope, plan)| (scope, Some(plan)));
    if plan_id.is_some_and(|id| Uuid::parse_str(id).is_err()) {
        return Err(IdentityError::Invalid);
    }
    let user = match session.owner {
        IdentityOwner::Customer { user_id, .. } => Some(user_id.as_uuid()),
        _ => {
            management(tx, session, Permission::BillingRead).await?;
            None
        }
    };
    let plans: Value = if scope == "all" || scope == "plans" || scope == "subscriptions" {
        sqlx::query_scalar("select coalesce(jsonb_agg((case when $1 then document else document-'notes' end)||jsonb_build_object('id',id,'revision',revision,'subscriberCount',case when $1 then (select count(distinct s.user_id) from commerce_subscriptions s where s.plan_id=commerce_plans.id and not s.revoked and s.starts_at<=now() and s.ends_at>now()) else 0 end) order by (document->>'sort')::int,id),'[]') from commerce_plans where not deleted and ($1 or document->>'published'='true') and ($2::uuid[] is null or id=any($2))").bind(user.is_none()).bind(if scope == "plans" { selected } else { None }).fetch_one(&mut **tx).await.map_err(db_error)?
    } else {
        json!([])
    };
    let records: Value = if scope == "all" || scope == "records" || scope == "subscriptions" {
        sqlx::query_scalar("select coalesce(jsonb_agg(v order by starts_at desc),'[]') from (select starts_at,jsonb_build_object('id',id,'revision',revision,'userId',user_id,'plan',case when $1::uuid is null then plan else plan-'notes' end,'start',starts_at,'end',ends_at,'revoked',revoked,'notes',case when $1::uuid is null then notes else '' end,'dailyUsed',commerce_subscription_used(id,'daily')*100,'weeklyUsed',commerce_subscription_used(id,'weekly')*100,'monthlyUsed',commerce_subscription_used(id,'monthly')*100) v from commerce_subscriptions where ($1::uuid is null or user_id=$1) and ($2::text is null or plan->>'id'=$2) and ($3::uuid[] is null or id=any($3))) s").bind(user).bind(plan_id).bind(selected).fetch_one(&mut **tx).await.map_err(db_error)?
    } else {
        json!([])
    };
    let users: Value = if user.is_none() && matches!(scope, "all" | "users" | "subscriptions") {
        sqlx::query_scalar("select coalesce(jsonb_agg(jsonb_build_object('id',id,'username',display_name,'email',email,'status',status) order by display_name),'[]') from identity_users where ($1::jsonb is null or id::text in (select value->>'userId' from jsonb_array_elements($1))) and ($2::uuid[] is null or id=any($2))").bind(if scope == "subscriptions" { Some(&records) } else { None }).bind(if scope == "users" { selected } else { None }).fetch_one(&mut **tx).await.map_err(db_error)?
    } else {
        json!([])
    };
    let codes: Value = if user.is_none() && matches!(scope, "all" | "codes") {
        sqlx::query_scalar("select coalesce(jsonb_agg(v order by created_at desc),'[]') from (select c.created_at,jsonb_build_object('id',c.id,'revision',c.revision,'code',c.code,'type',c.kind,'value',c.value,'planName',coalesce(c.plan_snapshot->>'name',''),'maxUses',c.max_uses,'perUser',c.per_user,'disabled',c.disabled,'expiresAt',c.expires_at,'createdAt',c.created_at,'notes',c.notes,'used',(select count(*) from commerce_redemptions used where used.code_id=c.id),'history',case when $1::uuid[] is null then (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'user',u.display_name,'email',u.email,'at',r.created_at) order by r.created_at desc),'[]') from commerce_redemptions r join identity_users u on u.id=r.user_id where r.code_id=c.id) else '[]'::jsonb end) v from commerce_codes c left join commerce_plans p on p.id=c.plan_id where not c.deleted and ($1::uuid[] is null or c.id=any($1))) s").bind(selected).fetch_one(&mut **tx).await.map_err(db_error)?
    } else {
        json!([])
    };
    let redemptions: Value = if scope == "all" || scope == "redemptions" {
        sqlx::query_scalar("select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'code',c.code,'type',c.kind,'value',c.value,'planName',coalesce(s.plan->>'name',''),'at',r.created_at) order by r.created_at desc),'[]') from commerce_redemptions r join commerce_codes c on c.id=r.code_id left join commerce_subscriptions s on s.id=r.subscription_id where r.user_id=$1 and ($2::uuid[] is null or r.id=any($2))").bind(user).bind(selected).fetch_one(&mut **tx).await.map_err(db_error)?
    } else {
        json!([])
    };
    let orders: Value = if scope == "all" || scope == "orders" {
        sqlx::query_scalar(include_str!("commerce_orders.sql"))
            .bind(user)
            .bind(selected)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?
    } else {
        json!([])
    };
    Ok(
        json!({"plans":plans,"records":records,"users":users,"codes":codes,"orders":orders,"redemptions":redemptions}),
    )
}

async fn owner(tx: &mut Transaction<'_, Postgres>, user: Uuid) -> IdentityResult<Uuid> {
    let tenant: Uuid = sqlx::query_scalar("select tenant_id from identity_users where id=$1")
        .bind(user)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(IdentityError::NotFound)?;
    let active: Option<bool> =
        sqlx::query_scalar("select status='active' from identity_tenants where id=$1 for update")
            .bind(tenant)
            .fetch_optional(&mut **tx)
            .await
            .map_err(db_error)?;
    let user_active: Option<bool> = sqlx::query_scalar(
        "select status='active' from identity_users where id=$1 and tenant_id=$2 for update",
    )
    .bind(user)
    .bind(tenant)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?;
    if active != Some(true) || user_active != Some(true) {
        return Err(IdentityError::Conflict);
    }
    sqlx::query("select tenant_id from identity_tenant_wallets where tenant_id=$1 for update")
        .bind(tenant)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(tenant)
}
async fn plan(tx: &mut Transaction<'_, Postgres>, id: Uuid) -> IdentityResult<Value> {
    sqlx::query_scalar("select document||jsonb_build_object('id',id,'revision',revision) from commerce_plans where id=$1 and not deleted and document->>'published'='true' for share").bind(id).fetch_optional(&mut **tx).await.map_err(db_error)?.ok_or(IdentityError::Conflict)
}
async fn assign(
    tx: &mut Transaction<'_, Postgres>,
    tenant: Uuid,
    user: Uuid,
    plan_id: Uuid,
    p: Value,
    notes: &str,
) -> IdentityResult<Uuid> {
    if notes.len() > 2000 {
        return Err(IdentityError::Invalid);
    }
    let id = Uuid::now_v7();
    sqlx::query("insert into commerce_subscriptions(id,tenant_id,user_id,plan_id,plan,ends_at,notes) values($1,$2,$3,$4,$5,now()+make_interval(days=>($5->>'days')::int),$6)").bind(id).bind(tenant).bind(user).bind(plan_id).bind(p).bind(notes).execute(&mut **tx).await.map_err(db_error)?;
    Ok(id)
}
fn changed(count: u64) -> IdentityResult<()> {
    if count == 1 {
        Ok(())
    } else {
        Err(IdentityError::Conflict)
    }
}

pub(super) async fn command(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
    idempotency: String,
    command: CommerceCommand,
) -> IdentityResult<Value> {
    key(&idempotency)?;
    let personal = matches!(
        command,
        CommerceCommand::Redeem { .. } | CommerceCommand::Purchase { .. }
    );
    let actor = if personal {
        customer(session)?.1
    } else {
        management(tx, session, Permission::BillingManage).await?
    };
    let request = serde_json::to_value(&command).map_err(|_| IdentityError::Invalid)?;
    // The actor row is already locked by the session authority fence.
    if let Some(row) = sqlx::query(
        "select request,result from commerce_commands where actor_id=$1 and idempotency_key=$2",
    )
    .bind(actor)
    .bind(&idempotency)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?
    {
        if row.get::<Value, _>("request") != request {
            return Err(IdentityError::Conflict);
        }
        return Ok(row.get("result"));
    }
    let result = match command {
        CommerceCommand::SavePlan {
            id,
            revision,
            document,
        } => {
            if !document.valid() {
                return Err(IdentityError::Invalid);
            }
            let document = serde_json::to_value(document).map_err(|_| IdentityError::Invalid)?;
            let result = if let Some(id) = id {
                changed(sqlx::query("update commerce_plans set document=$3,revision=revision+1 where id=$1 and revision=$2 and not deleted").bind(id).bind(revision).bind(document).execute(&mut **tx).await.map_err(db_error)?.rows_affected())?;
                id
            } else {
                let id = Uuid::now_v7();
                sqlx::query("insert into commerce_plans(id,document) values($1,$2)")
                    .bind(id)
                    .bind(document)
                    .execute(&mut **tx)
                    .await
                    .map_err(db_error)?;
                id
            };
            json!({"id":result})
        }
        CommerceCommand::DeletePlan { id, revision } => {
            changed(sqlx::query("update commerce_plans set deleted=true,revision=revision+1 where id=$1 and revision=$2 and not deleted").bind(id).bind(revision).execute(&mut **tx).await.map_err(db_error)?.rows_affected())?;
            json!({"id":id})
        }
        CommerceCommand::Assign {
            user_id,
            plan_id,
            notes,
        } => {
            let tenant = owner(tx, user_id).await?;
            let p = plan(tx, plan_id).await?;
            json!({"id":assign(tx,tenant,user_id,plan_id,p,&notes).await?})
        }
        CommerceCommand::Adjust {
            id,
            revision,
            ends_at,
            notes,
        } => {
            if notes.len() > 2000
                || ends_at <= chrono::Utc::now()
                || ends_at > chrono::Utc::now() + chrono::Duration::days(3650)
            {
                return Err(IdentityError::Invalid);
            }
            lock_subscription(tx, id).await?;
            changed(sqlx::query("update commerce_subscriptions set ends_at=$3,notes=$4,revision=revision+1 where id=$1 and revision=$2 and not revoked").bind(id).bind(revision).bind(ends_at).bind(notes).execute(&mut **tx).await.map_err(db_error)?.rows_affected())?;
            json!({"id":id})
        }
        CommerceCommand::Revoke { id, revision } | CommerceCommand::ResetQuota { id, revision } => {
            lock_subscription(tx, id).await?;
            let revoke = request["action"] == "revoke";
            changed(sqlx::query("update commerce_subscriptions set revoked=revoked or $3,quota_generation=quota_generation+case when $3 then 0 else 1 end,revision=revision+1 where id=$1 and revision=$2 and not revoked").bind(id).bind(revision).bind(revoke).execute(&mut **tx).await.map_err(db_error)?.rows_affected())?;
            json!({"id":id})
        }
        CommerceCommand::Generate {
            kind,
            value,
            plan_id,
            count,
            max_uses,
            per_user,
            expires_at,
            notes,
        } => {
            if !(1..=100).contains(&count)
                || !(0..=100000).contains(&max_uses)
                || !(1..=100000).contains(&per_user)
                || notes.len() > 2000
                || expires_at.is_some_and(|v| v <= chrono::Utc::now())
                || (kind == CodeKind::Subscription) != plan_id.is_some()
                || value < 0
                || value > 999_999_999
                || matches!(kind, CodeKind::Balance | CodeKind::Concurrency) && value == 0
                || kind == CodeKind::Concurrency && value > 100000
            {
                return Err(IdentityError::Invalid);
            }
            let snapshot = if let Some(id) = plan_id {
                Some(plan(tx, id).await?)
            } else {
                None
            };
            let mut ids = Vec::new();
            for _ in 0..count {
                let id = Uuid::now_v7();
                let code = Uuid::new_v4().simple().to_string().to_uppercase();
                sqlx::query("insert into commerce_codes(id,code,kind,value,plan_id,max_uses,per_user,expires_at,notes,plan_snapshot) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)").bind(id).bind(code).bind(kind.as_str()).bind(value).bind(plan_id).bind(max_uses).bind(per_user).bind(expires_at).bind(&notes).bind(&snapshot).execute(&mut **tx).await.map_err(db_error)?;
                ids.push(id);
            }
            json!({"ids":ids})
        }
        CommerceCommand::UpdateCode {
            id,
            revision,
            disabled,
        } => {
            changed(sqlx::query("update commerce_codes set disabled=$3,revision=revision+1 where id=$1 and revision=$2 and not deleted").bind(id).bind(revision).bind(disabled).execute(&mut **tx).await.map_err(db_error)?.rows_affected())?;
            json!({"id":id})
        }
        CommerceCommand::DeleteCode { id, revision } => {
            changed(sqlx::query("update commerce_codes set deleted=true,disabled=true,revision=revision+1 where id=$1 and revision=$2 and not deleted").bind(id).bind(revision).execute(&mut **tx).await.map_err(db_error)?.rows_affected())?;
            json!({"id":id})
        }
        CommerceCommand::Redeem { code } => {
            let (tenant, user) = customer(session)?;
            owner(tx, user).await?;
            if code.len() > 64 {
                return Err(IdentityError::Invalid);
            }
            let row=sqlx::query("select * from commerce_codes where code=upper($1) and not disabled and not deleted and (expires_at is null or expires_at>now()) for update").bind(code.trim()).fetch_optional(&mut **tx).await.map_err(db_error)?.ok_or(IdentityError::Invalid)?;
            let id: Uuid = row.get("id");
            let (total,used):(i64,i64)=sqlx::query_as("select count(*),count(*) filter(where user_id=$2) from commerce_redemptions where code_id=$1").bind(id).bind(user).fetch_one(&mut **tx).await.map_err(db_error)?;
            if row.get::<i32, _>("max_uses") > 0
                && total >= i64::from(row.get::<i32, _>("max_uses"))
                || used >= i64::from(row.get::<i32, _>("per_user"))
            {
                return Err(IdentityError::Conflict);
            }
            let redemption = Uuid::now_v7();
            let kind: String = row.get("kind");
            let value: i64 = row.get("value");
            if kind == "invitation" {
                return Err(IdentityError::Invalid);
            }
            let subscription = if kind == "subscription" {
                let pid: Uuid = row.get("plan_id");
                let p: Value = row.get("plan_snapshot");
                Some(assign(tx, tenant, user, pid, p, "").await?)
            } else {
                None
            };
            sqlx::query("insert into commerce_redemptions(id,code_id,tenant_id,user_id,subscription_id) values($1,$2,$3,$4,$5)").bind(redemption).bind(id).bind(tenant).bind(user).bind(subscription).execute(&mut **tx).await.map_err(db_error)?;
            if kind == "balance" {
                credit(
                    tx,
                    tenant,
                    redemption,
                    "redemption_credit",
                    &format!("{}.{:02}", value / 100, value % 100),
                )
                .await?;
            }
            if kind == "concurrency" {
                changed(sqlx::query("update identity_users set max_concurrency=max_concurrency+$2,revision=revision+1,authority_generation=authority_generation+1 where id=$1 and max_concurrency+$2<=100000").bind(user).bind(value).execute(&mut **tx).await.map_err(db_error)?.rows_affected())?;
                // Limit changes fence existing API credentials; renew this browser's authority.
                sqlx::query("update identity_sessions set authority_generation=(select authority_generation from identity_users where id=$2) where id=$1").bind(session.id.as_uuid()).bind(user).execute(&mut **tx).await.map_err(db_error)?;
                sqlx::query("update identity_tenants set max_concurrency=greatest(max_concurrency,(select max_concurrency from identity_users where id=$2)),revision=revision+1 where id=$1").bind(tenant).bind(user).execute(&mut **tx).await.map_err(db_error)?;
            }
            json!({"id":redemption,"type":kind,"value":value})
        }
        CommerceCommand::Purchase { plan_id, revision } => {
            let (tenant, user) = customer(session)?;
            owner(tx, user).await?;
            let p = plan(tx, plan_id).await?;
            if p["revision"] != revision {
                return Err(IdentityError::Conflict);
            }
            let cents = p["priceCents"].as_i64().ok_or(IdentityError::Invalid)?;
            let payable:bool=sqlx::query_scalar("select exists(select 1 from commerce_execution_charges where tenant_id=$1 and state='pending')").bind(tenant).fetch_one(&mut **tx).await.map_err(db_error)?;
            if payable {
                return Err(IdentityError::Conflict);
            }
            let available:bool=sqlx::query_scalar("select balance_usd-held_usd >= $2::bigint::numeric/100 from identity_tenant_wallets where tenant_id=$1").bind(tenant).bind(cents).fetch_one(&mut **tx).await.map_err(db_error)?;
            if !available {
                return Err(IdentityError::Conflict);
            }
            let subscription = assign(tx, tenant, user, plan_id, p, "").await?;
            let id = Uuid::now_v7();
            sqlx::query("insert into commerce_purchases(id,tenant_id,user_id,subscription_id,amount_usd) values($1,$2,$3,$4,$5::bigint::numeric/100)").bind(id).bind(tenant).bind(user).bind(subscription).bind(cents).execute(&mut **tx).await.map_err(db_error)?;
            sqlx::query("insert into wallet_ledger_entries(id,tenant_id,direction,entry_kind,amount_usd,source_id,idempotency_key) values($1,$2,'debit','subscription_purchase',$3::bigint::numeric/100,$4,$5)").bind(Uuid::now_v7()).bind(tenant).bind(cents).bind(id).bind(format!("subscription:{id}")).execute(&mut **tx).await.map_err(db_error)?;
            json!({"id":id,"subscriptionId":subscription})
        }
    };
    sqlx::query("insert into commerce_commands(actor_id,idempotency_key,request,result) values($1,$2,$3,$4)").bind(actor).bind(idempotency).bind(&request).bind(&result).execute(&mut **tx).await.map_err(db_error)?;
    let metadata = json!({"action":request["action"],"result":result});
    if let IdentityOwner::Customer { tenant_id, user_id } = session.owner {
        sqlx::query("insert into identity_audit_events(tenant_id,actor_kind,actor_id,session_id,action,target_kind,target_id,metadata) values($1,'customer_user',$2,$3,'commerce.command','commerce',$2,$4)")
            .bind(tenant_id.as_uuid()).bind(user_id.as_uuid()).bind(session.id.to_string()).bind(metadata).execute(&mut **tx).await.map_err(db_error)?;
    } else {
        audit(tx, session, "commerce.command", metadata).await?;
    }
    Ok(result)
}
async fn lock_subscription(tx: &mut Transaction<'_, Postgres>, id: Uuid) -> IdentityResult<()> {
    let user: Uuid = sqlx::query_scalar("select user_id from commerce_subscriptions where id=$1")
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(IdentityError::NotFound)?;
    owner(tx, user).await?;
    Ok(())
}

pub(super) async fn payment_summary(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
    from: chrono::NaiveDate,
    to: chrono::NaiveDate,
    timezone: &str,
) -> IdentityResult<Value> {
    management(tx, session, Permission::BillingRead).await?;
    if !(0..=366).contains(&(to - from).num_days())
        || timezone
            .parse::<ovload_core::time::DeploymentTimeZone>()
            .is_err()
    {
        return Err(IdentityError::Invalid);
    }
    sqlx::query_scalar(include_str!("payment_summary.sql"))
        .bind(from)
        .bind(to)
        .bind(timezone)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)
}

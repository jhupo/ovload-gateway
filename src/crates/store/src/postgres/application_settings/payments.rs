use super::{PgApplicationSettings, alipay};
use crate::postgres::identity::{access, db_error};
use ovload_admin::model::{
    application_settings::{PaymentSettings, minor, money},
    identity_access::{IdentityError, IdentityOwner, IdentityResult, IdentitySession},
};
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction};
use std::collections::BTreeMap;
use uuid::Uuid;

fn customer(s: &IdentitySession) -> IdentityResult<(Uuid, Uuid)> {
    match s.owner {
        IdentityOwner::Customer { tenant_id, user_id } => {
            Ok((tenant_id.as_uuid(), user_id.as_uuid()))
        }
        _ => Err(IdentityError::Forbidden),
    }
}
async fn order(tx: &mut Transaction<'_, Postgres>, user: Uuid, id: Uuid) -> IdentityResult<Value> {
    sqlx::query_scalar("select jsonb_build_object('id',id,'amountCny',amount_cny::text,'feeCny',fee_cny::text,'totalCny',(amount_cny+fee_cny)::text,'creditUsd',credit_usd::text,'status',case when status='pending' and expires_at<=clock_timestamp() then 'expired' else status end,'checkout',checkout,'createdAt',created_at,'expiresAt',expires_at,'paidAt',paid_at) from payment_orders where id=$1 and user_id=$2")
    .bind(id).bind(user).fetch_optional(&mut **tx).await.map_err(db_error)?.ok_or(IdentityError::NotFound)
}
pub(super) async fn command(
    store: &PgApplicationSettings,
    s: &IdentitySession,
    input: Value,
    origin: &str,
) -> IdentityResult<Value> {
    let (tenant, user) = customer(s)?;
    let action = input["action"].as_str().ok_or(IdentityError::Invalid)?;
    let mut tx = store.pool.begin().await.map_err(db_error)?;
    access::lock_session(&mut tx, s).await?;
    let doc = store.read(&mut tx, "payment", false).await?;
    let settings: PaymentSettings =
        serde_json::from_value(doc.values.clone()).map_err(|_| IdentityError::Unavailable)?;
    match action {
        "config" => {
            tx.commit().await.map_err(db_error)?;
            return Ok(
                json!({"enabled":settings.enabled&&settings.balance_enabled,"minAmount":settings.min_amount,"maxAmount":settings.max_amount,"dailyLimit":settings.daily_limit,"rechargeMultiplier":settings.recharge_multiplier,"subscriptionRate":settings.subscription_rate,"feeRate":settings.fee_rate,"tiers":settings.tiers,"userOffers":settings.user_offers.iter().filter(|o|o.user_id==Some(user)).collect::<Vec<_>>() }),
            );
        }
        "orders" => {
            let rows:Value=sqlx::query_scalar("select coalesce(jsonb_agg(v order by created_at desc),'[]') from (select jsonb_build_object('id',id,'amountCny',amount_cny::text,'feeCny',fee_cny::text,'totalCny',(amount_cny+fee_cny)::text,'creditUsd',credit_usd::text,'status',case when status='pending' and expires_at<=clock_timestamp() then 'expired' else status end,'createdAt',created_at,'expiresAt',expires_at,'paidAt',paid_at) v,created_at from payment_orders where user_id=$1 order by created_at desc limit 200) s").bind(user).fetch_one(&mut *tx).await.map_err(db_error)?;
            tx.commit().await.map_err(db_error)?;
            return Ok(rows);
        }
        "get" => {
            let id = parse_id(&input, "id")?;
            let v = order(&mut tx, user, id).await?;
            tx.commit().await.map_err(db_error)?;
            return Ok(v);
        }
        "quote" => {
            if !settings.enabled || !settings.balance_enabled {
                return Err(IdentityError::Unavailable);
            }
            let amount = minor(input["amount"].as_str().ok_or(IdentityError::Invalid)?, 2)?;
            let v = settings.quote(amount, user)?;
            tx.commit().await.map_err(db_error)?;
            return Ok(v);
        }
        "create" => {}
        "cancel" => {
            let id = parse_id(&input, "id")?;
            let row=sqlx::query("select status,provider_config,credentials,cancellation_requested_at>clock_timestamp()-interval '30 seconds' cancelling from payment_orders where id=$1 and user_id=$2 for update").bind(id).bind(user).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(IdentityError::NotFound)?;
            if row.get::<String, _>("status") != "pending" {
                let v = order(&mut tx, user, id).await?;
                tx.commit().await.map_err(db_error)?;
                return Ok(v);
            }
            if settings.cancel_limit_enabled {
                let unit = match settings.cancel_unit.as_str() {
                    "minute" => 60,
                    "hour" => 3600,
                    _ => 86400,
                };
                let seconds = minor(&settings.cancel_window, 0)? * unit;
                let count:i64=sqlx::query_scalar("select count(*) from payment_orders where user_id=$1 and id<>$4 and ((status='cancelled' and cancelled_at >= case when $3 then to_timestamp(floor((extract(epoch from clock_timestamp())+28800)/$2)*$2-28800) else clock_timestamp()-make_interval(secs=>$2::double precision) end) or(status='pending' and cancellation_requested_at>clock_timestamp()-interval '30 seconds'))").bind(user).bind(seconds as f64).bind(settings.cancel_mode=="fixed").bind(id).fetch_one(&mut *tx).await.map_err(db_error)?;
                if count >= minor(&settings.cancel_max, 0)? {
                    return Err(IdentityError::RateLimited);
                }
            }
            let config: Value = row.get("provider_config");
            let secrets = store.open("payment", Some(row.get("credentials")))?;
            if row.get::<Option<bool>, _>("cancelling") == Some(true) {
                return Err(IdentityError::Conflict);
            }
            sqlx::query(
                "update payment_orders set cancellation_requested_at=clock_timestamp() where id=$1",
            )
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
            tx.commit().await.map_err(db_error)?;
            let closed = alipay::close(&config, &secrets, id).await;
            if !matches!(closed, Ok(true)) {
                if let Ok(v) = alipay::query(&config, &secrets, id).await {
                    if matches!(
                        v["trade_status"].as_str(),
                        Some("TRADE_SUCCESS" | "TRADE_FINISHED")
                    ) {
                        settle(store, id, &v, false).await?;
                    } else if v["trade_status"] != "TRADE_CLOSED" {
                        clear_cancellation(store, id).await?;
                        return Err(IdentityError::Unavailable);
                    }
                } else {
                    clear_cancellation(store, id).await?;
                    return Err(IdentityError::Unavailable);
                }
            }
            let mut tx = store.pool.begin().await.map_err(db_error)?;
            access::lock_session(&mut tx, s).await?;
            sqlx::query("update payment_orders set status='cancelled',cancelled_at=clock_timestamp(),cancellation_requested_at=null where id=$1 and user_id=$2 and status='pending'").bind(id).bind(user).execute(&mut *tx).await.map_err(db_error)?;
            let v = order(&mut tx, user, id).await?;
            tx.commit().await.map_err(db_error)?;
            return Ok(v);
        }
        _ => return Err(IdentityError::Invalid),
    }
    let key = parse_id(&input, "idempotencyKey")?;
    let amount = minor(input["amount"].as_str().ok_or(IdentityError::Invalid)?, 2)?;
    let existing=sqlx::query("select id,amount_cny::text,checkout,provider_config,credentials,(extract(epoch from (expires_at-clock_timestamp()))/60)::bigint remaining,status from payment_orders where user_id=$1 and idempotency_key=$2 for update").bind(user).bind(key).fetch_optional(&mut *tx).await.map_err(db_error)?;
    let (id, config, secrets, total, timeout) = if let Some(row) = existing {
        let id: Uuid = row.get("id");
        if minor(&row.get::<String, _>("amount_cny"), 2)? != amount {
            return Err(IdentityError::Conflict);
        }
        if row.get::<Option<Value>, _>("checkout").is_some()
            || row.get::<String, _>("status") != "pending"
            || row.get::<i64, _>("remaining") <= 0
        {
            let v = order(&mut tx, user, id).await?;
            tx.commit().await.map_err(db_error)?;
            return Ok(v);
        }
        let config: Value = row.get("provider_config");
        let secrets = store.open("payment", Some(row.get("credentials")))?;
        let total: i64 = sqlx::query_scalar(
            "select round((amount_cny+fee_cny)*100)::bigint from payment_orders where id=$1",
        )
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        (
            id,
            config,
            secrets,
            total,
            row.get::<i64, _>("remaining").max(1),
        )
    } else {
        if !settings.enabled || !settings.balance_enabled {
            return Err(IdentityError::Unavailable);
        }
        let quote = settings.quote(amount, user)?;
        let count:i64=sqlx::query_scalar("select count(*) from payment_orders where user_id=$1 and status='pending' and expires_at>clock_timestamp()").bind(user).fetch_one(&mut *tx).await.map_err(db_error)?;
        if count >= minor(&settings.max_pending, 0)? {
            return Err(IdentityError::Conflict);
        }
        let used:i64=sqlx::query_scalar("select coalesce(round(sum(amount_cny)*100),0)::bigint from payment_orders where user_id=$1 and created_at>=date_trunc('day',clock_timestamp() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai' and (status='paid' or(status='pending' and expires_at>clock_timestamp()))").bind(user).fetch_one(&mut *tx).await.map_err(db_error)?;
        let daily = minor(&settings.daily_limit, 2)?;
        if daily > 0 && used.checked_add(amount).is_none_or(|n| n > daily) {
            return Err(IdentityError::RateLimited);
        }
        let id = Uuid::now_v7();
        let timeout = minor(&settings.order_timeout, 0)?;
        sqlx::query("insert into payment_orders(id,tenant_id,user_id,idempotency_key,amount_cny,fee_cny,credit_usd,app_id,seller_id,settings_revision,provider_config,credentials,expires_at) values($1,$2,$3,$4,$5::text::numeric,$6::text::numeric,$7::text::numeric,$8,$9,$10,$11,$12,clock_timestamp()+make_interval(mins=>$13))")
        .bind(id).bind(tenant).bind(user).bind(key).bind(money(amount)).bind(quote["feeCny"].as_str()).bind(quote["creditUsd"].as_str()).bind(&settings.alipay_app_id).bind(&settings.alipay_seller_id).bind(doc.revision as i64).bind(&doc.values).bind(store.seal("payment",&doc.secrets)?).bind(timeout as i32).execute(&mut *tx).await.map_err(db_error)?;
        (
            id,
            doc.values,
            doc.secrets,
            minor(quote["totalCny"].as_str().ok_or(IdentityError::Invalid)?, 2)?,
            timeout,
        )
    };
    tx.commit().await.map_err(db_error)?;
    let checkout = alipay::checkout(
        &config,
        &secrets,
        id,
        total,
        origin,
        timeout,
        input["mobile"] == true,
    )
    .await?;
    let mut tx = store.pool.begin().await.map_err(db_error)?;
    access::lock_session(&mut tx, s).await?;
    sqlx::query("update payment_orders set checkout=coalesce(checkout,$2) where id=$1 and user_id=$3 and status='pending' and expires_at>clock_timestamp()").bind(id).bind(checkout).bind(user).execute(&mut *tx).await.map_err(db_error)?;
    let v = order(&mut tx, user, id).await?;
    tx.commit().await.map_err(db_error)?;
    Ok(v)
}
fn parse_id(v: &Value, k: &str) -> IdentityResult<Uuid> {
    v[k].as_str()
        .ok_or(IdentityError::Invalid)?
        .parse()
        .map_err(|_| IdentityError::Invalid)
}
async fn clear_cancellation(store: &PgApplicationSettings, id: Uuid) -> IdentityResult<()> {
    sqlx::query(
        "update payment_orders set cancellation_requested_at=null where id=$1 and status='pending'",
    )
    .bind(id)
    .execute(&store.pool)
    .await
    .map_err(db_error)?;
    Ok(())
}
pub(super) async fn notify(
    store: &PgApplicationSettings,
    input: Vec<(String, String)>,
) -> IdentityResult<()> {
    let mut fields = BTreeMap::new();
    for (k, v) in input {
        if fields.insert(k, v).is_some() {
            return Err(IdentityError::Invalid);
        }
    }
    if fields.get("sign_type").map(String::as_str) != Some("RSA2") {
        return Err(IdentityError::Invalid);
    }
    let id = fields
        .get("out_trade_no")
        .ok_or(IdentityError::Invalid)?
        .parse::<Uuid>()
        .map_err(|_| IdentityError::Invalid)?;
    let secrets: Value = sqlx::query_scalar("select credentials from payment_orders where id=$1")
        .bind(id)
        .fetch_optional(&store.pool)
        .await
        .map_err(db_error)?
        .ok_or(IdentityError::NotFound)?;
    let secrets = store.open("payment", Some(secrets))?;
    alipay::verify(
        secrets["publicKey"]
            .as_str()
            .ok_or(IdentityError::Unavailable)?,
        alipay::canonical(&fields, true).as_bytes(),
        fields.get("sign").ok_or(IdentityError::Invalid)?,
    )?;
    let value = serde_json::to_value(fields).map_err(|_| IdentityError::Invalid)?;
    settle(store, id, &value, true).await
}
async fn settle(
    store: &PgApplicationSettings,
    id: Uuid,
    fields: &Value,
    notification: bool,
) -> IdentityResult<()> {
    let mut tx = store.pool.begin().await.map_err(db_error)?;
    let tenant: Uuid = sqlx::query_scalar("select tenant_id from payment_orders where id=$1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
    sqlx::query("select id from identity_tenants where id=$1 for update")
        .bind(tenant)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    sqlx::query("select tenant_id from identity_tenant_wallets where tenant_id=$1 for update")
        .bind(tenant)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    let row=sqlx::query("select user_id,app_id,seller_id,status,trade_no,round((amount_cny+fee_cny)*100)::bigint total from payment_orders where id=$1 for update").bind(id).fetch_one(&mut *tx).await.map_err(db_error)?;
    if notification
        && (fields["app_id"] != row.get::<String, _>("app_id")
            || fields["seller_id"] != row.get::<String, _>("seller_id"))
    {
        return Err(IdentityError::Forbidden);
    }
    if minor(
        fields["total_amount"]
            .as_str()
            .ok_or(IdentityError::Invalid)?,
        2,
    )? != row.get::<i64, _>("total")
    {
        return Err(IdentityError::Forbidden);
    }
    let status = fields["trade_status"]
        .as_str()
        .ok_or(IdentityError::Invalid)?;
    if !matches!(status, "TRADE_SUCCESS" | "TRADE_FINISHED") {
        tx.commit().await.map_err(db_error)?;
        return Ok(());
    }
    let trade = fields["trade_no"]
        .as_str()
        .filter(|v| !v.is_empty() && v.len() <= 128 && v.bytes().all(|c| c.is_ascii_alphanumeric()))
        .ok_or(IdentityError::Invalid)?;
    if row.get::<String, _>("status") == "paid" {
        if row.get::<Option<String>, _>("trade_no").as_deref() != Some(trade) {
            return Err(IdentityError::Conflict);
        }
        tx.commit().await.map_err(db_error)?;
        return Ok(());
    }
    sqlx::query("update payment_orders set status='paid',trade_no=$2,paid_at=clock_timestamp(),notified_at=clock_timestamp() where id=$1").bind(id).bind(trade).execute(&mut *tx).await.map_err(db_error)?;
    sqlx::query("insert into wallet_ledger_entries(id,tenant_id,direction,entry_kind,amount_usd,source_id,idempotency_key) select $2,tenant_id,'credit','payment_credit',credit_usd,id,'payment:'||id::text from payment_orders where id=$1").bind(id).bind(Uuid::now_v7()).execute(&mut *tx).await.map_err(db_error)?;
    sqlx::query("insert into confirmed_recharges(id,tenant_id,amount_usd,paid_cny) select id,tenant_id,credit_usd,amount_cny from payment_orders where id=$1").bind(id).execute(&mut *tx).await.map_err(db_error)?;
    sqlx::query("insert into integration_mail_outbox(id,email,purpose,variables) select $1,u.email,'rechargeSuccess',jsonb_build_object('recharge_amount',o.amount_cny::text,'order_id',o.id::text,'current_balance',(w.balance_usd-w.held_usd)::text,'recipient_name',u.display_name) from payment_orders o join identity_users u on u.id=o.user_id join identity_tenant_wallets w on w.tenant_id=o.tenant_id where o.id=$1 and u.email is not null on conflict(id) do nothing").bind(id).execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    Ok(())
}

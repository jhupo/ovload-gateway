//! Page identifiers before projecting quota balances, order details and user records.
use super::*;
use ovload_admin::ports::commerce::CommercePageQuery;

pub(super) async fn read(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
    request: CommercePageQuery,
) -> IdentityResult<Value> {
    let customer = match session.owner {
        IdentityOwner::Customer { user_id, .. } => Some(user_id.as_uuid()),
        _ => {
            management(tx, session, Permission::BillingRead).await?;
            None
        }
    };
    if customer.is_some()
        && matches!(
            request.scope.as_str(),
            "users" | "codes" | "subscriptions" | "subscribers" | "code-history"
        )
    {
        return Err(IdentityError::Forbidden);
    }
    let p = &request.params;
    if p.keys().any(|key| {
        !matches!(
            key.as_str(),
            "page"
                | "size"
                | "search"
                | "status"
                | "type"
                | "plan"
                | "method"
                | "from"
                | "to"
                | "email"
                | "sort"
                | "desc"
        )
    }) || p.values().any(|v| v.len() > 200)
    {
        return Err(IdentityError::Invalid);
    }
    let number = |name: &str, default| {
        p.get(name).map_or(Ok(default), |v| {
            v.parse::<i64>().map_err(|_| IdentityError::Invalid)
        })
    };
    let page = number("page", 1)?;
    let size = number("size", 50)?;
    if !(1..=100000).contains(&page) || !(1..=200).contains(&size) {
        return Err(IdentityError::Invalid);
    }
    let source = match request.scope.as_str() {
        "subscriptions" | "records" | "subscribers" => {
            "select s.id,s.user_id,s.starts_at stamp,concat_ws(' ',s.id,s.plan->>'name',u.display_name,u.email,s.notes) search,case when s.revoked then 'revoked' when s.ends_at<=now() then 'expired' when s.starts_at>now() then 'scheduled' else 'active' end status,'subscription' kind,s.plan_id::text plan,'' method,(s.plan->>'priceCents')::numeric amount,u.display_name name,0 sort from commerce_subscriptions s join identity_users u on u.id=s.user_id"
        }
        "orders" => {
            "select o.id,o.user_id,o.created_at stamp,concat_ws(' ',o.id,u.display_name,u.email) search,case when o.status in ('failed','expired') or (o.status='pending' and o.expires_at<=now()) then 'cancelled' else o.status end status,'balance' kind,'' plan,'alipay' method,round((o.amount_cny+o.fee_cny)*100) amount,u.display_name name,0 sort from payment_orders o join identity_users u on u.id=o.user_id union all select c.id,c.user_id,c.created_at,concat_ws(' ',c.id,u.display_name,u.email,s.plan->>'name'),'paid','plan',s.plan_id::text,'wallet',round(c.amount_usd*100),u.display_name,0 from commerce_purchases c join identity_users u on u.id=c.user_id join commerce_subscriptions s on s.id=c.subscription_id"
        }
        "plans" => {
            "select p.id,null::uuid user_id,p.created_at stamp,p.document->>'name' search,case when p.document->>'published'='true' then 'published' else 'unpublished' end status,'plan' kind,p.id::text plan,'' method,(p.document->>'priceCents')::numeric amount,p.document->>'name' name,(p.document->>'sort')::int sort from commerce_plans p where not p.deleted"
        }
        "codes" => {
            "select c.id,null::uuid user_id,c.created_at stamp,concat_ws(' ',c.code,c.notes,(select string_agg(u.email,' ') from commerce_redemptions r join identity_users u on u.id=r.user_id where r.code_id=c.id)) search,case when c.disabled then 'disabled' when c.expires_at<=now() then 'expired' when c.max_uses>0 and n.used>=c.max_uses then 'exhausted' when n.used>0 then 'partial' else 'unused' end status,c.kind kind,coalesce(c.plan_id::text,'') plan,'' method,c.value amount,c.code name,0 sort from commerce_codes c cross join lateral (select count(*) used from commerce_redemptions r where r.code_id=c.id) n where not c.deleted"
        }
        "code-history" => {
            "select r.id,r.user_id,r.created_at stamp,concat_ws(' ',u.display_name,u.email) search,'' status,'' kind,r.code_id::text plan,'' method,0 amount,u.display_name name,0 sort from commerce_redemptions r join identity_users u on u.id=r.user_id"
        }
        "redemptions" => {
            "select r.id,r.user_id,r.created_at stamp,concat_ws(' ',c.code,c.kind) search,'' status,c.kind kind,'' plan,'' method,c.value amount,c.code name,0 sort from commerce_redemptions r join commerce_codes c on c.id=r.code_id"
        }
        "users" => {
            "select u.id,u.id user_id,u.created_at stamp,concat_ws(' ',u.id,u.display_name,u.email) search,u.status status,'' kind,'' plan,'' method,0 amount,u.display_name name,0 sort from identity_users u"
        }
        _ => return Err(IdentityError::Invalid),
    };
    let source = if matches!(p.get("sort").map(String::as_str), Some("expiresAt" | "end"))
        && matches!(request.scope.as_str(), "records" | "subscriptions")
    {
        source.replace("s.starts_at stamp", "s.ends_at stamp")
    } else {
        source.to_owned()
    };
    let source = if p.get("sort").is_some_and(|v| v == "plan")
        && matches!(request.scope.as_str(), "records" | "subscriptions")
    {
        source.replace("u.display_name name", "s.plan->>'name' name")
    } else {
        source
    };
    let source = if request.scope == "subscribers" {
        let plan = p
            .get("plan")
            .ok_or(IdentityError::Invalid)?
            .parse::<Uuid>()
            .map_err(|_| IdentityError::Invalid)?;
        source.replace("from commerce_subscriptions s", &format!("from (select distinct on (user_id) * from commerce_subscriptions where plan_id='{plan}' and not revoked and starts_at<=now() and ends_at>now() order by user_id,ends_at desc,id) s"))
    } else {
        source
    };
    if customer.is_none() && request.scope == "redemptions" {
        return Err(IdentityError::Forbidden);
    }
    let mut sql = sqlx::QueryBuilder::<Postgres>::new("with source as (");
    sql.push(&source)
        .push("), matches as (select * from source where true");
    if let Some(user) = customer {
        if request.scope == "plans" {
            sql.push(" and status='published'");
        } else {
            sql.push(" and user_id=").push_bind(user);
        }
    }
    if let Some(search) = p.get("search").filter(|v| !v.trim().is_empty()) {
        sql.push(" and strpos(lower(search),lower(")
            .push_bind(search.trim().to_owned())
            .push("))>0");
    }
    if let Some(email) = p.get("email").filter(|v| !v.is_empty()) {
        sql.push(" and user_id in (select id from identity_users where email=")
            .push_bind(email.to_owned())
            .push(")");
    }
    for (key, column) in [
        ("status", "status"),
        ("type", "kind"),
        ("plan", "plan"),
        ("method", "method"),
    ] {
        if let Some(value) = p.get(key).filter(|v| !v.is_empty() && v.as_str() != "all") {
            if key == "status" && value == "current" {
                sql.push(" and status in ('active','scheduled')");
            } else if key == "status" && value == "history" {
                sql.push(" and status in ('expired','revoked')");
            } else {
                sql.push(" and ")
                    .push(column)
                    .push("=any(")
                    .push_bind(value.split(',').map(str::to_owned).collect::<Vec<_>>())
                    .push(")");
            }
        }
    }
    for (key, operator) in [("from", ">="), ("to", "<")] {
        if let Some(value) = p.get(key).filter(|v| !v.is_empty()) {
            let date = chrono::DateTime::parse_from_rfc3339(value)
                .map_err(|_| IdentityError::Invalid)?
                .to_utc();
            sql.push(" and stamp ")
                .push(operator)
                .push(" ")
                .push_bind(date);
        }
    }
    let sort = match p.get("sort").map(String::as_str) {
        Some("name" | "user" | "code" | "plan") => "name",
        Some("paid" | "paidAmount" | "total" | "priceCents" | "value") => "amount",
        Some("sort") => "sort",
        Some("status") => "status",
        Some("type" | "purchase") => "kind",
        Some("id" | "number") => "id",
        Some("method") => "method",
        _ => "stamp",
    };
    let direction = if p.get("desc").is_none_or(|v| v == "true") {
        " desc"
    } else {
        " asc"
    };
    sql.push("), selected as (select id from matches order by ").push(sort).push(direction).push(",id limit ").push_bind(size).push(" offset ").push_bind((page-1)*size)
        .push(") select jsonb_build_object('ids',coalesce((select jsonb_agg(id) from selected),'[]'),'total',(select count(*) from matches))");
    let result: Value = sql
        .build_query_scalar()
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
    let ids: Vec<Uuid> =
        serde_json::from_value(result["ids"].clone()).map_err(|_| IdentityError::Invalid)?;
    let mut view = commerce::view_selected(
        tx,
        session,
        if request.scope == "subscribers" {
            "subscriptions"
        } else {
            &request.scope
        },
        Some(&ids),
    )
    .await?;
    if request.scope == "code-history" {
        let history: Value=sqlx::query_scalar("select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'user',u.display_name,'email',u.email,'at',r.created_at) order by r.created_at desc),'[]') from commerce_redemptions r join identity_users u on u.id=r.user_id where r.id=any($1)").bind(&ids).fetch_one(&mut **tx).await.map_err(db_error)?;
        view["history"] = history;
    }
    let key = match request.scope.as_str() {
        "subscriptions" | "subscribers" => "records",
        "code-history" => "history",
        scope => scope,
    };
    if let Some(rows) = view.get_mut(key).and_then(Value::as_array_mut) {
        rows.sort_by_key(|r| {
            ids.iter()
                .position(|id| r["id"].as_str() == Some(id.to_string().as_str()))
                .unwrap_or(usize::MAX)
        });
    }
    view["total"] = result["total"].clone();
    Ok(view)
}

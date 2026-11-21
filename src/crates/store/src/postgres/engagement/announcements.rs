//! Announcements use live group entitlements; reads belong to one content revision.
use super::*;
use chrono::{DateTime, Utc};

// A revoked explicit grant overrides a public group, just as it does for model keys.
const AUDIENCE: &str = "(cardinality(a.group_ids)=0 or exists (select 1 from account_groups g left join model_key_group_grants mg on mg.account_group_id=g.id and mg.user_id=u.id and mg.tenant_id=u.tenant_id where g.id=any(a.group_ids) and g.enabled and coalesce(mg.granted,g.visibility='public')))";

pub(super) async fn list(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
) -> IdentityResult<Value> {
    let user = match session.owner {
        IdentityOwner::Customer { user_id, .. } => Some(user_id.as_uuid()),
        _ => {
            management(tx, session, Permission::SecuritySettingsManage).await?;
            None
        }
    };
    let sql = format!("select coalesce(jsonb_agg(v order by created_at desc),'[]') from (
      select a.created_at, jsonb_build_object('id',a.id,'title',a.title,'content',a.content,'status',a.status,'delivery',a.delivery,'groupIds',a.group_ids,'startsAt',a.starts_at,'endsAt',a.ends_at,'createdAt',a.created_at,'updatedAt',a.updated_at,'revision',a.revision,
      'read',exists(select 1 from announcement_reads r where r.announcement_id=a.id and r.user_id=$1 and r.revision=a.revision),
      'readership',case when $1::uuid is null then (select jsonb_build_object('recipients',count(*),'read',count(*) filter (where exists(select 1 from announcement_reads r where r.announcement_id=a.id and r.user_id=u.id and r.revision=a.revision))) from identity_users u join identity_tenants t on t.id=u.tenant_id where u.status='active' and t.status='active' and {AUDIENCE}) else null end) v
      from announcements a where $1::uuid is null or (a.status='published' and (a.starts_at is null or a.starts_at<=clock_timestamp()) and (a.ends_at is null or a.ends_at>clock_timestamp()) and exists(select 1 from identity_users u where u.id=$1 and {AUDIENCE}))
    ) s");
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(user)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)
}

pub(super) async fn save(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
    id: Option<Uuid>,
    revision: Option<i64>,
    document: Value,
) -> IdentityResult<Value> {
    let actor = management(tx, session, Permission::SecuritySettingsManage).await?;
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Draft {
        title: String,
        content: String,
        status: String,
        delivery: String,
        group_ids: Vec<String>,
        starts_at: Option<DateTime<Utc>>,
        ends_at: Option<DateTime<Utc>>,
    }
    let mut draft: Draft = serde_json::from_value(document).map_err(|_| IdentityError::Invalid)?;
    draft.title = draft.title.trim().to_owned();
    if draft.title.is_empty()
        || draft.title.chars().count() > 160
        || draft.content.trim().is_empty()
        || draft.content.len() > 100000
        || !["draft", "published", "archived"].contains(&draft.status.as_str())
        || !["silent", "popup"].contains(&draft.delivery.as_str())
        || draft.group_ids.len() > 256
        || draft
            .ends_at
            .zip(draft.starts_at)
            .is_some_and(|(end, start)| end <= start)
    {
        return Err(IdentityError::Invalid);
    }
    draft.group_ids.sort();
    draft.group_ids.dedup();
    let groups: i64 = sqlx::query_scalar("select count(*) from account_groups where id=any($1)")
        .bind(&draft.group_ids)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
    if groups != draft.group_ids.len() as i64 {
        return Err(IdentityError::Invalid);
    }
    let target = id.unwrap_or_else(Uuid::now_v7);
    let sql = if id.is_some() {
        "update announcements set title=$2,content=$3,status=$4,delivery=$5,group_ids=$6,starts_at=$7,ends_at=$8,revision=revision+1,updated_at=clock_timestamp() where id=$1 and revision=$10 and $9::uuid is not null"
    } else {
        "insert into announcements(id,title,content,status,delivery,group_ids,starts_at,ends_at,created_by) select $1,$2,$3,$4,$5,$6,$7,$8,$9 where $10::bigint is null"
    };
    let changed = sqlx::query(sql)
        .bind(target)
        .bind(draft.title)
        .bind(draft.content)
        .bind(draft.status)
        .bind(draft.delivery)
        .bind(draft.group_ids)
        .bind(draft.starts_at)
        .bind(draft.ends_at)
        .bind(actor)
        .bind(revision)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    if changed.rows_affected() != 1 {
        return Err(IdentityError::Conflict);
    }
    audit(tx, session, actor, target, "announcement.saved").await?;
    Ok(json!({"id":target}))
}

pub(super) async fn delete(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
    id: Uuid,
    revision: i64,
) -> IdentityResult<Value> {
    let actor = management(tx, session, Permission::SecuritySettingsManage).await?;
    let changed = sqlx::query("delete from announcements where id=$1 and revision=$2")
        .bind(id)
        .bind(revision)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    if changed.rows_affected() != 1 {
        return Err(IdentityError::Conflict);
    }
    audit(tx, session, actor, id, "announcement.deleted").await?;
    Ok(json!({"id":id}))
}

pub(super) async fn mark_read(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
    id: Uuid,
    revision: i64,
) -> IdentityResult<Value> {
    let (_, user) = customer(session)?;
    // Lock against an editor publishing a new revision during acknowledgement.
    let current: Option<i64> =
        sqlx::query_scalar("select revision from announcements where id=$1 for share")
            .bind(id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(db_error)?;
    if current != Some(revision) {
        return Err(IdentityError::Conflict);
    }
    let sql = format!(
        "insert into announcement_reads(announcement_id,user_id,revision) select a.id,u.id,a.revision from announcements a join identity_users u on u.id=$2 where a.id=$1 and a.status='published' and (a.starts_at is null or a.starts_at<=clock_timestamp()) and (a.ends_at is null or a.ends_at>clock_timestamp()) and {AUDIENCE} on conflict(announcement_id,user_id) do update set revision=excluded.revision,read_at=clock_timestamp()"
    );
    let changed = sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(id)
        .bind(user)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    if changed.rows_affected() != 1 {
        return Err(IdentityError::NotFound);
    }
    Ok(json!({"id":id}))
}

async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
    actor: Uuid,
    id: Uuid,
    action: &str,
) -> IdentityResult<()> {
    sqlx::query("insert into identity_audit_events(actor_kind,actor_id,session_id,action,target_kind,target_id,metadata) values('management_principal',$1,$2,$3,'announcement',$4,'{}')")
        .bind(actor).bind(session.id.to_string()).bind(action).bind(id).execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}

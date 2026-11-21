//! Current operator profile and live-grant row projections.

use super::*;

pub(super) fn principal_row(row: &PgRow) -> IdentityResult<PrincipalRecord> {
    Ok(PrincipalRecord {
        id: ManagementPrincipalId::new(row.try_get("id").map_err(db_error)?),
        username: row.try_get("username").map_err(db_error)?,
        status: row.try_get("status").map_err(db_error)?,
        revision: version(row.try_get("revision").map_err(db_error)?)?,
        created_at: row.try_get("created_at").map_err(db_error)?,
        updated_at: row.try_get("updated_at").map_err(db_error)?,
    })
}

pub(super) fn grant(row: &PgRow) -> IdentityResult<GrantRecord> {
    Ok(GrantRecord {
        id: row.try_get("id").map_err(db_error)?,
        principal_id: ManagementPrincipalId::new(row.try_get("principal_id").map_err(db_error)?),
        scope: scope(row)?,
        permissions: permissions(row)?,
        status: row.try_get("status").map_err(db_error)?,
        expires_at: row.try_get("expires_at").map_err(db_error)?,
        revision: version(row.try_get("authority_generation").map_err(db_error)?)?,
        created_at: row.try_get("created_at").map_err(db_error)?,
        updated_at: row.try_get("updated_at").map_err(db_error)?,
    })
}

//! PostgreSQL migration ownership and runtime dependency checks.
use sqlx::{PgPool, migrate::Migrate, postgres::PgPoolOptions};
use std::time::Duration;

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

pub async fn connect(url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect(url)
        .await
}

pub async fn migrate(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    // SQLx serializes migrations with PostgreSQL advisory locking and verifies
    // applied versions and checksums. Unknown newer versions are rejected.
    let mut connection = pool.acquire().await?;
    // Never return a migration session to the pool: errors/cancellation may leave
    // a session advisory lock held until the PostgreSQL connection closes.
    connection.close_on_drop();
    MIGRATOR.run(&mut *connection).await
}

pub async fn revert(pool: &PgPool, target: i64) -> Result<(), Box<dyn std::error::Error>> {
    let mut connection = pool.acquire().await?;
    connection.close_on_drop();
    // Keep validation and undo under the same SQLx advisory lock.
    connection.lock().await?;
    let current: Option<i64> =
        sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations WHERE success = true")
            .fetch_one(&mut *connection)
            .await?;
    let current = current.ok_or("No applied migrations to revert")?;
    if target < 0 || target >= current {
        return Err("Target must be below the current schema version".into());
    }
    if target != 0
        && !MIGRATOR
            .iter()
            .any(|m| m.version == target && m.migration_type.is_up_migration())
    {
        return Err("Target does not exist in this binary".into());
    }
    // Validate the installed history without applying pending upgrades first.
    let history: Vec<(i64, Vec<u8>, bool)> =
        sqlx::query_as("SELECT version, checksum, success FROM _sqlx_migrations ORDER BY version")
            .fetch_all(&mut *connection)
            .await?;
    for (version, checksum, success) in history {
        let migration = MIGRATOR
            .iter()
            .find(|m| m.version == version && m.migration_type.is_up_migration())
            .ok_or("Database contains a migration unknown to this binary")?;
        if !success || migration.checksum.as_ref() != checksum.as_slice() {
            return Err("Migration history is dirty or its checksum has changed".into());
        }
    }
    let mut migrator = sqlx::migrate!("./migrations");
    // This session already owns the lock; closing it releases the lock on all paths.
    migrator.set_locking(false);
    migrator.undo(&mut *connection, target).await?;
    Ok(())
}

#[derive(Clone)]
pub struct Dependencies {
    pub postgres: PgPool,
    pub redis: redis::Client,
}

impl Dependencies {
    pub async fn ready(&self) -> bool {
        tokio::time::timeout(Duration::from_secs(2), async {
            sqlx::query("SELECT 1").execute(&self.postgres).await.ok()?;
            let mut connection = self.redis.get_multiplexed_async_connection().await.ok()?;
            let pong: String = redis::cmd("PING").query_async(&mut connection).await.ok()?;
            (pong == "PONG").then_some(())
        })
        .await
        .is_ok_and(|result| result.is_some())
    }
}

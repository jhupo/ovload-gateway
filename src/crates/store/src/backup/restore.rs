//! Restore is executed between complete runtime shutdown and a fresh bootstrap.
//! Durable control files live outside the database being replaced.

use std::{
    fs::{File, OpenOptions},
    io::Write as _,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use async_compression::tokio::bufread::GzipDecoder;
use chrono::Utc;
use fs2::FileExt as _;
use ovload_admin::{
    model::{
        AdminError, MutationContext,
        audit::MutationAuditOperation,
        backup::{BackupStatus, BackupStorageConfig},
    },
    ports::{
        backup::BackupRepository,
        backup_extensions::{RestoreAccepted, RestoreStatus},
    },
};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use sqlx::{PgPool, postgres::PgPoolOptions};
use tokio::{
    io::{AsyncReadExt as _, AsyncWriteExt as _, BufReader},
    process::Command,
};
use uuid::Uuid;

use super::{archive::ArchiveWriter, extensions::StorageExtensions};
use crate::{StoreConfig, StoreResult, postgres::PgBackupRepository};

const LIMIT: u64 = 64 * 1024 * 1024 * 1024;
const SQL_LIMIT: u64 = 128 * 1024 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
struct Job {
    view: RestoreStatus,
    backup_id: String,
    ticket_hash: String,
    created_at: chrono::DateTime<Utc>,
    size: u64,
    sha256: String,
}

fn directory(config: &StoreConfig) -> PathBuf {
    config.backup_staging_dir().join("restore")
}
fn state_path(config: &StoreConfig) -> PathBuf {
    directory(config).join("state.json")
}

fn read_job(config: &StoreConfig) -> Result<Option<Job>, AdminError> {
    let path = state_path(config);
    match std::fs::read(path) {
        Ok(bytes) if bytes.len() <= 16384 => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|_| failure("恢复状态文件损坏")),
        Ok(_) => Err(failure("恢复状态文件过大")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(failure("无法读取恢复状态")),
    }
}

fn private_file(path: &Path) -> Result<File, AdminError> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt as _;
        options.mode(0o600);
    }
    options.open(path).map_err(|_| failure("无法创建恢复文件"))
}

fn write_job(config: &StoreConfig, job: &Job) -> Result<(), AdminError> {
    let temporary = directory(config).join(format!("{}.tmp", Uuid::new_v4()));
    let mut file = private_file(&temporary)?;
    let bytes = serde_json::to_vec(job).map_err(|_| failure("无法保存恢复状态"))?;
    file.write_all(&bytes)
        .and_then(|()| file.sync_all())
        .map_err(|_| failure("无法保存恢复状态"))?;
    std::fs::rename(&temporary, state_path(config)).map_err(|_| failure("无法提交恢复状态"))?;
    #[cfg(unix)]
    {
        File::open(directory(config))
            .and_then(|file| file.sync_all())
            .map_err(|_| failure("无法提交恢复状态"))?;
    }
    Ok(())
}

fn lock(config: &StoreConfig) -> Result<File, AdminError> {
    let directory = directory(config);
    std::fs::create_dir_all(&directory).map_err(|_| failure("无法创建恢复目录"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| failure("无法保护恢复目录"))?;
    }
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(directory.join("operation.lock"))
        .map_err(|_| failure("无法锁定恢复操作"))?;
    file.try_lock_exclusive()
        .map_err(|_| AdminError::conflict("已经有恢复操作正在执行"))?;
    Ok(file)
}

pub(super) async fn request(
    service: &StorageExtensions,
    backup_id: &str,
    context: &MutationContext,
) -> Result<RestoreAccepted, AdminError> {
    let shutdown = service
        .shutdown
        .lock()
        .ok()
        .and_then(|token| token.clone())
        .ok_or_else(|| failure("当前运行模式不支持数据库恢复"))?;
    if shutdown.is_cancelled() {
        return Err(AdminError::conflict("服务正在停止"));
    }
    let _lock = lock(&service.config)?;
    if read_job(&service.config)?
        .is_some_and(|job| matches!(job.view.status.as_str(), "queued" | "restoring"))
    {
        return Err(AdminError::conflict("已经有恢复任务"));
    }
    let repository = PgBackupRepository::new(service.pool.clone());
    let record = repository
        .load_backup_record(backup_id)
        .await
        .map_err(super::extensions::unavailable)?
        .ok_or_else(|| AdminError::not_found("备份不存在"))?;
    if record.status != BackupStatus::Completed
        || record.expires_at.is_some_and(|time| time <= Utc::now())
    {
        return Err(AdminError::conflict("只能恢复未过期且已完成的备份"));
    }
    let active: bool = sqlx::query_scalar("select exists(select 1 from backup_records where status in ('queued','dumping','uploading','deleting'))").fetch_one(&service.pool).await.map_err(super::extensions::unavailable)?;
    if active {
        return Err(AdminError::conflict("请等待备份或删除任务完成后再恢复"));
    }
    let size = record
        .size_bytes
        .filter(|size| *size > 0 && *size <= LIMIT)
        .ok_or_else(|| failure("备份大小无效"))?;
    let sha256 = record
        .sha256
        .filter(|hash| hash.len() == 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or_else(|| failure("备份缺少完整校验和"))?;
    let id = Uuid::now_v7().to_string();
    let ticket = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    service
        .audit(context, MutationAuditOperation::BackupRestore, backup_id)
        .await?;
    write_job(
        &service.config,
        &Job {
            view: RestoreStatus {
                id: id.clone(),
                status: "queued".to_owned(),
                message: "正在准备恢复".to_owned(),
            },
            backup_id: backup_id.to_owned(),
            ticket_hash: hex::encode(Sha256::digest(ticket.as_bytes())),
            created_at: Utc::now(),
            size,
            sha256,
        },
    )?;
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(1)).await;
        shutdown.cancel();
    });
    Ok(RestoreAccepted { id, ticket })
}

pub(super) fn status(
    config: &StoreConfig,
    id: &str,
    ticket: &str,
) -> Result<RestoreStatus, AdminError> {
    let job = read_job(config)?.filter(|job| {
        job.view.id == id && job.created_at > Utc::now() - chrono::Duration::hours(24)
    });
    let job = job
        .filter(|job| {
            ticket.len() == 64 && hex::encode(Sha256::digest(ticket.as_bytes())) == job.ticket_hash
        })
        .ok_or_else(|| AdminError::not_found("恢复任务不存在"))?;
    Ok(job.view)
}

#[must_use]
pub fn has_pending(config: &StoreConfig) -> bool {
    read_job(config)
        .ok()
        .flatten()
        .is_some_and(|job| job.view.status == "queued")
}

/// The composition root calls this before opening runtime stores or workers.
pub async fn execute_pending(mut config: StoreConfig) -> StoreResult<()> {
    config.validate_resolved()?;
    let job = read_job(&config).map_err(store_error)?;
    let Some(mut job) =
        job.filter(|job| matches!(job.view.status.as_str(), "queued" | "restoring"))
    else {
        return Ok(());
    };
    let _lock = lock(&config).map_err(store_error)?;
    if job.view.status == "restoring" {
        job.view.status = "failed".to_owned();
        job.view.message = "上次恢复被中断，请检查数据库后重新提交恢复".to_owned();
        return write_job(&config, &job).map_err(store_error);
    }
    job.view.status = "restoring".to_owned();
    job.view.message = "正在校验并恢复数据库".to_owned();
    write_job(&config, &job).map_err(store_error)?;
    let result = tokio::time::timeout(Duration::from_secs(3600), restore(&config, &job))
        .await
        .unwrap_or_else(|_| Err(failure("恢复超过一小时，数据库事务将回滚")));
    job.view.status = if result.is_ok() {
        "completed"
    } else {
        "failed"
    }
    .to_owned();
    job.view.message = match result {
        Ok(()) => "数据库恢复成功，请重新登录".to_owned(),
        Err(error) => error.to_string(),
    };
    tracing::info!(restore_id=%job.view.id, status=%job.view.status, "Database restore finished");
    write_job(&config, &job).map_err(store_error)
}

async fn restore(config: &StoreConfig, job: &Job) -> Result<(), AdminError> {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .connect(
            &config
                .database_url()
                .map_err(super::extensions::unavailable)?,
        )
        .await
        .map_err(super::extensions::unavailable)?;
    let result = restore_connected(config, job, &pool).await;
    pool.close().await;
    let _ =
        tokio::fs::remove_file(directory(config).join(format!("{}.incoming.sql.gz", job.view.id)))
            .await;
    result
}

async fn restore_connected(
    config: &StoreConfig,
    job: &Job,
    pool: &PgPool,
) -> Result<(), AdminError> {
    let schema: String = sqlx::query_scalar("select current_schema()")
        .fetch_one(pool)
        .await
        .map_err(super::extensions::unavailable)?;
    if schema != "public" {
        return Err(failure("网页恢复仅支持 public schema"));
    }
    // Holding the connection keeps the advisory lease until restore finishes.
    sqlx::query("select pg_advisory_lock(709841033)")
        .execute(pool)
        .await
        .map_err(super::extensions::unavailable)?;
    for attempt in 0..10 {
        let peers: i64 = sqlx::query_scalar("select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and backend_type='client backend'").fetch_one(pool).await.map_err(super::extensions::unavailable)?;
        if peers == 0 {
            break;
        }
        if attempt == 9 {
            return Err(failure(
                "检测到其他数据库连接，请先停止其他网关和后台实例后再恢复",
            ));
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    let repository = PgBackupRepository::new(pool.clone());
    let record = repository
        .load_backup_record(&job.backup_id)
        .await
        .map_err(super::extensions::unavailable)?
        .ok_or_else(|| failure("备份记录已经变化"))?;
    if record.status != BackupStatus::Completed
        || record.sha256.as_deref() != Some(&job.sha256)
        || record.size_bytes != Some(job.size)
    {
        return Err(failure("备份记录校验失败"));
    }
    let settings = repository
        .load_settings()
        .await
        .map_err(super::extensions::unavailable)?;
    let storage = BackupStorageConfig::from_settings(&settings)
        .ok_or_else(|| failure("备份存储配置不完整"))?;
    let path = directory(config).join(format!("{}.incoming.sql.gz", job.view.id));
    let free = fs2::available_space(directory(config)).map_err(|_| failure("无法检查磁盘空间"))?;
    if free < job.size.saturating_add(1024 * 1024 * 1024) {
        return Err(failure("恢复暂存空间不足，请至少保留备份大小加 1 GiB"));
    }
    let mut response = super::s3::build_client(&storage)
        .get_object()
        .bucket(storage.bucket)
        .key(record.object_key)
        .send()
        .await
        .map_err(|_| failure("无法下载备份文件"))?;
    let file = private_file(&path)?;
    let mut file = tokio::fs::File::from_std(file);
    let mut hash = Sha256::new();
    let mut received = 0_u64;
    while let Some(chunk) = response
        .body
        .try_next()
        .await
        .map_err(|_| failure("备份下载失败"))?
    {
        received += chunk.len() as u64;
        if received > job.size {
            return Err(failure("备份大小与记录不符"));
        }
        hash.update(&chunk);
        file.write_all(&chunk)
            .await
            .map_err(|_| failure("无法写入恢复文件"))?;
    }
    file.sync_all()
        .await
        .map_err(|_| failure("无法写入恢复文件"))?;
    drop(file);
    if received != job.size || hex::encode(hash.finalize()) != job.sha256 {
        return Err(failure("备份 SHA-256 校验失败，已取消恢复"));
    }
    validate_archive(&path).await?;
    safety_backup(config, job).await?;
    let peers: i64 = sqlx::query_scalar("select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and backend_type='client backend'").fetch_one(pool).await.map_err(super::extensions::unavailable)?;
    if peers != 0 {
        return Err(failure("恢复准备期间出现其他数据库连接，已取消覆盖"));
    }
    let mut child = postgres_command("psql", config)
        .args([
            "--no-psqlrc",
            "--single-transaction",
            "--set",
            "ON_ERROR_STOP=on",
            "--file=-",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::from(private_file(
            &directory(config).join(format!("{}.psql.log", job.view.id)),
        )?))
        .spawn()
        .map_err(|_| failure("无法启动 psql，请安装 PostgreSQL 18 客户端"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| failure("无法连接恢复进程"))?;
    let write = async {
        stdin.write_all(b"SET lock_timeout='10s';\nDROP SCHEMA public CASCADE;\n").await?;
        let mut reader = archive_reader(&path).await?;
        tokio::io::copy(&mut reader, &mut stdin).await?;
        stdin.write_all(migration_guard().as_bytes()).await?;
        // A restored session or administrator key must never regain authority.
        stdin.write_all(b"\nUPDATE public.identity_sessions SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL;\n").await?;
        stdin.shutdown().await
    }.await;
    drop(stdin);
    let outcome = child
        .wait()
        .await
        .map_err(|_| failure("恢复进程异常，数据库事务已回滚"))?;
    write.map_err(|_| failure("恢复数据写入失败，数据库事务已回滚"))?;
    if !outcome.success() {
        return Err(failure("恢复 SQL 或版本校验失败，数据库事务已回滚"));
    }
    Ok(())
}

fn postgres_command(program: &str, config: &StoreConfig) -> Command {
    let mut command = Command::new(program);
    command
        .arg("--dbname")
        .arg(&config.database.url)
        .env("PGPASSWORD", &config.database.password)
        .env("PGCONNECT_TIMEOUT", "10")
        .env("PGAPPNAME", "ovload:restore")
        .env(
            "PGOPTIONS",
            "-c statement_timeout=0 -c idle_in_transaction_session_timeout=0",
        )
        .kill_on_drop(true);
    command
}

async fn archive_reader(path: &Path) -> std::io::Result<GzipDecoder<BufReader<tokio::fs::File>>> {
    Ok(GzipDecoder::new(BufReader::new(
        tokio::fs::File::open(path).await?,
    )))
}

async fn validate_archive(path: &Path) -> Result<(), AdminError> {
    let mut reader = archive_reader(path)
        .await
        .map_err(|_| failure("无法读取备份"))?;
    let mut preamble = [0; 32];
    reader
        .read_exact(&mut preamble)
        .await
        .map_err(|_| failure("备份 gzip 无效"))?;
    if !preamble.starts_with(b"DROP SCHEMA IF EXISTS \"public\";") {
        return Err(failure("备份不属于 public schema 或不是本系统创建的归档"));
    }
    let bytes = tokio::io::copy(&mut reader.take(SQL_LIMIT + 1), &mut tokio::io::sink())
        .await
        .map_err(|_| failure("备份 gzip 校验失败"))?;
    if bytes > SQL_LIMIT {
        return Err(failure("备份解压大小超限"));
    }
    Ok(())
}

async fn safety_backup(config: &StoreConfig, job: &Job) -> Result<(), AdminError> {
    let path = directory(config).join(format!("{}.before.sql.gz", job.view.id));
    let file = private_file(&path)?;
    let mut writer = ArchiveWriter::new(file, LIMIT);
    let mut child = postgres_command("pg_dump", config)
        .args([
            "--format=plain",
            "--no-owner",
            "--no-privileges",
            "--lock-wait-timeout=10s",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| failure("无法创建恢复前安全备份"))?;
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| failure("无法读取安全备份"))?;
    let copy = tokio::io::copy(&mut stdout, &mut writer).await;
    if copy.is_err() {
        let _ = child.kill().await;
    }
    let outcome = child
        .wait()
        .await
        .map_err(|_| failure("安全备份进程失败"))?;
    if copy.is_err() || !outcome.success() {
        let _ = tokio::fs::remove_file(&path).await;
        return Err(failure("恢复前安全备份失败，已取消恢复"));
    }
    writer
        .finish()
        .await
        .map_err(|_| failure("安全备份落盘失败，已取消恢复"))?;
    Ok(())
}

fn migration_guard() -> String {
    let rows = crate::postgres::MIGRATOR
        .iter()
        .map(|migration| {
            format!(
                "({},'{}')",
                migration.version,
                hex::encode(&migration.checksum)
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "\nDO $restore_guard$ BEGIN IF EXISTS (SELECT 1 FROM public._sqlx_migrations m LEFT JOIN (VALUES {rows}) AS known(version,checksum) ON m.version=known.version WHERE known.version IS NULL OR encode(m.checksum,'hex')<>known.checksum OR NOT m.success) THEN RAISE EXCEPTION 'Incompatible backup migration history'; END IF; END $restore_guard$;\n"
    )
}

fn failure(message: &str) -> AdminError {
    AdminError::bad_gateway(message)
}
fn store_error(error: AdminError) -> crate::StoreError {
    crate::StoreError::InvalidData {
        entity: "database restore",
        message: error.to_string(),
        source: None,
    }
}

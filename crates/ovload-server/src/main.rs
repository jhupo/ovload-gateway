use std::net::SocketAddr;
use tracing_subscriber::EnvFilter;

async fn shutdown() {
    let interrupt = async {
        tokio::signal::ctrl_c()
            .await
            .expect("install interrupt handler");
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install termination handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = interrupt => {}, _ = terminate => {} }
    tracing::info!("draining connections");
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let command = args.first().map(String::as_str).unwrap_or("serve");
    if !matches!(
        command,
        "serve" | "preview" | "migrate" | "schema-status" | "schema-revert"
    ) {
        return Err(
            "Commands: serve, preview, migrate, schema-status, schema-revert TARGET --confirm"
                .into(),
        );
    }
    if command != "schema-revert" && args.len() > 1 {
        return Err("Unexpected arguments".into());
    }
    // Preview is explicitly local and stateless; it never serves model requests.
    let dependencies = if command == "preview" {
        None
    } else {
        let database_url = std::env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is required")?;
        let pool = ovload_server::storage::connect(&database_url).await?;
        if command == "schema-status" {
            let exists: Option<String> =
                sqlx::query_scalar("SELECT to_regclass('public._sqlx_migrations')::text")
                    .fetch_one(&pool)
                    .await?;
            if exists.is_none() {
                println!("Schema is uninitialized");
                return Ok(());
            }
            let rows: Vec<(i64, String, bool)> = sqlx::query_as(
                "SELECT version, description, success FROM _sqlx_migrations ORDER BY version",
            )
            .fetch_all(&pool)
            .await?;
            for (version, description, success) in rows {
                println!("{version} {description} success={success}");
            }
            return Ok(());
        }
        if command == "schema-revert" {
            if args.len() != 3 || args[2] != "--confirm" {
                return Err(
                    "Stop writers and back up first; use schema-revert TARGET --confirm".into(),
                );
            }
            ovload_server::storage::revert(&pool, args[1].parse()?).await?;
            return Ok(());
        }
        ovload_server::storage::migrate(&pool).await?;
        if command == "migrate" {
            return Ok(());
        }
        let redis_url = std::env::var("REDIS_URL").map_err(|_| "REDIS_URL is required")?;
        let deps = ovload_server::storage::Dependencies {
            postgres: pool,
            redis: redis::Client::open(redis_url)?,
        };
        if !deps.ready().await {
            return Err("Runtime dependencies are not ready".into());
        }
        Some(deps)
    };
    let address: SocketAddr = std::env::var("OVLOAD_LISTEN")
        .unwrap_or_else(|_| "127.0.0.1:8080".into())
        .parse()?;
    if command == "preview" && !address.ip().is_loopback() {
        return Err("Preview mode must bind to a loopback address".into());
    }
    let app = match dependencies {
        Some(deps) => {
            let web_dir = std::path::PathBuf::from(
                std::env::var("OVLOAD_WEB_DIR").unwrap_or_else(|_| "web".into()),
            );
            if !web_dir.join("index.html").is_file() {
                return Err("OVLOAD_WEB_DIR must contain index.html".into());
            }
            ovload_server::deployed_router(deps, web_dir)
        }
        None => ovload_server::router(),
    };
    let listener = tokio::net::TcpListener::bind(address).await?;
    tracing::info!(%address, command, "Ovload Gateway listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

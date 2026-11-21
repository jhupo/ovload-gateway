//! Runs only against the disposable deployment-verification database and S3 fixture.

use base64::{Engine as _, engine::general_purpose::STANDARD};
use ovload_admin::{
    model::{AdminErrorKind, MutationActor, MutationContext},
    ports::backup_extensions::*,
};
use ovload_store::{StoreConfig, backup::extensions::StorageExtensions};
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() {
    let path = std::env::var("OVLOAD_STORAGE_VERIFY_CONFIG")
        .expect("dedicated verification config required");
    let document: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    let mut url = url::Url::parse(document["store"]["database"]["url"].as_str().unwrap()).unwrap();
    assert_eq!(
        url.path(),
        "/ovload_storage_verify",
        "never execute against a real application database"
    );
    url.set_password(Some(
        document["store"]["database"]["password"].as_str().unwrap(),
    ))
    .unwrap();
    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(url.as_str())
        .await
        .unwrap();
    let mut config: StoreConfig = serde_json::from_value(document["store"].clone()).unwrap();
    config
        .resolve_and_validate(std::path::Path::new("/test-runtime/data"))
        .unwrap();
    let service = StorageExtensions::new(pool.clone(), config);
    let context = MutationContext {
        actor: MutationActor::System,
        request_id: "storage-extension-verification".to_owned(),
    };
    let command = ImageStorageUpdate {
        enabled: true,
        endpoint: "https://192.168.2.150:19445".to_owned(),
        region: "auto".to_owned(),
        bucket: "verification".to_owned(),
        prefix: "images".to_owned(),
        access_key_id: Some("fixture-image-access".to_owned()),
        secret_access_key: Some("fixture-image-secret".to_owned()),
        force_path_style: true,
        public_domain: String::new(),
        presigned_expiry_hours: 1,
    };
    let mut invalid = command.clone();
    invalid.endpoint = "http://example.com".to_owned();
    assert_eq!(
        service
            .update_image_settings(invalid, &context)
            .await
            .err()
            .unwrap()
            .kind(),
        AdminErrorKind::Invalid
    );
    let settings = service
        .update_image_settings(command.clone(), &context)
        .await
        .unwrap();
    assert!(settings.has_secret && settings.has_access_key && !settings.verified);
    assert!(
        !serde_json::to_string(&settings)
            .unwrap()
            .contains("fixture-image-secret")
    );
    let encrypted: Value =
        sqlx::query_scalar("select credentials from generated_image_storage where singleton")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!encrypted.to_string().contains("fixture-image-secret"));
    assert!(service.test_image_storage(&context).await.unwrap().ok);
    println!("PASS image credentials are encrypted and the S3 probe passes");
    let one = service.create_image_job("fixture-owner").await.unwrap();
    let two = service.create_image_job("fixture-owner").await.unwrap();
    assert_eq!(
        service
            .create_image_job("fixture-owner")
            .await
            .err()
            .unwrap()
            .kind(),
        AdminErrorKind::RateLimited
    );
    assert_eq!(
        service
            .image_job("other-owner", &one.id)
            .await
            .err()
            .unwrap()
            .kind(),
        AdminErrorKind::NotFound
    );
    assert_eq!(
        service
            .update_image_settings(command.clone(), &context)
            .await
            .err()
            .unwrap()
            .kind(),
        AdminErrorKind::Conflict
    );
    let image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN0kAAAAASUVORK5CYII=";
    service
        .finish_image_job(
            &one.id,
            Ok(json!({"created":1,"data":[{"b64_json":image}]})),
        )
        .await
        .unwrap();
    let result = service.image_job("fixture-owner", &one.id).await.unwrap();
    assert_eq!(result.status, "completed");
    let result = result.result.unwrap();
    let response = reqwest::get(result["data"][0]["url"].as_str().unwrap())
        .await
        .unwrap();
    assert!(response.status().is_success());
    assert_eq!(
        response.bytes().await.unwrap().as_ref(),
        STANDARD.decode(image).unwrap()
    );
    service
        .finish_image_job(&two.id, Ok(json!({"data":[{"b64_json":"invalid"}]})))
        .await
        .unwrap();
    assert_eq!(
        service
            .image_job("fixture-owner", &two.id)
            .await
            .unwrap()
            .status,
        "failed"
    );
    println!(
        "PASS actual PNG upload/download, job ownership, concurrency and invalid image failure"
    );
    let mut public = command.clone();
    public.access_key_id = None;
    public.secret_access_key = None;
    public.public_domain = "https://192.168.2.150:19445/verification".to_owned();
    service
        .update_image_settings(public, &context)
        .await
        .unwrap();
    let result = service
        .image_job("fixture-owner", &one.id)
        .await
        .unwrap()
        .result
        .unwrap();
    assert!(
        result["data"][0]["url"]
            .as_str()
            .unwrap()
            .contains("/verification/images/")
    );
    let mut changed = command;
    changed.bucket = "different".to_owned();
    assert_eq!(
        service
            .update_image_settings(changed, &context)
            .await
            .err()
            .unwrap()
            .kind(),
        AdminErrorKind::Conflict
    );
    sqlx::query("update generated_image_jobs set expires_at=now()-interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();
    service.cleanup_images().await.unwrap();
    assert!(service.image_job("fixture-owner", &one.id).await.is_err());
    assert_eq!(
        reqwest::get(result["data"][0]["url"].as_str().unwrap())
            .await
            .unwrap()
            .status(),
        reqwest::StatusCode::NOT_FOUND
    );
    println!(
        "PASS preserved credentials, public URLs, storage identity protection and expiry cleanup"
    );
    pool.close().await;
}

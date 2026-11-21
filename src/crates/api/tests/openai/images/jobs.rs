use super::*;
use ovload_admin::{
    model::{AdminError, MutationContext, backup::ConnectionTestResult},
    ports::backup_extensions::*,
};

#[derive(Default)]
struct Jobs(Mutex<Vec<(String, ImageJob)>>);

#[tokio::test]
async fn asynchronous_body_limit_rejects_before_provider_execution() {
    let execution = ImageExecution::new();
    let router = api_router(execution.clone()).await;
    let response = router
        .oneshot(
            Request::post("/v1/images/generations")
                .header(AUTHORIZATION, "Bearer sk_images_test")
                .header("prefer", "respond-async")
                .body(Body::from(vec![b'x'; 32 * 1024 * 1024 + 1]))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    assert!(execution.captured().is_empty());
}

#[async_trait::async_trait]
impl BackupExtensionsPort for Jobs {
    async fn image_settings(&self) -> Result<ImageStorageSettings, AdminError> {
        unreachable!()
    }
    async fn update_image_settings(
        &self,
        _: ImageStorageUpdate,
        _: &MutationContext,
    ) -> Result<ImageStorageSettings, AdminError> {
        unreachable!()
    }
    async fn test_image_storage(
        &self,
        _: &MutationContext,
    ) -> Result<ConnectionTestResult, AdminError> {
        unreachable!()
    }
    async fn request_restore(
        &self,
        _: &str,
        _: &MutationContext,
    ) -> Result<RestoreAccepted, AdminError> {
        unreachable!()
    }
    async fn restore_status(&self, _: &str, _: &str) -> Result<RestoreStatus, AdminError> {
        unreachable!()
    }
    async fn create_image_job(&self, owner: &str) -> Result<ImageJob, AdminError> {
        let job = ImageJob {
            id: uuid::Uuid::new_v4().to_string(),
            status: "running".to_owned(),
            created_at: chrono::Utc::now(),
            expires_at: chrono::Utc::now() + chrono::Duration::days(7),
            result: None,
            error: None,
        };
        self.0.lock().unwrap().push((owner.to_owned(), job.clone()));
        Ok(job)
    }
    async fn finish_image_job(
        &self,
        id: &str,
        response: Result<Value, String>,
    ) -> Result<(), AdminError> {
        let mut jobs = self.0.lock().unwrap();
        let (_, job) = jobs.iter_mut().find(|(_, job)| job.id == id).unwrap();
        match response {
            Ok(result) => {
                job.status = "completed".to_owned();
                job.result = Some(result);
            }
            Err(error) => {
                job.status = "failed".to_owned();
                job.error = Some(error);
            }
        }
        Ok(())
    }
    async fn image_job(&self, owner: &str, id: &str) -> Result<ImageJob, AdminError> {
        self.0
            .lock()
            .unwrap()
            .iter()
            .find(|(key, job)| key == owner && job.id == id)
            .map(|(_, job)| job.clone())
            .ok_or_else(|| AdminError::not_found("Missing job"))
    }
}

#[tokio::test]
async fn asynchronous_image_execution_commits_once_and_requires_owner_authentication() {
    let jobs = Arc::new(Jobs::default());
    let fixture = crate::admin::AdminTestFixture::with_backup_extensions(jobs.clone()).await;
    let execution = ImageExecution::new();
    let router =
        crate::openai::api_router_with_admin_and_execution(fixture.services, execution.clone());
    let response = router
        .clone()
        .oneshot(
            Request::post("/v1/images/generations")
                .header(AUTHORIZATION, "Bearer sk_images_test")
                .header("prefer", "respond-async")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"model":"test-image","prompt":"test"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::ACCEPTED);
    assert_eq!(response.headers()["preference-applied"], "respond-async");
    let job: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    let path = format!("/v1/images/jobs/{}", job["id"].as_str().unwrap());
    let mut completed = false;
    for _ in 0..100 {
        let response = router
            .clone()
            .oneshot(
                Request::get(&path)
                    .header(AUTHORIZATION, "Bearer sk_images_test")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let value: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap())
                .unwrap();
        if value["status"] == "completed" {
            completed = true;
            assert_eq!(value["result"]["data"][0]["b64_json"], "AAEC");
            break;
        }
        tokio::task::yield_now().await;
    }
    assert!(completed, "background image execution must finish");
    assert_eq!(execution.captured().len(), 1);
    let body: Value = serde_json::from_slice(&execution.captured()[0].body).unwrap();
    assert_eq!(body["response_format"], "b64_json");
    assert_eq!(execution.committed_statuses(), vec![201]);
    let response = router
        .oneshot(
            Request::get(&path)
                .header(AUTHORIZATION, "Bearer incorrect_key")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert!(
        jobs.image_job("another-owner", job["id"].as_str().unwrap())
            .await
            .is_err()
    );
}

#[tokio::test]
async fn asynchronous_upstream_failure_finishes_job_without_successful_billing_commit() {
    let jobs = Arc::new(Jobs::default());
    let fixture = crate::admin::AdminTestFixture::with_backup_extensions(jobs.clone()).await;
    let execution = ImageExecution::failing();
    let router =
        crate::openai::api_router_with_admin_and_execution(fixture.services, execution.clone());
    let response = router
        .oneshot(
            Request::post("/v1/images/generations")
                .header(AUTHORIZATION, "Bearer sk_images_test")
                .header("prefer", "respond-async")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"model":"test-image","prompt":"test"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::ACCEPTED);
    for _ in 0..100 {
        if jobs.0.lock().unwrap()[0].1.status == "failed" {
            break;
        }
        tokio::task::yield_now().await;
    }
    assert_eq!(jobs.0.lock().unwrap()[0].1.status, "failed");
    assert!(execution.committed_statuses().is_empty());
}

use chrono::Utc;
use ovload_admin::model::backup::BackupSettings;
use ovload_api::{TimePresenter, admin::backups::BackupSettingsView};
use secrecy::SecretString;

#[test]
fn settings_presenter_never_serializes_saved_credentials() {
    let settings = BackupSettings {
        storage_enabled: true,
        storage_revision: 3,
        endpoint: Some("https://storage.example.test".into()),
        region: Some("synthetic-region".into()),
        bucket: Some("synthetic-bucket".into()),
        access_key_id: Some("synthetic-access-key".into()),
        secret_access_key: Some(SecretString::from("synthetic-secret-key")),
        prefix: Some("backups/".into()),
        force_path_style: false,
        schedule_enabled: false,
        cron_expression: None,
        schedule_timezone: None,
        retention_days: 14,
        retention_count: 10,
        next_run_at: None,
        last_verified_at: None,
        updated_at: Utc::now(),
    };
    for configured in [false, true] {
        let mut source = settings.clone();
        if !configured {
            source.access_key_id = None;
            source.secret_access_key = None;
        }
        let view = BackupSettingsView::from((source, TimePresenter::new(Default::default())));
        let value = serde_json::to_value(&view).expect("public settings serialize");
        assert_eq!(value["hasAccessKey"], configured);
        assert_eq!(value["hasSecret"], configured);
        assert!(value.get("accessKeyId").is_none());
        assert!(value.get("secretAccessKey").is_none());
        let serialized = value.to_string();
        let debug = format!("{view:?}");
        for credential in ["synthetic-access-key", "synthetic-secret-key"] {
            assert!(!serialized.contains(credential));
            assert!(!debug.contains(credential));
        }
    }
}

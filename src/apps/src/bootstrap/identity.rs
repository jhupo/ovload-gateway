//! Explicit operator bootstrap without starting providers, plugins or HTTP.

use super::{BootstrapError, GatewayConfig};

pub(super) async fn notification_key(
    path: Option<std::path::PathBuf>,
) -> Result<Option<secrecy::SecretBox<[u8; 32]>>, BootstrapError> {
    let Some(path) = path else {
        return Ok(None);
    };
    let key = tokio::task::spawn_blocking(move || {
        use std::io::Read as _;
        let invalid =
            || ovload_host::ConfigError::InvalidField("admin.identity_notification_key_file");
        let mut bytes = secrecy::SecretBox::new(Box::new([0u8; 33]));
        use secrecy::ExposeSecretMut as _;
        let mut file = std::fs::File::open(path).map_err(|_| invalid())?;
        let mut length = 0;
        while length < 33 {
            let read = file
                .read(&mut bytes.expose_secret_mut()[length..])
                .map_err(|_| invalid())?;
            if read == 0 {
                break;
            }
            length += read;
        }
        if length != 32 {
            return Err(invalid());
        }
        let mut key = secrecy::SecretBox::new(Box::new([0u8; 32]));
        key.expose_secret_mut()
            .copy_from_slice(&bytes.expose_secret_mut()[..32]);
        Ok(key)
    })
    .await
    .map_err(|_| {
        ovload_host::ConfigError::InvalidField("admin.identity_notification_key_file")
    })??;
    Ok(Some(key))
}

pub async fn provision_identity_operator(
    username: String,
    password: String,
) -> Result<String, BootstrapError> {
    let config = ovload_host::load_config::<GatewayConfig>()?;
    let store = ovload_store::initialize_management_security(
        config.store.with_timezone(config.host.timezone),
    )
    .await?;
    let service = ovload_admin::ManagementSecurityService::new(store);
    Ok(service
        .provision_operator(username, password.into())
        .await?
        .id
        .to_string())
}

pub async fn reset_identity_password(
    username: String,
    password: String,
) -> Result<String, BootstrapError> {
    let config = ovload_host::load_config::<GatewayConfig>()?;
    let store = ovload_store::initialize_management_security(
        config.store.with_timezone(config.host.timezone),
    )
    .await?;
    let service = ovload_admin::ManagementSecurityService::new(store);
    Ok(service
        .reset_password(username, password.into())
        .await?
        .id
        .to_string())
}

pub async fn bootstrap_identity_owner(
    username: String,
    password: String,
) -> Result<String, BootstrapError> {
    let config = ovload_host::load_config::<GatewayConfig>()?;
    let store =
        ovload_store::initialize_identity(config.store.with_timezone(config.host.timezone)).await?;
    let service = ovload_admin::IdentityService::new(store).await?;
    Ok(service
        .bootstrap_owner(&username, password)
        .await?
        .to_string())
}

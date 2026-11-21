//! Typed public site metadata, independent from provider execution policy.

use chrono::{DateTime, Utc};
use url::Url;

use super::{
    identity_access::{IdentityError, IdentityResult},
    identity_lifecycle::version,
    image_asset::ImageAsset,
};

pub const MAX_SITE_LOGO_UPLOAD_BYTES: usize = 300 * 1024;

#[derive(Debug, Clone)]
pub struct SiteSettings {
    pub revision: u64,
    pub name: String,
    pub subtitle: String,
    pub support: String,
    pub endpoint: String,
    pub logo: Option<ImageAsset>,
    pub updated_at: DateTime<Utc>,
}

impl SiteSettings {
    pub fn validate(&self) -> IdentityResult<()> {
        version(self.revision)?;
        validate_fields(&self.name, &self.subtitle, &self.support, &self.endpoint)?;
        if let Some(logo) = &self.logo {
            logo.validate()?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct UpdateSiteSettings {
    pub name: String,
    pub subtitle: String,
    pub support: String,
    pub endpoint: String,
}

impl UpdateSiteSettings {
    pub fn validate(&self) -> IdentityResult<()> {
        validate_fields(&self.name, &self.subtitle, &self.support, &self.endpoint)
    }
}

fn validate_fields(
    name: &str,
    subtitle: &str,
    support: &str,
    endpoint: &str,
) -> IdentityResult<()> {
    validate_text(name, 80, false)?;
    validate_text(subtitle, 160, true)?;
    validate_text(support, 500, true)?;
    validate_text(endpoint, 500, true)?;
    if endpoint.is_empty() {
        return Ok(());
    }
    if endpoint.chars().any(char::is_whitespace) {
        return Err(IdentityError::Invalid);
    }
    let url = Url::parse(endpoint).map_err(|_| IdentityError::Invalid)?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || url.port_or_known_default() == Some(0)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

fn validate_text(value: &str, maximum: usize, empty_allowed: bool) -> IdentityResult<()> {
    if (!empty_allowed && value.is_empty())
        || value.chars().count() > maximum
        || value.trim() != value
        || value.chars().any(char::is_control)
    {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

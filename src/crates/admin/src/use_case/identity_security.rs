use super::identity::verify_password;
use super::identity_lifecycle::IdentityLifecycleService;
use crate::model::{identity_access::*, identity_security::*};
use ring::aead::{Aad, Nonce};
use secrecy::SecretString;
use serde_json::{Value, json};
use sha2::{Digest as _, Sha256};
use std::net::IpAddr;

impl IdentityLifecycleService {
    pub(super) fn security_secrets(&self, d: &SecurityDocument) -> IdentityResult<Value> {
        if d.encrypted.is_empty() {
            return Ok(json!({}));
        }
        if !(29..=8192).contains(&d.encrypted.len()) {
            return Err(IdentityError::Unavailable);
        }
        let mut nonce = [0u8; 12];
        nonce.copy_from_slice(&d.encrypted[..12]);
        let mut body = d.encrypted[12..].to_vec();
        let bytes = self
            .key()?
            .open_in_place(
                Nonce::assume_unique_for_key(nonce),
                Aad::from(b"security-settings-v1"),
                &mut body,
            )
            .map_err(|_| IdentityError::Unavailable)?;
        serde_json::from_slice(bytes).map_err(|_| IdentityError::Unavailable)
    }
    pub async fn security_settings(&self, s: &IdentitySession) -> IdentityResult<Value> {
        let mut d = self.store.security_document(Some(s)).await?;
        let secrets = self.security_secrets(&d)?;
        let file = self
            .oauth
            .as_ref()
            .map(|o| o.public_configuration())
            .unwrap_or_else(|| json!({}));
        for name in ["github", "google", "linuxdo"] {
            if d.policy.providers[name]["clientId"].as_str() == Some("") {
                if let Some(p) = file.get(name) {
                    d.policy.providers[name] = p.clone();
                }
            }
        }
        let mut presence = serde_json::Map::new();
        for name in ["captcha", "github", "google", "linuxdo"] {
            presence.insert(
                name.to_owned(),
                json!(
                    secrets
                        .get(name)
                        .and_then(Value::as_str)
                        .is_some_and(|s| !s.is_empty())
                        || file.get(name).is_some()
                ),
            );
        }
        Ok(json!({"revision":d.revision,"values":d.policy,"hasSecrets":presence}))
    }
    pub async fn save_security_settings(
        &self,
        s: &IdentitySession,
        revision: u64,
        policy: SecurityPolicy,
        input: Value,
    ) -> IdentityResult<Value> {
        policy.validate()?;
        let current = self.store.security_document(Some(s)).await?;
        if revision != current.revision {
            return Err(IdentityError::Conflict);
        }
        let mut secrets = self.security_secrets(&current)?;
        let fields = input.as_object().ok_or(IdentityError::Invalid)?;
        for (name, value) in fields {
            if !["captcha", "github", "google", "linuxdo"].contains(&name.as_str()) {
                return Err(IdentityError::Invalid);
            }
            let value = value.as_str().ok_or(IdentityError::Invalid)?;
            if value.len() > 2048 || value.chars().any(char::is_control) {
                return Err(IdentityError::Invalid);
            }
            if !value.is_empty() {
                secrets[name] = json!(value);
            }
        }
        if policy.human_verification
            && secrets
                .get("captcha")
                .and_then(Value::as_str)
                .is_none_or(str::is_empty)
        {
            return Err(IdentityError::Invalid);
        }
        let encrypted = if secrets.as_object().is_some_and(|o| o.is_empty()) {
            Vec::new()
        } else {
            if serde_json::to_vec(&secrets)
                .map_err(|_| IdentityError::Invalid)?
                .len()
                > 8164
            {
                return Err(IdentityError::Invalid);
            }
            self.seal(&secrets, "security-settings-v1")?
        };
        self.store
            .save_security(
                s,
                SecurityDocument {
                    revision,
                    policy,
                    encrypted,
                },
            )
            .await?;
        self.security_settings(s).await
    }
    pub async fn verify_step_up(
        &self,
        s: &IdentitySession,
        password: SecretString,
        source: IpAddr,
    ) -> IdentityResult<()> {
        if secrecy::ExposeSecret::expose_secret(&password).len() > 256 {
            return Err(IdentityError::Invalid);
        }
        let account_digest = Sha256::digest(format!("step-up:{:?}", s.owner).as_bytes()).into();
        self.identity
            .consume_auth_attempt(source, account_digest)
            .await?;
        let credential = self.store.credential(s).await?;
        let ok = verify_password(
            self.password_capacity.clone(),
            password,
            credential.credential.password_hash,
        )
        .await?;
        self.identity
            .authentication_result(source, [0; 32], ok)
            .await?;
        if !ok {
            return Err(IdentityError::Forbidden);
        }
        self.identity.step_up(s, true).await?;
        Ok(())
    }
    pub async fn verify_human(&self, token: Option<String>, hostname: &str) -> IdentityResult<()> {
        let d = self.store.security_document(None).await?;
        if !d.policy.human_verification {
            return Ok(());
        }
        let secrets = self.security_secrets(&d)?;
        let secret = secrets
            .get("captcha")
            .and_then(Value::as_str)
            .ok_or(IdentityError::Unavailable)?;
        let token = token
            .filter(|s| !s.is_empty() && s.len() <= 2048)
            .ok_or(IdentityError::Forbidden)?;
        self.store.verify_human(secret, &token, hostname).await
    }
}

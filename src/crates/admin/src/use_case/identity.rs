//! Customer and management identity workflows; storage owns authorization ordering.

use std::{net::IpAddr, sync::Arc};

use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{Duration, Utc};
use ovload_core::access::{AccessSessionId, ManagementPrincipalId, TenantId, UserId};
use rand_core::{OsRng, RngCore as _};
use secrecy::{ExposeSecret as _, SecretString};
use sha2::{Digest as _, Sha256};
use subtle::ConstantTimeEq as _;
use tokio::sync::Semaphore;
use uuid::Uuid;

use crate::{
    model::{
        identity::CustomerUserRecord,
        identity_access::{
            CustomerDirectoryQuery, CustomerIdentityPage, IdentityAudience, IdentityCredential,
            IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
            IdentitySessionGrant, NewCustomerIdentity, NewIdentitySession, ProvisionCustomer,
            SetCustomerActive,
        },
    },
    ports::identity::IdentityStore,
};

const PASSWORD_WORKERS: usize = 4;

pub struct IdentityService {
    store: Arc<dyn IdentityStore>,
    password_capacity: Arc<Semaphore>,
    dummy_hash: SecretString,
}

impl IdentityService {
    pub async fn new(store: Arc<dyn IdentityStore>) -> IdentityResult<Self> {
        let password_capacity = Arc::new(Semaphore::new(PASSWORD_WORKERS));
        let dummy_hash = hash_password(password_capacity.clone(), random_token().into()).await?;
        Ok(Self {
            store,
            password_capacity,
            dummy_hash,
        })
    }

    pub async fn bootstrap_owner(
        &self,
        username: &str,
        password: impl Into<SecretString>,
    ) -> IdentityResult<ManagementPrincipalId> {
        let password = password.into();
        validate_username(username)?;
        validate_password(password.expose_secret())?;
        let hash = hash_password(self.password_capacity.clone(), password).await?;
        self.store.bootstrap_owner(username, hash).await
    }

    pub async fn login(
        &self,
        audience: IdentityAudience,
        login: String,
        password: SecretString,
        source: IpAddr,
        previous_token: Option<String>,
        consent_revision: Option<u64>,
    ) -> IdentityResult<IdentitySessionGrant> {
        // Budget keys are digests, never persistent plaintext email addresses.
        let login = match audience {
            IdentityAudience::Customer => login.trim().to_lowercase(),
            IdentityAudience::Management => login,
        };
        if login.len() > 320 || password.expose_secret().len() > 256 {
            return Err(IdentityError::Invalid);
        }
        let account_digest = digest(login.to_lowercase().as_bytes());
        self.store
            .consume_auth_attempt(source, account_digest)
            .await?;
        let credential = self.store.login_credential(audience, &login).await?;
        let encoded = credential.as_ref().map_or_else(
            || self.dummy_hash.clone(),
            |credential| credential.password_hash.clone(),
        );
        let valid = verify_password(self.password_capacity.clone(), password, encoded).await?;
        self.store
            .authentication_result(source, account_digest, valid && credential.is_some())
            .await?;
        if !valid || credential.is_none() {
            self.store
                .record_authentication_failure(credential.as_ref().map(|value| value.owner))
                .await?;
            return Err(IdentityError::Unauthorized);
        }
        self.finish_password_login(
            credential.ok_or(IdentityError::Unauthorized)?,
            previous_token,
            consent_revision,
        )
        .await
    }

    /// Resolve a browser login against the customer and management identity stores.
    /// The returned session owner remains authoritative for all subsequent requests.
    pub async fn login_any(
        &self,
        login: String,
        password: SecretString,
        source: IpAddr,
        previous_tokens: [Option<String>; 2],
        consent_revision: Option<u64>,
    ) -> IdentityResult<IdentitySessionGrant> {
        let login = login.trim().to_owned();
        let customer_login = login.to_lowercase();
        if login.is_empty() || login.len() > 320 || password.expose_secret().len() > 256 {
            return Err(IdentityError::Invalid);
        }
        let account_digest = digest(customer_login.as_bytes());
        self.store
            .consume_auth_attempt(source, account_digest)
            .await?;

        let customer = self
            .store
            .login_credential(IdentityAudience::Customer, &customer_login)
            .await?;
        let management = self
            .store
            .login_credential(IdentityAudience::Management, &login)
            .await?;
        // Always verify both candidates, including dummy hashes for absent records.
        let customer_valid = verify_password(
            self.password_capacity.clone(),
            password.clone(),
            customer
                .as_ref()
                .map_or_else(|| self.dummy_hash.clone(), |c| c.password_hash.clone()),
        )
        .await?
            && customer.is_some();
        let management_valid = verify_password(
            self.password_capacity.clone(),
            password,
            management
                .as_ref()
                .map_or_else(|| self.dummy_hash.clone(), |c| c.password_hash.clone()),
        )
        .await?
            && management.is_some();
        self.store
            .authentication_result(source, account_digest, customer_valid ^ management_valid)
            .await?;
        let [customer_token, management_token] = previous_tokens;
        let (credential, previous_token) = match (customer_valid, management_valid) {
            (true, false) => (customer, customer_token),
            (false, true) => (management, management_token),
            // Identical credentials in both namespaces must never choose greater authority.
            _ => {
                self.store.record_authentication_failure(None).await?;
                return Err(IdentityError::Unauthorized);
            }
        };
        self.finish_password_login(
            credential.ok_or(IdentityError::Unauthorized)?,
            previous_token,
            consent_revision,
        )
        .await
    }

    async fn finish_password_login(
        &self,
        credential: IdentityCredential,
        previous_token: Option<String>,
        consent_revision: Option<u64>,
    ) -> IdentityResult<IdentitySessionGrant> {
        let audience = match credential.owner {
            IdentityOwner::Customer { .. } => IdentityAudience::Customer,
            IdentityOwner::Management(_) => IdentityAudience::Management,
        };
        let previous_session = if let Some(token) = previous_token {
            match token_digest(&token) {
                Ok(token) => self
                    .store
                    .session(audience, token)
                    .await?
                    .filter(|session| session.owner == credential.owner)
                    .map(|session| session.id),
                Err(_) => None,
            }
        } else {
            None
        };
        let session = IdentitySession {
            id: Uuid::now_v7().into(),
            owner: credential.owner,
            authority_generation: credential.authority_generation,
            expires_at: Utc::now()
                + Duration::days(i64::from(
                    self.store.security_policy().await?.refresh_token_days,
                )),
        };
        let (grant, mut command) = issue_session(session, previous_session)?;
        command.consent_revision = if audience == IdentityAudience::Customer {
            consent_revision
        } else {
            None
        };
        self.store.create_session(command).await?;
        Ok(grant)
    }

    pub(crate) async fn external_session(
        &self,
        credential: crate::model::identity_access::IdentityCredential,
        consent_revision: Option<u64>,
    ) -> IdentityResult<IdentitySessionGrant> {
        if !matches!(credential.owner, IdentityOwner::Customer { .. }) {
            return Err(IdentityError::Forbidden);
        }
        let session = IdentitySession {
            id: Uuid::now_v7().into(),
            owner: credential.owner,
            authority_generation: credential.authority_generation,
            expires_at: Utc::now()
                + Duration::days(i64::from(
                    self.store.security_policy().await?.refresh_token_days,
                )),
        };
        let (grant, mut command) = issue_session(session, None)?;
        command.consent_revision = consent_revision;
        self.store.create_session(command).await?;
        Ok(grant)
    }

    pub async fn security_policy(
        &self,
    ) -> IdentityResult<crate::model::identity_security::SecurityPolicy> {
        self.store.security_policy().await
    }
    pub async fn step_up_allowed(&self, s: &IdentitySession) -> IdentityResult<bool> {
        if !self.store.security_policy().await?.step_up_verification {
            return Ok(true);
        }
        self.store.step_up(s, false).await
    }
    pub async fn rotate_admin_key(
        &self,
        s: &IdentitySession,
    ) -> IdentityResult<IdentitySessionGrant> {
        management_actor(s)?;
        let session = IdentitySession {
            id: Uuid::now_v7().into(),
            owner: s.owner,
            authority_generation: s.authority_generation,
            expires_at: Utc::now() + Duration::days(365),
        };
        let (grant, c) = issue_session(session, None)?;
        self.store.rotate_admin_key(s, c).await?;
        Ok(grant)
    }
    pub async fn admin_key_status(
        &self,
        session: &IdentitySession,
    ) -> IdentityResult<crate::model::identity_security::AdminKeyStatus> {
        management_actor(session)?;
        self.store.admin_key_status(session).await
    }
    pub async fn revoke_admin_key(&self, session: &IdentitySession) -> IdentityResult<()> {
        management_actor(session)?;
        self.store.revoke_admin_key(session).await
    }
    pub async fn authenticate(
        &self,
        audience: IdentityAudience,
        token: &str,
    ) -> IdentityResult<IdentitySession> {
        self.store
            .session(audience, token_digest(token)?)
            .await?
            .ok_or(IdentityError::Unauthorized)
    }

    pub fn csrf_token(access_token: &str) -> IdentityResult<String> {
        let secret = decode_token(access_token)?;
        let mut csrf = [0; 32];
        hkdf::Hkdf::<Sha256>::new(None, &secret)
            .expand(b"ovload-identity/csrf/v1", &mut csrf)
            .map_err(|_| IdentityError::Unavailable)?;
        Ok(URL_SAFE_NO_PAD.encode(csrf))
    }

    pub fn verify_csrf(access_token: &str, csrf: &str) -> IdentityResult<()> {
        let supplied = decode_token(csrf).map_err(|_| IdentityError::Forbidden)?;
        let expected = decode_token(&Self::csrf_token(access_token)?)?;
        if !bool::from(supplied.ct_eq(&expected)) {
            return Err(IdentityError::Forbidden);
        }
        Ok(())
    }

    pub async fn revoke_session(&self, current: &IdentitySession) -> IdentityResult<()> {
        self.store.revoke_session(current).await
    }

    pub async fn customer_profile(
        &self,
        current: &IdentitySession,
    ) -> IdentityResult<CustomerUserRecord> {
        self.store.customer_profile(current).await
    }

    pub async fn provision_customer(
        &self,
        current: &IdentitySession,
        command: ProvisionCustomer,
    ) -> IdentityResult<CustomerUserRecord> {
        let actor = management_actor(current)?;
        let email = command.email.trim().to_lowercase();
        validate_email(&email)?;
        validate_text(&command.display_name, 160)?;
        crate::model::identity_lifecycle::limits(
            command.max_concurrency,
            command.requests_per_minute,
        )?;
        crate::model::identity_lifecycle::notes(&command.notes)?;
        validate_password(command.password.expose_secret())?;
        let password_hash = hash_password(self.password_capacity.clone(), command.password).await?;
        let tenant_id = Uuid::now_v7();
        self.store
            .provision_customer(
                actor,
                NewCustomerIdentity {
                    tenant_id: tenant_id.into(),
                    user_id: Uuid::now_v7().into(),
                    slug: format!("customer-{}", tenant_id.simple()),
                    email,
                    display_name: command.display_name,
                    password_hash,
                    max_concurrency: command.max_concurrency,
                    requests_per_minute: command.requests_per_minute,
                    notes: command.notes,
                },
            )
            .await
    }

    pub async fn customer(
        &self,
        current: &IdentitySession,
        tenant: TenantId,
        user: UserId,
    ) -> IdentityResult<CustomerUserRecord> {
        self.store
            .customer(management_actor(current)?, tenant, user)
            .await
    }

    pub async fn customers(
        &self,
        current: &IdentitySession,
        query: CustomerDirectoryQuery,
    ) -> IdentityResult<CustomerIdentityPage> {
        query.validate()?;
        self.store
            .customers(management_actor(current)?, query)
            .await
    }

    pub async fn set_customer_active(
        &self,
        current: &IdentitySession,
        command: SetCustomerActive,
    ) -> IdentityResult<CustomerUserRecord> {
        if command.expected_revision == 0 || command.expected_revision > i64::MAX as u64 {
            return Err(IdentityError::Invalid);
        }
        self.store
            .set_customer_active(management_actor(current)?, command)
            .await
    }
}

fn management_actor(session: &IdentitySession) -> IdentityResult<IdentityManagementActor> {
    let IdentityOwner::Management(principal_id) = session.owner else {
        return Err(IdentityError::Forbidden);
    };
    Ok(IdentityManagementActor {
        session_id: session.id,
        principal_id,
        authority_generation: session.authority_generation,
    })
}

fn issue_session(
    session: IdentitySession,
    previous_session: Option<AccessSessionId>,
) -> IdentityResult<(IdentitySessionGrant, NewIdentitySession)> {
    let access_token = random_token();
    let csrf_token = IdentityService::csrf_token(&access_token)?;
    let command = NewIdentitySession {
        consent_revision: None,
        session: session.clone(),
        access_digest: token_digest(&access_token)?,
        csrf_digest: token_digest(&csrf_token)?,
        previous_session,
    };
    Ok((
        IdentitySessionGrant {
            session,
            access_token: access_token.into(),
            csrf_token: csrf_token.into(),
        },
        command,
    ))
}

pub(crate) fn random_token() -> String {
    let mut bytes = [0; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn digest(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

fn decode_token(token: &str) -> IdentityResult<[u8; 32]> {
    if token.len() != 43 {
        return Err(IdentityError::Unauthorized);
    }
    let bytes = URL_SAFE_NO_PAD
        .decode(token)
        .map_err(|_| IdentityError::Unauthorized)?;
    bytes.try_into().map_err(|_| IdentityError::Unauthorized)
}

fn token_digest(token: &str) -> IdentityResult<[u8; 32]> {
    decode_token(token)?;
    Ok(digest(token.as_bytes()))
}

fn validate_text(value: &str, maximum: usize) -> IdentityResult<()> {
    if value.is_empty()
        || value.len() > maximum
        || value.trim() != value
        || value.chars().any(char::is_control)
    {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

fn validate_username(value: &str) -> IdentityResult<()> {
    validate_text(value, 128)
}

fn validate_email(value: &str) -> IdentityResult<()> {
    validate_text(value, 320)?;
    if !email_address::EmailAddress::is_valid(value) {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

pub(crate) fn validate_password(value: &str) -> IdentityResult<()> {
    if !(12..=256).contains(&value.len()) || value.chars().any(char::is_control) {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

pub(crate) async fn hash_password(
    capacity: Arc<Semaphore>,
    password: SecretString,
) -> IdentityResult<SecretString> {
    let permit = capacity
        .try_acquire_owned()
        .map_err(|_| IdentityError::RateLimited)?;
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        Argon2::default()
            .hash_password(password.expose_secret().as_bytes())
            .map(|hash| SecretString::from(hash.to_string()))
            .map_err(|_| IdentityError::Unavailable)
    })
    .await
    .map_err(|_| IdentityError::Unavailable)?
}

pub(crate) async fn verify_password(
    capacity: Arc<Semaphore>,
    password: SecretString,
    encoded: SecretString,
) -> IdentityResult<bool> {
    let permit = capacity
        .try_acquire_owned()
        .map_err(|_| IdentityError::RateLimited)?;
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        let hash =
            PasswordHash::new(encoded.expose_secret()).map_err(|_| IdentityError::Unavailable)?;
        match Argon2::default().verify_password(password.expose_secret().as_bytes(), &hash) {
            Ok(()) => Ok(true),
            Err(argon2::password_hash::Error::PasswordInvalid) => Ok(false),
            Err(_) => Err(IdentityError::Unavailable),
        }
    })
    .await
    .map_err(|_| IdentityError::Unavailable)?
}

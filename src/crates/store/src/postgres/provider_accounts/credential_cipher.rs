use std::{io::Read as _, path::PathBuf, sync::Arc, time::Duration};

use ring::{
    aead::{self, Aad, LessSafeKey, Nonce, UnboundKey},
    rand::{SecureRandom as _, SystemRandom},
};
use secrecy::{ExposeSecret as _, ExposeSecretMut as _, SecretBox};
use serde::{Deserialize, Serialize};

use super::*;

const FORMAT: &str = "ovload.aes256gcm.v1";

#[derive(Clone)]
pub struct ProviderCredentialCipher(Arc<LessSafeKey>);

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    format: String,
    nonce: String,
    ciphertext: String,
}

impl ProviderCredentialCipher {
    pub fn new(key: SecretBox<[u8; 32]>) -> StoreResult<Self> {
        let key =
            UnboundKey::new(&aead::AES_256_GCM, key.expose_secret()).map_err(|_| cipher_error())?;
        Ok(Self(Arc::new(LessSafeKey::new(key))))
    }

    pub(crate) async fn load(path: PathBuf) -> StoreResult<Self> {
        tokio::task::spawn_blocking(move || {
            let file = std::fs::File::open(path).map_err(|_| cipher_error())?;
            let mut bytes = SecretBox::new(Box::new([0u8; 33]));
            let mut reader = file.take(33);
            let mut count = 0;
            loop {
                let read = reader
                    .read(&mut bytes.expose_secret_mut()[count..])
                    .map_err(|_| cipher_error())?;
                if read == 0 {
                    break;
                }
                count += read;
                if count == 33 {
                    return Err(cipher_error());
                }
            }
            if count != 32 {
                return Err(cipher_error());
            }
            let mut key = SecretBox::new(Box::new([0u8; 32]));
            key.expose_secret_mut()
                .copy_from_slice(&bytes.expose_secret()[..32]);
            Self::new(key)
        })
        .await
        .map_err(|_| cipher_error())?
    }

    /// Encrypt a bounded document, authenticating its owning account identifier.
    pub fn seal(&self, id: &str, value: &JsonObject) -> StoreResult<serde_json::Value> {
        let bytes = serde_json::to_vec(&value.as_value()).map_err(|_| cipher_error())?;
        if bytes.len() > CREDENTIALS_MAX_BYTES {
            return Err(cipher_error());
        }
        let mut bytes = secrecy::SecretSlice::from(bytes);
        let mut nonce = [0; 12];
        SystemRandom::new()
            .fill(&mut nonce)
            .map_err(|_| cipher_error())?;
        let tag = self
            .0
            .seal_in_place_separate_tag(
                Nonce::assume_unique_for_key(nonce),
                Aad::from(id.as_bytes()),
                bytes.expose_secret_mut(),
            )
            .map_err(|_| cipher_error())?;
        let mut ciphertext = hex::encode(bytes.expose_secret());
        ciphertext.push_str(&hex::encode(tag.as_ref()));
        serde_json::to_value(Envelope {
            format: FORMAT.to_owned(),
            nonce: hex::encode(nonce),
            ciphertext,
        })
        .map_err(|_| cipher_error())
    }

    pub(crate) fn open(&self, id: &str, value: serde_json::Value) -> StoreResult<JsonObject> {
        let envelope: Envelope = serde_json::from_value(value).map_err(|_| cipher_error())?;
        if envelope.format != FORMAT || envelope.ciphertext.len() > (CREDENTIALS_MAX_BYTES + 16) * 2
        {
            return Err(cipher_error());
        }
        let nonce: [u8; 12] = hex::decode(envelope.nonce)
            .map_err(|_| cipher_error())?
            .try_into()
            .map_err(|_| cipher_error())?;
        let mut bytes = secrecy::SecretSlice::from(
            hex::decode(envelope.ciphertext).map_err(|_| cipher_error())?,
        );
        let plaintext = self
            .0
            .open_in_place(
                Nonce::assume_unique_for_key(nonce),
                Aad::from(id.as_bytes()),
                bytes.expose_secret_mut(),
            )
            .map_err(|_| cipher_error())?;
        let value = serde_json::from_slice(plaintext).map_err(|_| cipher_error())?;
        JsonObject::try_from_value("provider credentials", value, CREDENTIALS_MAX_BYTES)
    }

    pub(crate) async fn prepare_storage(&self, pool: &PgPool) -> StoreResult<()> {
        tokio::time::timeout(Duration::from_secs(120), self.prepare_storage_inner(pool))
            .await
            .map_err(|_| cipher_error())?
    }

    async fn prepare_storage_inner(&self, pool: &PgPool) -> StoreResult<()> {
        let mut tx = pool.begin().await.map_err(|_| cipher_error())?;
        sqlx::query("lock table provider_accounts in access exclusive mode")
            .execute(&mut *tx)
            .await
            .map_err(|_| cipher_error())?;
        let mut cursor = String::new();
        loop {
            let rows: Vec<(String, serde_json::Value)> = sqlx::query_as(
                "select id,provider_credentials_json from provider_accounts where id>$1 order by id limit 64",
            ).bind(&cursor).fetch_all(&mut *tx).await.map_err(|_| cipher_error())?;
            if rows.is_empty() {
                break;
            }
            for (id, value) in rows {
                if value.get("format").and_then(serde_json::Value::as_str) == Some(FORMAT) {
                    self.open(&id, value)?;
                } else {
                    let value = JsonObject::try_from_value(
                        "provider credentials",
                        value,
                        CREDENTIALS_MAX_BYTES,
                    )?;
                    let sealed = self.seal(&id, &value)?;
                    sqlx::query(
                        "update provider_accounts set provider_credentials_json=$2 where id=$1",
                    )
                    .bind(&id)
                    .bind(sealed)
                    .execute(&mut *tx)
                    .await
                    .map_err(|_| cipher_error())?;
                }
                cursor = id;
            }
        }
        sqlx::query(
            "alter table provider_accounts validate constraint provider_credentials_encrypted",
        )
        .execute(&mut *tx)
        .await
        .map_err(|_| cipher_error())?;
        tx.commit().await.map_err(|_| cipher_error())
    }
}

fn cipher_error() -> StoreError {
    StoreError::InvalidData {
        source: None,
        entity: "provider credential encryption",
        message: "credential key, envelope or encrypted storage is unavailable or invalid"
            .to_owned(),
    }
}

use super::*;

#[tokio::test]
async fn credential_envelopes_reject_wrong_keys_tampering_and_account_substitution() {
    let Some(database) = TestDatabase::create("credential_envelope_integrity").await else {
        return;
    };
    let repository = PgProviderAccountRepository::new(
        database.pool.clone(),
        crate::postgres::credential_cipher(),
    );
    for (id, user) in [
        ("acct_cipher_a", "cipher-user-a"),
        ("acct_cipher_b", "cipher-user-b"),
    ] {
        repository
            .insert_provider_account(account(id, user))
            .await
            .unwrap();
    }
    let envelope: serde_json::Value = sqlx::query_scalar(
        "select provider_credentials_json from provider_accounts where id='acct_cipher_a'",
    )
    .fetch_one(&database.pool)
    .await
    .unwrap();
    assert_encrypted_marker(&repository, "acct_cipher_a", &envelope, "initial-secret").await;
    let cipher = crate::postgres::credential_cipher();
    let second = cipher
        .seal("acct_cipher_a", &credential_json("initial-secret"))
        .unwrap();
    assert_ne!(envelope["nonce"], second["nonce"]);
    assert_ne!(envelope["ciphertext"], second["ciphertext"]);

    let wrong = ovload_store::postgres::ProviderCredentialCipher::new(secrecy::SecretBox::new(
        Box::new([23; 32]),
    ))
    .unwrap();
    let wrong_repository = PgProviderAccountRepository::new(database.pool.clone(), wrong);
    assert!(
        wrong_repository
            .load_provider_account("acct_cipher_a")
            .await
            .is_err()
    );

    sqlx::query(
        "update provider_accounts set provider_credentials_json=$1 where id='acct_cipher_b'",
    )
    .bind(&envelope)
    .execute(&database.pool)
    .await
    .unwrap();
    assert!(
        repository
            .load_provider_account("acct_cipher_b")
            .await
            .is_err()
    );

    let mut tampered = envelope.clone();
    let text = tampered["ciphertext"].as_str().unwrap();
    let replacement = if text.starts_with('0') { "1" } else { "0" };
    tampered["ciphertext"] = serde_json::Value::String(format!("{replacement}{}", &text[1..]));
    sqlx::query(
        "update provider_accounts set provider_credentials_json=$1 where id='acct_cipher_a'",
    )
    .bind(tampered)
    .execute(&database.pool)
    .await
    .unwrap();
    assert!(
        repository
            .load_provider_account("acct_cipher_a")
            .await
            .is_err()
    );

    assert!(sqlx::query("update provider_accounts set provider_credentials_json='{}'::jsonb where id='acct_cipher_a'")
        .execute(&database.pool).await.is_err());
    database.close().await;
}

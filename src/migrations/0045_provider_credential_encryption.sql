-- The startup cutover encrypts historical rows before validating this constraint.
ALTER TABLE provider_accounts DROP CONSTRAINT provider_accounts_credentials_ck;
ALTER TABLE provider_accounts ADD CONSTRAINT provider_credentials_encrypted CHECK ((
    jsonb_typeof(provider_credentials_json) = 'object'
    AND provider_credentials_json->>'format' = 'ovload.aes256gcm.v1'
    AND jsonb_typeof(provider_credentials_json->'nonce') = 'string'
    AND jsonb_typeof(provider_credentials_json->'ciphertext') = 'string'
    AND length(provider_credentials_json->>'nonce') = 24
    AND length(provider_credentials_json->>'ciphertext') BETWEEN 32 AND 524320
    AND octet_length(provider_credentials_json::text) <= 524500
) IS TRUE) NOT VALID;

CREATE TABLE generated_image_storage (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    revision bigint NOT NULL DEFAULT 0,
    settings jsonb NOT NULL DEFAULT '{"enabled":false,"endpoint":"","region":"auto","bucket":"","prefix":"images","forcePathStyle":true,"publicDomain":"","presignedExpiryHours":24}',
    credentials jsonb,
    verified_revision bigint,
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO generated_image_storage(singleton) VALUES (true);

CREATE TABLE generated_image_jobs (
    id uuid PRIMARY KEY,
    owner_key_id text NOT NULL,
    status text NOT NULL CHECK (status IN ('running','completed','failed')),
    storage_revision bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
    result jsonb,
    object_keys text[] NOT NULL DEFAULT '{}',
    error text,
    CHECK ((status = 'completed') = (result IS NOT NULL))
);
CREATE INDEX generated_image_jobs_owner ON generated_image_jobs(owner_key_id,created_at DESC);
CREATE INDEX generated_image_jobs_active ON generated_image_jobs(created_at) WHERE status='running';

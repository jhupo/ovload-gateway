CREATE TABLE workspace_settings (
    kind text PRIMARY KEY CHECK (kind IN ('features', 'pages')),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    values jsonb NOT NULL CHECK (jsonb_typeof(values) = 'object'),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Infrastructure metadata only; business schemas arrive with their features.
CREATE TABLE gateway_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT INTO gateway_metadata (key, value) VALUES ('schema_purpose', 'ovload-gateway');

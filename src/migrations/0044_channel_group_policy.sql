ALTER TABLE account_groups
    ADD COLUMN visibility text NOT NULL DEFAULT 'private'
        CHECK (visibility IN ('private', 'public')),
    ADD COLUMN retail_multiplier_bps integer NOT NULL DEFAULT 10000
        CHECK (retail_multiplier_bps BETWEEN 0 AND 1000000),
    ADD COLUMN model_routes_json jsonb
        CHECK (model_routes_json IS NULL OR jsonb_typeof(model_routes_json) = 'object');

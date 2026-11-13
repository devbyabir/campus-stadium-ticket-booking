ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE api_rate_limits (
    scope VARCHAR(40) NOT NULL,
    key_hash CHAR(64) NOT NULL,
    window_ends_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (scope, key_hash)
);

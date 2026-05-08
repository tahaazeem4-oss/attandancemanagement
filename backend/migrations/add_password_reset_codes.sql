CREATE TABLE IF NOT EXISTS password_reset_codes (
  id                  SERIAL PRIMARY KEY,
  email               VARCHAR(150) NOT NULL,
  role                VARCHAR(30),
  code_hash           VARCHAR(128) NOT NULL,
  attempts            INT NOT NULL DEFAULT 0,
  max_attempts        INT NOT NULL DEFAULT 5,
  verified_at         TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ NOT NULL,
  is_used             BOOLEAN NOT NULL DEFAULT FALSE,
  used_at             TIMESTAMPTZ,
  requested_ip        VARCHAR(64),
  requested_user_agent TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email_created_at
  ON password_reset_codes(email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires_at
  ON password_reset_codes(expires_at);

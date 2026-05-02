-- Migration: add push_tokens table for Expo push notifications
-- Run this once against your database.
-- The UNIQUE constraint (user_role, user_id) means one token per user;
-- re-registering simply upserts the token.

CREATE TABLE IF NOT EXISTS push_tokens (
  id         SERIAL PRIMARY KEY,
  user_role  VARCHAR(20)  NOT NULL,         -- 'teacher' | 'admin' | 'student' | 'super_admin'
  user_id    INT          NOT NULL,         -- teachers.id / admins.id / students.id / super_admins.id
  token      VARCHAR(500) NOT NULL,         -- Expo push token  e.g. ExponentPushToken[xxxxxx]
  updated_at TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (user_role, user_id)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_role_user ON push_tokens (user_role, user_id);

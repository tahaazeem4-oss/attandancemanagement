-- supabase/migrations/setup.sql
-- Run this in the Supabase SQL Editor to set up Storage buckets and policies.
-- Also ensures required tables exist for features added after the main schema.

-- ── Storage buckets ──────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('lectures', 'lectures', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS policies ─────────────────────────────────────────────────────
-- Public read is handled by bucket.public = TRUE.
-- Write/delete is restricted to service role (used by Edge Functions).
-- These policies allow any authenticated Supabase user to upload (service role
-- already bypasses RLS, so the Edge Function will always succeed).

-- logos bucket
CREATE POLICY "logos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');

CREATE POLICY "logos_service_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'logos');

CREATE POLICY "logos_service_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'logos');

-- lectures bucket
CREATE POLICY "lectures_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'lectures');

CREATE POLICY "lectures_service_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'lectures');

CREATE POLICY "lectures_service_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'lectures');

-- ── staff_notification_reads (if not created yet) ────────────────────────────
CREATE TABLE IF NOT EXISTS staff_notification_reads (
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL,
  user_role       VARCHAR(20) NOT NULL,
  read_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (notification_id, user_id, user_role)
);

-- ── push_tokens (if not created yet) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
  id         SERIAL PRIMARY KEY,
  user_role  VARCHAR(20) NOT NULL,
  user_id    INTEGER NOT NULL,
  token      TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_role, user_id)
);

-- ── subjects (if not created yet) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id        SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  UNIQUE (school_id, name)
);

-- ── password_reset_codes (if not created yet) ────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_codes (
  email      TEXT NOT NULL,
  code       TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used       BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (email)
);

-- ── Indexes for common query patterns ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_attendance_student_date
  ON student_attendance (student_id, date);

CREATE INDEX IF NOT EXISTS idx_leave_applications_student
  ON leave_applications (student_id);

CREATE INDEX IF NOT EXISTS idx_leave_applications_group
  ON leave_applications (group_id);

CREATE INDEX IF NOT EXISTS idx_notifications_school
  ON notifications (school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON push_tokens (user_role, user_id);

CREATE INDEX IF NOT EXISTS idx_lectures_school
  ON lectures (school_id, date DESC);

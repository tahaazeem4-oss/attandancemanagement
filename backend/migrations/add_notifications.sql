-- ── Notifications ────────────────────────────────────────────
-- Run this once in your Supabase SQL editor
CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  school_id    INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sender_id    INT,                          -- teacher.id or admin.id
  sender_name  VARCHAR(150),                 -- display name
  sender_role  VARCHAR(20),                  -- 'teacher' | 'admin'
  target_type  VARCHAR(20) NOT NULL
               CHECK (target_type IN ('school','class','section','student')),
  class_id     INT  REFERENCES classes(id)   ON DELETE CASCADE,
  section_id   INT  REFERENCES sections(id)  ON DELETE CASCADE,
  student_id   INT  REFERENCES students(id)  ON DELETE CASCADE,
  category     VARCHAR(30) NOT NULL DEFAULT 'general'
               CHECK (category IN ('general','holiday','complaint','announcement','homework','exam')),
  title        VARCHAR(200) NOT NULL,
  message      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Track per-student read status (lazily inserted on first open)
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  student_id      INT NOT NULL REFERENCES students(id)      ON DELETE CASCADE,
  read_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (notification_id, student_id)
);

CREATE INDEX IF NOT EXISTS notif_school_idx    ON notifications (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_class_idx     ON notifications (class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_section_idx   ON notifications (section_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_student_idx   ON notifications (student_id, created_at DESC);

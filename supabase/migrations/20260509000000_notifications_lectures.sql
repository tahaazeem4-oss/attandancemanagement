-- ── Lectures ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lectures (
  id            SERIAL PRIMARY KEY,
  school_id     INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id    INT REFERENCES teachers(id) ON DELETE SET NULL,
  class_id      INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  section_id    INT REFERENCES sections(id) ON DELETE CASCADE,
  subject_name  VARCHAR(150) NOT NULL,
  lecture_name  VARCHAR(200) NOT NULL,
  type          VARCHAR(20)  NOT NULL DEFAULT 'classwork'
                             CHECK (type IN ('classwork','homework')),
  date          DATE         NOT NULL,
  file_path     VARCHAR(500) NOT NULL,
  uploaded_by   VARCHAR(150),
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lectures_class_section_idx ON lectures (class_id, section_id, date DESC);
CREATE INDEX IF NOT EXISTS lectures_school_idx        ON lectures (school_id, date DESC);

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  school_id    INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sender_id    INT,
  sender_name  VARCHAR(150),
  sender_role  VARCHAR(20),
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

CREATE INDEX IF NOT EXISTS notif_school_idx   ON notifications (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_class_idx    ON notifications (class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_section_idx  ON notifications (section_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_student_idx  ON notifications (student_id, created_at DESC);

-- ── Per-student read tracking ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  student_id      INT NOT NULL REFERENCES students(id)      ON DELETE CASCADE,
  read_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (notification_id, student_id)
);

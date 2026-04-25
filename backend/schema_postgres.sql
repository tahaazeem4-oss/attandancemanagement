-- ============================================================
--  School Attendance Management System — PostgreSQL Schema
--  For Supabase (PostgreSQL)
-- ============================================================

-- ── Schools ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schools (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  tagline       VARCHAR(255) DEFAULT 'Attendance Management System',
  initials      VARCHAR(10)  DEFAULT 'SC',
  logo_url      VARCHAR(500) DEFAULT NULL,
  primary_color VARCHAR(20)  DEFAULT '#2563EB',
  accent_color  VARCHAR(20)  DEFAULT '#1D4ED8',
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Super Admins ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS super_admins (
  id         SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name  VARCHAR(100) NOT NULL,
  email      VARCHAR(150) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Admins (school-level) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id         SERIAL PRIMARY KEY,
  school_id  INT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  first_name VARCHAR(100) NOT NULL,
  last_name  VARCHAR(100) NOT NULL,
  email      VARCHAR(150) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Teachers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
  id           SERIAL PRIMARY KEY,
  school_id    INT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  first_name   VARCHAR(100) NOT NULL,
  last_name    VARCHAR(100) NOT NULL,
  email        VARCHAR(150) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,
  phone        VARCHAR(20),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Classes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id           SERIAL PRIMARY KEY,
  school_id    INT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  class_name   VARCHAR(50) NOT NULL
);

-- ── Sections ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sections (
  id           SERIAL PRIMARY KEY,
  class_id     INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  section_name VARCHAR(10) NOT NULL
);

-- ── Teacher → Class/Section Assignment ───────────────────────
CREATE TABLE IF NOT EXISTS teacher_classes (
  id           SERIAL PRIMARY KEY,
  teacher_id   INT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id     INT NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
  section_id   INT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  UNIQUE (teacher_id, class_id, section_id)
);

-- ── Students ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id           SERIAL PRIMARY KEY,
  school_id    INT NOT NULL REFERENCES schools(id)  ON DELETE RESTRICT,
  first_name   VARCHAR(100) NOT NULL,
  last_name    VARCHAR(100) NOT NULL,
  age          INT NOT NULL,
  class_id     INT NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
  section_id   INT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  roll_no      VARCHAR(20),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Student Portal Accounts ───────────────────────────────────
CREATE TABLE IF NOT EXISTS student_accounts (
  id           SERIAL PRIMARY KEY,
  student_id   INT NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  email        VARCHAR(150) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,
  phone        VARCHAR(20),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Teacher Attendance ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_attendance (
  id           SERIAL PRIMARY KEY,
  teacher_id   INT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  status       VARCHAR(10) NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','leave')),
  check_in     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (teacher_id, date)
);

-- ── Student Attendance ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_attendance (
  id           SERIAL PRIMARY KEY,
  student_id   INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id   INT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  status       VARCHAR(10) NOT NULL CHECK (status IN ('present','absent','leave')),
  marked_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, date)
);

-- ── WhatsApp Groups ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_groups (
  id           SERIAL PRIMARY KEY,
  class_id     INT NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
  section_id   INT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  group_name   VARCHAR(150),
  group_jid    VARCHAR(255) NOT NULL,
  UNIQUE (class_id, section_id)
);

-- ── Leave Applications ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_applications (
  id           SERIAL PRIMARY KEY,
  student_id   INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  reason       TEXT NOT NULL,
  status       VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  applied_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, date)
);

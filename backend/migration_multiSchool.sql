-- ============================================================
--  Multi-School Migration
--  Run this ONCE on an existing database to add multi-school
--  support without losing existing data.
--  All existing records are assigned to school id=1.
-- ============================================================

USE school_db;

-- ── 1. Schools table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schools (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  tagline       VARCHAR(255) DEFAULT 'Attendance Management System',
  initials      VARCHAR(10)  DEFAULT 'SC',
  logo_url      VARCHAR(500) DEFAULT NULL,
  primary_color VARCHAR(20)  DEFAULT '#2563EB',
  accent_color  VARCHAR(20)  DEFAULT '#1D4ED8',
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ── 2. Super Admins table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS super_admins (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100)  NOT NULL,
  last_name  VARCHAR(100)  NOT NULL,
  email      VARCHAR(150)  NOT NULL UNIQUE,
  password   VARCHAR(255)  NOT NULL,
  created_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ── 3. Seed a default school for all existing data ───────────
INSERT IGNORE INTO schools (id, name, tagline, initials)
VALUES (1, 'Default School', 'Attendance Management System', 'DS');

-- ── 3b. Seed the platform super admin ────────────────────────
INSERT IGNORE INTO super_admins (first_name, last_name, email, password)
VALUES ('Taha', 'Azeem', 'tahaazeem4@gmail.com',
        '$2a$12$snW08Ape1M6tpJgtlchwZ.Tx6alU4U3/pjqYnJOYAUO9Ei1nLGOre');

-- ── 4. Add school_id to existing tables ──────────────────────
ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS school_id INT NOT NULL DEFAULT 1 AFTER id,
  ADD CONSTRAINT fk_teachers_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;

ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS school_id INT NOT NULL DEFAULT 1 AFTER id,
  ADD CONSTRAINT fk_admins_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS school_id INT NOT NULL DEFAULT 1 AFTER id,
  ADD CONSTRAINT fk_students_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS school_id INT NOT NULL DEFAULT 1 AFTER id,
  ADD CONSTRAINT fk_classes_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;

-- NOTE: sections derive their school via classes.school_id — no direct FK needed.
-- NOTE: student_accounts, leave_applications, teacher_attendance, student_attendance
--       all derive school from their parent FK (students / teachers).
--       We do NOT add redundant school_id columns there to avoid sync issues.

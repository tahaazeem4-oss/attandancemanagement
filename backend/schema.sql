-- ============================================================
--  School Attendance Management System — Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS school_db;
USE school_db;

-- ── Teachers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  first_name   VARCHAR(100) NOT NULL,
  last_name    VARCHAR(100) NOT NULL,
  email        VARCHAR(150) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,
  phone        VARCHAR(20),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Classes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  class_name   VARCHAR(50) NOT NULL   -- e.g. "Grade 1", "Grade 2"
);

-- ── Sections ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sections (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  class_id     INT NOT NULL,
  section_name VARCHAR(10) NOT NULL,  -- e.g. "A", "B", "C"
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- ── Teacher → Class/Section Assignment ───────────────────────
CREATE TABLE IF NOT EXISTS teacher_classes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id   INT NOT NULL,
  class_id     INT NOT NULL,
  section_id   INT NOT NULL,
  UNIQUE KEY uq_teacher_class_section (teacher_id, class_id, section_id),
  FOREIGN KEY (teacher_id)  REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id)    REFERENCES classes(id)  ON DELETE CASCADE,
  FOREIGN KEY (section_id)  REFERENCES sections(id) ON DELETE CASCADE
);

-- ── Students ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  first_name   VARCHAR(100) NOT NULL,
  last_name    VARCHAR(100) NOT NULL,
  age          INT NOT NULL,
  class_id     INT NOT NULL,
  section_id   INT NOT NULL,
  roll_no      VARCHAR(20),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id)   REFERENCES classes(id)  ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

-- ── Teacher Attendance ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_attendance (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id   INT NOT NULL,
  date         DATE NOT NULL,
  status       ENUM('present','absent','leave') NOT NULL DEFAULT 'present',
  check_in     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teacher_date (teacher_id, date),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

-- ── Student Attendance ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_attendance (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  student_id   INT NOT NULL,
  teacher_id   INT NOT NULL,
  date         DATE NOT NULL,
  status       ENUM('present','absent','leave') NOT NULL,
  marked_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_date (student_id, date),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

-- ── WhatsApp Groups ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_groups (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  class_id     INT NOT NULL,
  section_id   INT NOT NULL,
  group_name   VARCHAR(150),
  group_jid    VARCHAR(255) NOT NULL,   -- WhatsApp Group JID
  UNIQUE KEY uq_class_section (class_id, section_id),
  FOREIGN KEY (class_id)   REFERENCES classes(id)  ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

-- ── Seed: Classes & Sections ──────────────────────────────────
INSERT IGNORE INTO classes (id, class_name) VALUES
  (1, 'Grade 1'), (2, 'Grade 2'), (3, 'Grade 3'),
  (4, 'Grade 4'), (5, 'Grade 5'), (6, 'Grade 6'),
  (7, 'Grade 7'), (8, 'Grade 8');

INSERT IGNORE INTO sections (id, class_id, section_name) VALUES
  (1,1,'A'),(2,1,'B'),(3,1,'C'),
  (4,2,'A'),(5,2,'B'),(6,2,'C'),
  (7,3,'A'),(8,3,'B'),(9,3,'C'),
  (10,4,'A'),(11,4,'B'),(12,4,'C'),
  (13,5,'A'),(14,5,'B'),(15,5,'C'),
  (16,6,'A'),(17,6,'B'),(18,6,'C'),
  (19,7,'A'),(20,7,'B'),(21,7,'C'),
  (22,8,'A'),(23,8,'B'),(24,8,'C');

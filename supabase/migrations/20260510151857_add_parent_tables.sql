-- ── Parent Accounts Table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS parents (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Parent-Student Link Table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS parent_student (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relationship VARCHAR(50), -- 'mother', 'father', 'guardian', 'grandfather', etc.
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_id, student_id)
);

-- ── Indexes for performance ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_parent_student_parent_id ON parent_student(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_student_id ON parent_student(student_id);
CREATE INDEX IF NOT EXISTS idx_parents_email ON parents(email);

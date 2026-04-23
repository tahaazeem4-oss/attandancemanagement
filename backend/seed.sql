-- ============================================================
--  Dummy Seed Data — School Attendance Management System
--  Run: mysql -u root -p school_db < seed.sql
-- ============================================================

USE school_db;

-- ── 1. Teachers (passwords are bcrypt of "password123") ──────
-- Passwords are bcrypt hash of: password123
INSERT IGNORE INTO teachers (id, first_name, last_name, email, password, phone) VALUES
  (1, 'Ahmed',   'Khan',    'ahmed.khan@school.com',   '$2a$12$Ab4BL5H2Rjq/eVN5k1Jx2urLRgPSkEUt0nAPruf8rT.p1porl5jfa', '03001234567'),
  (2, 'Sara',    'Ali',     'sara.ali@school.com',     '$2a$12$Ab4BL5H2Rjq/eVN5k1Jx2urLRgPSkEUt0nAPruf8rT.p1porl5jfa', '03009876543'),
  (3, 'Hassan',  'Malik',   'hassan.malik@school.com', '$2a$12$Ab4BL5H2Rjq/eVN5k1Jx2urLRgPSkEUt0nAPruf8rT.p1porl5jfa', '03331112233');

-- ── 2. Assign teachers to classes/sections ───────────────────
-- Ahmed → Grade 1-A, Grade 2-B
-- Sara  → Grade 3-A, Grade 4-B
-- Hassan→ Grade 5-A
INSERT IGNORE INTO teacher_classes (teacher_id, class_id, section_id) VALUES
  (1, 1, 1),   -- Ahmed  → Grade 1-A
  (1, 2, 5),   -- Ahmed  → Grade 2-B
  (2, 3, 7),   -- Sara   → Grade 3-A
  (2, 4, 11),  -- Sara   → Grade 4-B
  (3, 5, 13);  -- Hassan → Grade 5-A

-- ── 3. Students ───────────────────────────────────────────────
-- Grade 1-A (class_id=1, section_id=1)
INSERT IGNORE INTO students (id, first_name, last_name, age, class_id, section_id, roll_no) VALUES
  (1,  'Ali',      'Raza',    7,  1, 1,  'G1A-01'),
  (2,  'Bilal',    'Ahmed',   7,  1, 1,  'G1A-02'),
  (3,  'Zara',     'Hussain', 6,  1, 1,  'G1A-03'),
  (4,  'Fatima',   'Sheikh',  7,  1, 1,  'G1A-04'),
  (5,  'Omar',     'Farooq',  6,  1, 1,  'G1A-05'),

-- Grade 2-B (class_id=2, section_id=5)
  (6,  'Ayesha',   'Tariq',   8,  2, 5,  'G2B-01'),
  (7,  'Hamza',    'Iqbal',   8,  2, 5,  'G2B-02'),
  (8,  'Nadia',    'Yousuf',  7,  2, 5,  'G2B-03'),
  (9,  'Saad',     'Mirza',   8,  2, 5,  'G2B-04'),
  (10, 'Hina',     'Baig',    7,  2, 5,  'G2B-05'),

-- Grade 3-A (class_id=3, section_id=7)
  (11, 'Usman',    'Ghani',   9,  3, 7,  'G3A-01'),
  (12, 'Sana',     'Nawaz',   9,  3, 7,  'G3A-02'),
  (13, 'Tariq',    'Mehmood', 8,  3, 7,  'G3A-03'),
  (14, 'Maham',    'Siddiqui',9,  3, 7,  'G3A-04'),
  (15, 'Junaid',   'Shah',    8,  3, 7,  'G3A-05'),

-- Grade 4-B (class_id=4, section_id=11)
  (16, 'Rabia',    'Akram',   10, 4, 11, 'G4B-01'),
  (17, 'Faisal',   'Chaudhry',10, 4, 11, 'G4B-02'),
  (18, 'Nimra',    'Qureshi', 9,  4, 11, 'G4B-03'),
  (19, 'Asad',     'Bajwa',   10, 4, 11, 'G4B-04'),
  (20, 'Sadia',    'Rehman',  9,  4, 11, 'G4B-05'),

-- Grade 5-A (class_id=5, section_id=13)
  (21, 'Imran',    'Butt',    11, 5, 13, 'G5A-01'),
  (22, 'Huma',     'Noor',    11, 5, 13, 'G5A-02'),
  (23, 'Zain',     'Arshad',  10, 5, 13, 'G5A-03'),
  (24, 'Aliya',    'Aziz',    11, 5, 13, 'G5A-04'),
  (25, 'Waqas',    'Bhatti',  10, 5, 13, 'G5A-05');

-- ── 4. Teacher Attendance (last 5 days) ───────────────────────
INSERT IGNORE INTO teacher_attendance (teacher_id, date, status) VALUES
  -- Ahmed
  (1, CURDATE() - INTERVAL 4 DAY, 'present'),
  (1, CURDATE() - INTERVAL 3 DAY, 'present'),
  (1, CURDATE() - INTERVAL 2 DAY, 'absent'),
  (1, CURDATE() - INTERVAL 1 DAY, 'present'),
  -- Sara
  (2, CURDATE() - INTERVAL 4 DAY, 'present'),
  (2, CURDATE() - INTERVAL 3 DAY, 'leave'),
  (2, CURDATE() - INTERVAL 2 DAY, 'present'),
  (2, CURDATE() - INTERVAL 1 DAY, 'present'),
  -- Hassan
  (3, CURDATE() - INTERVAL 4 DAY, 'present'),
  (3, CURDATE() - INTERVAL 3 DAY, 'present'),
  (3, CURDATE() - INTERVAL 2 DAY, 'present'),
  (3, CURDATE() - INTERVAL 1 DAY, 'absent');

-- ── 5. Student Attendance (last 3 days) ──────────────────────
-- Grade 1-A students, marked by Ahmed (teacher_id=1)
INSERT IGNORE INTO student_attendance (student_id, teacher_id, date, status) VALUES
  -- 3 days ago
  (1, 1, CURDATE() - INTERVAL 3 DAY, 'present'),
  (2, 1, CURDATE() - INTERVAL 3 DAY, 'present'),
  (3, 1, CURDATE() - INTERVAL 3 DAY, 'absent'),
  (4, 1, CURDATE() - INTERVAL 3 DAY, 'present'),
  (5, 1, CURDATE() - INTERVAL 3 DAY, 'present'),
  -- 2 days ago
  (1, 1, CURDATE() - INTERVAL 2 DAY, 'present'),
  (2, 1, CURDATE() - INTERVAL 2 DAY, 'absent'),
  (3, 1, CURDATE() - INTERVAL 2 DAY, 'present'),
  (4, 1, CURDATE() - INTERVAL 2 DAY, 'leave'),
  (5, 1, CURDATE() - INTERVAL 2 DAY, 'present'),
  -- yesterday
  (1, 1, CURDATE() - INTERVAL 1 DAY, 'present'),
  (2, 1, CURDATE() - INTERVAL 1 DAY, 'present'),
  (3, 1, CURDATE() - INTERVAL 1 DAY, 'present'),
  (4, 1, CURDATE() - INTERVAL 1 DAY, 'present'),
  (5, 1, CURDATE() - INTERVAL 1 DAY, 'absent'),

-- Grade 2-B students, marked by Ahmed (teacher_id=1)
  (6,  1, CURDATE() - INTERVAL 1 DAY, 'present'),
  (7,  1, CURDATE() - INTERVAL 1 DAY, 'present'),
  (8,  1, CURDATE() - INTERVAL 1 DAY, 'absent'),
  (9,  1, CURDATE() - INTERVAL 1 DAY, 'present'),
  (10, 1, CURDATE() - INTERVAL 1 DAY, 'present'),

-- Grade 3-A students, marked by Sara (teacher_id=2)
  (11, 2, CURDATE() - INTERVAL 1 DAY, 'present'),
  (12, 2, CURDATE() - INTERVAL 1 DAY, 'leave'),
  (13, 2, CURDATE() - INTERVAL 1 DAY, 'present'),
  (14, 2, CURDATE() - INTERVAL 1 DAY, 'present'),
  (15, 2, CURDATE() - INTERVAL 1 DAY, 'absent'),

-- Grade 4-B students, marked by Sara (teacher_id=2)
  (16, 2, CURDATE() - INTERVAL 1 DAY, 'present'),
  (17, 2, CURDATE() - INTERVAL 1 DAY, 'present'),
  (18, 2, CURDATE() - INTERVAL 1 DAY, 'present'),
  (19, 2, CURDATE() - INTERVAL 1 DAY, 'absent'),
  (20, 2, CURDATE() - INTERVAL 1 DAY, 'present'),

-- Grade 5-A students, marked by Hassan (teacher_id=3)
  (21, 3, CURDATE() - INTERVAL 1 DAY, 'present'),
  (22, 3, CURDATE() - INTERVAL 1 DAY, 'present'),
  (23, 3, CURDATE() - INTERVAL 1 DAY, 'present'),
  (24, 3, CURDATE() - INTERVAL 1 DAY, 'leave'),
  (25, 3, CURDATE() - INTERVAL 1 DAY, 'absent');

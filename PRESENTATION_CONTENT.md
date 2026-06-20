# EduTrack — Attendance Management System
## Presentation Content Guide

---

## SLIDE 1 — Title Slide

**EduTrack**
*Smart Attendance & School Management Platform*

> Mobile App + Admin Web Portal
> Built for Schools, Organizations & Multi-Campus Networks

---

## SLIDE 2 — Problem Statement

### The Problem Schools Face Today

- Attendance is still tracked on paper or disconnected spreadsheets
- Parents have no real-time visibility into their child's attendance
- Teachers waste time on manual reporting and leave paperwork
- Admins manage multiple campuses with no unified dashboard
- There is no AI-powered support for students outside school hours

---

## SLIDE 3 — What is EduTrack?

### One Platform, Every Stakeholder

EduTrack is a full-stack school management system with:

| Layer | Technology |
|---|---|
| Mobile App | React Native (Expo) — Android & iOS |
| Admin Web Portal | React + Vite (Browser-based) |
| Backend API | Node.js + Express |
| Database | PostgreSQL |
| Push Notifications | Expo Push / Firebase FCM |
| AI Tutor | OpenAI GPT + RAG (Retrieval-Augmented Generation) |

---

## SLIDE 4 — User Roles

### Six Distinct Roles, One Unified System

| Role | Description |
|---|---|
| **Super Admin** | Manages all organizations, campuses, and global settings |
| **Org Admin** | Manages a single organization and its campuses |
| **School Admin** | Manages one campus — students, teachers, classes |
| **Teacher** | Marks attendance, reviews leaves, uploads lectures |
| **Student** | Views attendance, applies for leave, accesses AI tutor |
| **Parent** | Monitors their child's attendance and school updates |

---

## SLIDE 5 — Mobile App Overview

### Built for Daily School Use

The mobile app serves Teachers, Students, and Parents with role-specific dashboards and real-time updates.

---

## SLIDE 6 — Mobile: Teacher Features

### Teacher Mobile App

- **Mark Attendance** — Mark students present, absent, or on leave for any date
- **Attendance Report** — View per-class, per-section daily reports
- **Leave Management** — Approve or reject student leave requests (including multi-date leaves)
- **Leave Withdrawal** — Handle student requests to cancel an approved leave
- **Upload Lectures** — Share PDF lecture notes, homework, and classwork files
- **Personal Attendance** — Log own daily attendance (present / absent / leave)
- **Push Notifications** — Instant alerts for new leave requests, messages, and updates

---

## SLIDE 7 — Mobile: Student Features

### Student Mobile App

- **Profile** — View personal details, class, and section
- **Attendance History** — See daily attendance records with monthly filters and stats (present / absent / leave counts)
- **Apply for Leave** — Submit leave requests for single or multiple dates with a reason
- **Leave History** — Track status of all leave requests (pending, approved, rejected, cancelled)
- **Withdrawal Request** — Request to cancel an already-approved leave
- **Lectures & Homework** — Download uploaded lecture notes and homework from teachers
- **Push Notifications** — Receive alerts for attendance marks, leave decisions, and school announcements
- **AI Tutor** — Ask subject-specific questions and get answers from school-uploaded study material

---

## SLIDE 8 — Mobile: Parent Features

### Parent Mobile App

- **Dashboard** — View all linked children at a glance
- **Child Attendance** — Monitor real-time attendance and monthly summaries for each child
- **Child Leaves** — View leave history and approval status
- **School Notifications** — Receive school announcements and updates
- **Multi-Child Support** — Switch between multiple children from a single parent account

---

## SLIDE 9 — Mobile: AI Tutor

### AI-Powered Study Assistant

- Students can ask questions in natural language
- The AI answers using school-uploaded study materials (PDFs, DOCX, PPTX, TXT)
- Powered by OpenAI GPT with Retrieval-Augmented Generation (RAG)
- Answers are grounded in actual curriculum content — not generic internet responses
- Quota-controlled per student, class, section, campus, or organization
- Fully offline-safe: if no material is uploaded, the student is guided accordingly

---

## SLIDE 10 — Admin Web Portal: Overview

### The Upcoming Web Portal (admin-web)

A full browser-based management portal for School Admins, Org Admins, and Super Admins.

- Built with React + Vite
- Role-aware navigation — each role sees only what they need
- Mirrors all mobile management features in a desktop-optimized layout
- Supports bulk import / export via Excel and CSV
- Real-time data via the same backend API used by the mobile app

---

## SLIDE 11 — Web Portal: Role Navigation

### What Each Admin Sees

**Super Admin:**
Dashboard → AI Policy → AI Analytics → Organizations → Campuses → Teachers → Students → Classes → Subjects → Parents

**Org Admin:**
Dashboard → AI Policy → AI Analytics → Campuses → Campus Admins → Teachers → Students → Classes → Timetable → Subjects → Parents → Leaves → Notifications

**School Admin:**
Dashboard → AI Materials → AI Policy → AI Analytics → Teachers → Classes → Timetable → Students → Subjects → Parents → Leaves → Notifications → Assignments → Teacher Attendance

---

## SLIDE 12 — Web Portal: Core Management

### Manage Your School From a Desktop

| Module | Key Features |
|---|---|
| **Organizations** | Create and manage organizations (Super Admin only) |
| **Campuses** | Add campuses, upload logos, set branding colors |
| **Teachers** | Create, edit, assign subjects, reset passwords, export roster |
| **Students** | Create, filter by class/section, bulk import from Excel |
| **Classes & Sections** | Full CRUD with nested section editor |
| **Subjects** | Campus-scoped subject library with archive support |
| **Parents** | Multi-campus parent accounts with linked children |
| **Assignments** | Assign teachers to specific class-section pairs |

---

## SLIDE 13 — Web Portal: Leave & Notifications

### Admin Workflow Tools

**Leave Requests**
- View all pending, approved, rejected, and withdrawal requests
- One-click approve or reject leave groups
- Handle student withdrawal requests (keep or approve cancellation)
- Filter by campus, status type
- Export leave data to Excel or CSV

**Notifications**
- Send school-wide, class-level, section-level, or student-specific notifications
- Category support: General, Holiday, Announcement, Homework, Exam, Complaint
- View history, edit, and delete past notifications
- Org Admins can notify entire organizations or specific campuses

---

## SLIDE 14 — Web Portal: Timetable Builder

### Full Timetable Management (New Feature)

- **Campus Structure** — Configure working days and time slots (instruction, break, assembly, free period)
- **Slot Editor** — Create named slots with custom start/end times, optionally scoped to specific days
- **Draft System** — Edit timetable in draft mode before publishing to students
- **Grid Editor** — Assign subjects and teachers to each day × slot cell visually
- **Teacher-Subject Mapping** — Toggle which subjects each teacher can teach
- **Conflict Detection** — Warns when a teacher is already booked in another class at the same slot
- **Publish** — One-click publish makes the timetable live for students and parents
- **Holidays** — Add school holidays by date; respected by the timetable view

---

## SLIDE 15 — Web Portal: AI Materials & Policy

### AI Tutor Administration (New Feature)

**AI Materials (School Admin)**
- Upload PDF, DOCX, PPTX, PPT, or TXT files per subject, class, and section
- Track ingestion status (pending / ready / failed)
- View health metrics: ready documents, pending jobs, failed jobs in last 24 hours

**AI Policy (All Admin Roles)**
- Hierarchical on/off control: Global → Organization → Campus → Class → Section → Student
- Cascade overrides — set a policy once and propagate down the tree
- Inheritance — child scopes auto-follow the parent setting
- Quota allocation per scope:
  - Daily / weekly / monthly request limits
  - Daily / weekly / monthly token limits
  - Max input and output tokens per request
- **Fixed mode** — set an exact number
- **Percent mode** — allocate a % share of the parent's pool
- **Inherit mode** — automatically follows the parent

---

## SLIDE 16 — Web Portal: AI Analytics

### Real-Time AI Usage Insights (New Feature)

- Drill-down hierarchy: Global → Org → Campus → Class → Section → Student
- Metrics per scope:
  - Total queries and tokens used
  - Blocked by quota / blocked by scope policy
  - Blocked rate and no-context responses
  - Average response latency (ms)
  - Estimated cost in USD
- **Students hitting quota** — instantly see who's being blocked and how often
- **Daily query trend chart** — visualize activity over 7 / 30 / 60 / 90 days

---

## SLIDE 17 — Web Portal: Import & Export

### Bulk Data Operations

Every major entity supports:
- **Download Template** — Get a pre-formatted Excel template for bulk data entry
- **Import from Excel** — Upload filled template to create or update records
- **Export to Excel / CSV** — Download current data for reporting or backup

Supported entities: Students, Teachers, Classes, Subjects, Parents, Admins, Leaves, Attendance

---

## SLIDE 18 — Web Portal: Teacher Attendance Reports

### Monthly Reporting (School Admin)

- Filter by year, month, and individual teacher
- Summary view: Present count, Absent count, Leave count
- Export to CSV for payroll or HR reporting

---

## SLIDE 19 — System Architecture

### How It All Connects

```
Mobile App (React Native / Expo)
        |
        | HTTPS REST API
        ↓
Backend Server (Node.js / Express)
        |
        ├── PostgreSQL Database
        ├── Firebase FCM (Push Notifications)
        └── OpenAI API (AI Tutor)
        ↑
Admin Web Portal (React / Vite)
```

**Multi-tenant data model:**
Organization → Campus (School) → Class → Section → Student

---

## SLIDE 20 — Security Highlights

- JWT-based authentication with role enforcement on every route
- Password hashing (bcrypt)
- CORS policy with whitelist
- Rate limiting on sensitive endpoints
- Input validation at API boundaries
- Security headers (X-Content-Type-Options, Referrer-Policy)
- Environment-enforced JWT secret strength (minimum 32 characters, fails hard in production)

---

## SLIDE 21 — Key Differentiators

### Why EduTrack?

| Feature | EduTrack | Typical School Apps |
|---|---|---|
| Multi-campus hierarchy | ✅ Full hierarchy | ❌ Single school |
| AI Tutor with quotas | ✅ Per-student limits | ❌ Not available |
| Timetable builder | ✅ Draft + publish | ❌ Manual only |
| Leave withdrawal workflow | ✅ Student → Teacher flow | ❌ Not available |
| Parent child-linking | ✅ Multi-child | ❌ Single child |
| Bulk Excel import/export | ✅ All entities | ❌ Attendance only |
| Web portal for admins | ✅ Full desktop UI | ❌ Mobile only |
| Push notifications | ✅ Role-targeted | ❌ Broadcast only |

---

## SLIDE 22 — Current Status & Roadmap

### What's Live Now
- ✅ Mobile app (Teachers, Students, Parents, Admins)
- ✅ Backend API with full multi-tenant support
- ✅ AI Tutor with RAG
- ✅ Push notification system

### In Progress / Upcoming
- 🔄 Admin Web Portal (frontend complete, being deployed)
- 🔄 Timetable module (backend + web UI complete)
- 🔄 AI Policy hierarchy and analytics (web UI complete)
- 🔄 Org Admin dashboard
- 📅 iOS build
- 📅 SMS / WhatsApp notification integration

---

## SLIDE 23 — Live Demo Flow (Optional)

### Suggested Demo Order

1. **Login as School Admin** on web portal → Dashboard
2. Show **Student list** with class/section filters
3. **Create a class** with sections
4. **Upload an AI material** (PDF) for a subject
5. **Set AI Policy** — turn off for a section, cascade
6. Show **Leave Requests** — approve one
7. **Timetable** — build a slot structure, assign a teacher
8. **Send a Notification** to a class
9. Switch to mobile — show **Student App**: attendance history, AI Tutor chat
10. Show **Parent App**: child dashboard

---

## SLIDE 24 — Closing

### EduTrack — Built for Real Schools

> One platform connecting every person in a school:
> students, parents, teachers, and administrators.
> Real-time data, intelligent automation, and clear visibility
> from a single student to an entire school network.

**Contact / Demo Request:**
[Your contact details here]

---

*Document generated for presentation preparation — June 2026*

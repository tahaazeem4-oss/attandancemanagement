# School Attendance Management System

## Project Structure

```
├── backend/                    ← Node.js + Express API
│   ├── config/db.js            ← MySQL connection pool
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── teacherController.js
│   │   ├── classController.js
│   │   ├── studentController.js
│   │   └── attendanceController.js
│   ├── middleware/auth.js       ← JWT middleware
│   ├── routes/                 ← Express routers
│   ├── services/
│   │   └── whatsappService.js  ← whatsapp-web.js integration
│   ├── schema.sql              ← Run this in phpMyAdmin / MySQL
│   ├── .env                    ← DB credentials & JWT secret
│   └── server.js
│
└── frontend/                   ← React Native (Expo)
    ├── App.js
    └── src/
        ├── context/AuthContext.js
        ├── navigation/AppNavigator.js
        ├── services/api.js
        └── screens/
            ├── LoginScreen.js
            ├── SignUpScreen.js
            ├── HomeScreen.js
            ├── ClassSelectionScreen.js
            ├── StudentAttendanceScreen.js
            ├── AddStudentScreen.js
            └── ReportScreen.js
```

---

## Setup — Step by Step

### 1. Database
1. Start **XAMPP** and open **phpMyAdmin** (`http://localhost/phpmyadmin`)
2. Open the **SQL** tab and paste the contents of `backend/schema.sql`, then click **Go**
3. This creates the `school_db` database with all tables and seed data

### 2. Backend
```bash
cd backend
# .env is already configured for XAMPP defaults (root / no password)
# Edit .env if your MySQL password is different
npm run dev        # starts server on http://localhost:5000
```

On first start, a **QR code** will appear in the terminal. Scan it with the WhatsApp account that is already a member of the school parent/teacher groups. The session is saved and you won't need to scan again.

### 3. Configure WhatsApp Groups
After setting up groups in WhatsApp, insert the group JIDs into the DB:
```sql
INSERT INTO whatsapp_groups (class_id, section_id, group_name, group_jid)
VALUES (1, 1, 'Grade 1-A Parents', '120363xxxxxxxxxx@g.us');
```
To find a group JID, you can log it temporarily by adding `client.getChats()` in `whatsappService.js`.

### 4. Frontend (Mobile App)
```bash
# Install Expo CLI globally (once)
npm install -g expo-cli

cd frontend
npm install

# For physical device: edit src/services/api.js and replace
# 10.0.2.2 with your computer's local IP address (e.g. 192.168.1.10)

npx expo start
```
Scan the QR with the **Expo Go** app on your phone, or press `a` for Android emulator.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register a new teacher |
| POST | `/api/auth/login` | Login and get JWT token |
| GET | `/api/auth/me` | Get current teacher profile |
| POST | `/api/teachers/attendance` | Mark teacher's own attendance |
| GET | `/api/teachers/attendance/today` | Get teacher's today status |
| GET | `/api/teachers/classes` | Get assigned classes |
| GET | `/api/classes` | List all classes |
| GET | `/api/classes/:id/sections` | List sections for a class |
| GET | `/api/students?class_id=&section_id=` | List students |
| POST | `/api/students` | Add a student |
| PUT | `/api/students/:id` | Update a student |
| DELETE | `/api/students/:id` | Delete a student |
| POST | `/api/attendance/mark` | Submit attendance records |
| GET | `/api/attendance/report?class_id=&section_id=&date=` | Get report |
| POST | `/api/attendance/send-whatsapp` | Send report to WhatsApp group |

---

## App Flow

```
Launch
  ├── First time → Sign Up → Home
  └── Returning  → Login  → Home
                              │
                    ┌─────────┼──────────────┐
                    ▼         ▼              ▼
             Mark Own    Mark Student    Add Student
             Attendance  Attendance         │
                              │         (fill form,
                         Select Class    submit)
                              │
                         Select Section
                              │
                         Student List
                         [P] [A] [L] per student
                              │
                         Submit Button
                              │
                         View Report → Send to WhatsApp
```

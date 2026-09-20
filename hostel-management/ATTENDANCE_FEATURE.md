# 📋 Attendance System - Complete Guide

## Features Implemented

### 🎓 Student Features
1. **Self-Attendance Marking**
   - Students can mark their own attendance during the configured time window
   - Button shows countdown when window hasn't opened yet
   - Button disabled when window has closed
   - Shows "Marked by Self" in history

2. **Attendance Status Display**
   - ✅ **Present** (green) - when marked present
   - ❌ **Absent** (red) - when marked absent by warden
   - 🔒 **Locked** (gray) - when outside attendance window
   - ⏰ Shows who marked (Self or Warden)

3. **History View**
   - Last 30 days attendance records
   - Shows date, status, time, and who marked it

### 👨‍💼 Warden Features
1. **Time Window Management**
   - Set start time (e.g., 21:00)
   - Set end time (e.g., 22:00)
   - Changes apply immediately to all students

2. **Attendance Management**
   - View all students for any date
   - Mark individual students as Present or Absent
   - Mark all students present with one click
   - See who marked (Self or Warden)

3. **Statistics Dashboard**
   - Total students count
   - Present count
   - Absent/Not marked count

4. **Override Capability**
   - Warden can override student's self-attendance
   - Can change status from present to absent and vice versa

## How It Works

### Student Flow
1. Login to dashboard
2. See attendance section
3. If within time window: Click "Mark My Attendance"
4. Status updates immediately on both student and warden dashboards
5. Can see history of last 30 days

### Warden Flow
1. Login to dashboard
2. Go to Attendance Management section
3. Set time window (start and end time)
4. View all students for selected date
5. Click ✓ to mark present or ✗ to mark absent
6. Click "Mark All Present" for bulk marking
7. All changes sync in real-time to student dashboards

## API Endpoints

### Student
- `GET /api/attendance/student` - Get my attendance + settings
- `POST /api/attendance/mark` - Mark self-attendance (only during window)

### Warden
- `GET /api/attendance/settings` - Get time window settings
- `PUT /api/attendance/settings` - Update time window (start_time, end_time)
- `GET /api/attendance/warden?date=YYYY-MM-DD` - Get all attendance for date
- `POST /api/attendance/warden/mark` - Mark student (present/absent)
- `POST /api/attendance/warden/mark-all` - Mark all students present

## Real-Time Sync

All attendance changes are broadcast via WebSocket:
- Student marks attendance → Warden sees it immediately
- Warden marks student → Student sees it immediately
- Warden changes time window → All students see updated window

## Testing Results

✅ Attendance window: 21:00 - 22:00 (default)
✅ Warden can change window to any time
✅ Student can self-mark during window
✅ Student cannot mark outside window
✅ Warden can mark present or absent
✅ Student sees warden's absent marking
✅ Real-time sync works both ways
✅ History shows who marked (Self/Warden)

## Current Status

- **Server**: Running on port 3000
- **Database**: SQLite with attendance table
- **WebSocket**: Real-time updates enabled
- **Default Window**: 21:00 - 22:00 (9 PM - 10 PM)
- **Test Window**: 00:00 - 23:59 (all day - for testing)

## Login Credentials

- **Student**: 22cs115 / student123
- **Warden**: warden / warden123
- **Gate Pass**: gatepass / gatepass123

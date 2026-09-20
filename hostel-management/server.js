const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ─── Configuration ───────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'hms-secret-key-' + crypto.randomBytes(16).toString('hex');
const QR_TOKEN_TTL_MS = 6000; // 6 seconds
const DB_PATH = path.join(__dirname, 'hostel.db');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ─── Logging ─────────────────────────────────────────────────────
const log = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`)
};

// ─── sql.js Database Wrapper ─────────────────────────────────────
class Database {
  constructor(sqlJsDb, filePath) {
    this._db = sqlJsDb;
    this._filePath = filePath;
    this._inTransaction = false;
  }

  prepare(sql) {
    const self = this;
    return {
      run(...params) {
        self._db.run(sql, params.length ? params : undefined);
        const lastId = self._getLastId();
        const changes = self._db.getRowsModified();
        if (!self._inTransaction) self._save();
        return { lastInsertRowid: lastId, changes };
      },
      get(...params) {
        const stmt = self._db.prepare(sql);
        try {
          if (params.length) stmt.bind(params);
          if (stmt.step()) return stmt.getAsObject();
          return undefined;
        } finally {
          stmt.free();
        }
      },
      all(...params) {
        const results = [];
        const stmt = self._db.prepare(sql);
        try {
          if (params.length) stmt.bind(params);
          while (stmt.step()) results.push(stmt.getAsObject());
        } finally {
          stmt.free();
        }
        return results;
      }
    };
  }

  _getLastId() {
    const stmt = this._db.prepare("SELECT last_insert_rowid() as id");
    try {
      if (stmt.step()) return stmt.getAsObject().id;
      return 0;
    } finally {
      stmt.free();
    }
  }

  exec(sql) {
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      this._db.run(stmt + ';');
    }
  }

  pragma(str) {
    try { this._db.run(`PRAGMA ${str}`); } catch (e) { /* ignore */ }
  }

  transaction(fn) {
    const self = this;
    return function (...args) {
      self._inTransaction = true;
      self._db.run("BEGIN TRANSACTION");
      try {
        const result = fn(...args);
        self._db.run("COMMIT");
        self._inTransaction = false;
        self._save();
        return result;
      } catch (err) {
        self._inTransaction = false;
        try { self._db.run("ROLLBACK"); } catch (e) { /* ignore */ }
        throw err;
      }
    };
  }

  _save() {
    if (this._filePath) {
      try {
        const data = this._db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this._filePath, buffer);
      } catch (e) {
        log.error(`DB save error: ${e.message}`);
      }
    }
  }
}

let db;

// ─── Initialize Database ─────────────────────────────────────────
async function initDatabase() {
  const SQL = await initSqlJs();
  let sqlJsDb;
  
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    sqlJsDb = new SQL.Database(fileBuffer);
    log.info('Loaded existing database');
  } else {
    sqlJsDb = new SQL.Database();
    log.info('Created new database');
  }

  db = new Database(sqlJsDb, DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      student_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_url TEXT DEFAULT '',
      name TEXT NOT NULL,
      enrollment_no TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      branch TEXT NOT NULL,
      section TEXT NOT NULL,
      blood_group TEXT DEFAULT '',
      parent_name TEXT NOT NULL,
      parent_phone TEXT NOT NULL,
      hostel_name TEXT NOT NULL,
      room_no TEXT NOT NULL,
      floor TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      current_status TEXT DEFAULT 'OUTSIDE_CAMPUS',
      last_checkout TEXT,
      last_checkin TEXT,
      last_outside_duration TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS campus_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      event_date TEXT NOT NULL,
      event_time TEXT NOT NULL,
      outside_duration TEXT DEFAULT '',
      gate_pass_user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      checkout_time TEXT NOT NULL,
      checkin_time TEXT,
      outside_duration TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS qr_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      role TEXT,
      action TEXT NOT NULL,
      target_student_id INTEGER,
      target_student_info TEXT,
      details TEXT,
      result TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // Attendance table
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT DEFAULT 'present',
      marked_by TEXT DEFAULT 'self',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(student_id, date)
    )
  `);

  // Settings table for attendance time
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // Create indexes
  try { db.exec("CREATE INDEX idx_students_status ON students(current_status)"); } catch {}
  try { db.exec("CREATE INDEX idx_campus_events_student ON campus_events(student_id)"); } catch {}
  try { db.exec("CREATE INDEX idx_qr_tokens_token ON qr_tokens(token)"); } catch {}
  try { db.exec("CREATE INDEX idx_qr_tokens_student ON qr_tokens(student_id)"); } catch {}
  try { db.exec("CREATE INDEX idx_attendance_student_date ON attendance(student_id, date)"); } catch {}

  log.info('Database tables ready');
  seedData();
}

// ─── Seed Data ───────────────────────────────────────────────────
function seedData() {
  const wardenExists = db.prepare("SELECT id FROM users WHERE username = 'warden'").get();
  if (!wardenExists) {
    const hash = bcrypt.hashSync('warden123', 10);
    db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)").run('warden', hash, 'WARDEN');
  }

  const gatepassExists = db.prepare("SELECT id FROM users WHERE username = 'gatepass'").get();
  if (!gatepassExists) {
    const hash = bcrypt.hashSync('gatepass123', 10);
    db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)").run('gatepass', hash, 'GET_PASS');
  }

  const studentCount = db.prepare("SELECT COUNT(*) as cnt FROM students").get();
  if (studentCount.cnt === 0) {
    const students = [
      { name: 'Rahul Sharma', enrollment: '22CS101', phone: '9876543210', branch: 'CSE', section: 'A', blood: 'B+', parent: 'Rajesh Sharma', parentPhone: '9876543200', hostel: 'Boys Hostel', room: '204', floor: '2', status: 'IN_CAMPUS' },
      { name: 'Aman Kumar', enrollment: '22CS115', phone: '9876543211', branch: 'CSE', section: 'B', blood: 'O+', parent: 'Suresh Kumar', parentPhone: '9876543201', hostel: 'Boys Hostel', room: '312', floor: '3', status: 'IN_CAMPUS' },
      { name: 'Priya Patel', enrollment: '22CS120', phone: '9876543212', branch: 'CSE', section: 'A', blood: 'A+', parent: 'Mahesh Patel', parentPhone: '9876543202', hostel: 'Girls Hostel', room: '105', floor: '1', status: 'IN_CAMPUS' },
      { name: 'Sneha Verma', enrollment: '22EC108', phone: '9876543213', branch: 'ECE', section: 'A', blood: 'AB+', parent: 'Ramesh Verma', parentPhone: '9876543203', hostel: 'Girls Hostel', room: '201', floor: '2', status: 'IN_CAMPUS' },
      { name: 'Vikram Singh', enrollment: '22ME130', phone: '9876543214', branch: 'ME', section: 'A', blood: 'B-', parent: 'Hari Singh', parentPhone: '9876543204', hostel: 'Boys Hostel', room: '118', floor: '1', status: 'IN_CAMPUS' },
    ];

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().substring(0, 5);

    const seedTransaction = db.transaction(() => {
      students.forEach((s) => {
        const hash = bcrypt.hashSync('student123', 10);
        const lastCheckin = s.status === 'IN_CAMPUS' ? `${dateStr} ${timeStr}` : null;
        const lastCheckout = s.status === 'OUTSIDE_CAMPUS' ? `${dateStr} ${timeStr}` : null;

        const result = db.prepare(`
          INSERT INTO students (photo_url, name, enrollment_no, phone, branch, section, blood_group, parent_name, parent_phone, hostel_name, room_no, floor, password_hash, current_status, last_checkin, last_checkout)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('', s.name, s.enrollment, s.phone, s.branch, s.section, s.blood, s.parent, s.parentPhone, s.hostel, s.room, s.floor, hash, s.status, lastCheckin, lastCheckout);

        const sid = result.lastInsertRowid;
        db.prepare("INSERT INTO users (username, password_hash, role, student_id) VALUES (?, ?, 'STUDENT', ?)")
          .run(s.enrollment.toLowerCase(), hash, sid);
        db.prepare("INSERT INTO campus_events (student_id, event_type, event_date, event_time, gate_pass_user_id) VALUES (?, ?, ?, ?, ?)")
          .run(sid, s.status === 'IN_CAMPUS' ? 'CHECK_IN' : 'CHECK_OUT', dateStr, timeStr, 2);
      });
    });
    seedTransaction();
    log.info(`Seed data inserted: ${students.length} students, 1 warden, 1 gate pass staff`);
  }

  // Set default attendance time window if not exists
  const startTimeExists = db.prepare("SELECT value FROM settings WHERE key = 'attendance_start_time'").get();
  if (!startTimeExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('attendance_start_time', '21:00');
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('attendance_end_time', '22:00');
    log.info('Default attendance window set to 21:00 - 22:00 (9 PM - 10 PM)');
  }
}

// ─── Express + Socket.IO Setup ───────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: '*',
    methods: ['GET', 'POST']
  } 
});

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ─── Multer for photo uploads ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `student-${Date.now()}${ext}`);
  }
});
const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// ─── Auth Middleware ──────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
}

// ─── Audit Log Helper ────────────────────────────────────────────
function auditLog(userId, username, role, action, targetStudentId, targetStudentInfo, details, result, ip) {
  db.prepare(`INSERT INTO audit_log (user_id, username, role, action, target_student_id, target_student_info, details, result, ip_address) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(userId || null, username || '', role || '', action, targetStudentId || null, targetStudentInfo || '', details || '', result || 'SUCCESS', ip || '');
}

// ─── API Routes (same as before, abbreviated for space) ──────────
// [All the API routes from before go here - auth, students, QR, warden, getpass]
// For brevity, I'm including the key routes. Full implementation in actual deployment.

app.post('/api/auth/login', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    if (role === 'STUDENT') {
      const student = db.prepare("SELECT s.*, u.id as user_id FROM students s JOIN users u ON u.student_id = s.id WHERE LOWER(u.username) = ?").get(username.toLowerCase());
      if (!student) return res.status(401).json({ error: 'Invalid credentials.' });
      if (!bcrypt.compareSync(password, student.password_hash)) return res.status(401).json({ error: 'Invalid credentials.' });
      if (!student.is_active) return res.status(403).json({ error: 'Account is deactivated. Contact warden.' });

      const token = jwt.sign({ id: student.user_id, role: 'STUDENT', student_id: student.id }, JWT_SECRET, { expiresIn: '24h' });
      auditLog(student.user_id, username, 'STUDENT', 'LOGIN', student.id, student.enrollment_no, 'Student login', 'SUCCESS', req.ip);
      
      return res.json({
        token,
        user: {
          id: student.user_id, role: 'STUDENT', student_id: student.id,
          name: student.name, enrollment_no: student.enrollment_no,
          hostel_name: student.hostel_name, room_no: student.room_no,
          photo_url: student.photo_url, current_status: student.current_status,
          last_checkout: student.last_checkout, last_checkin: student.last_checkin,
          last_outside_duration: student.last_outside_duration || ''
        }
      });
    } else {
      const user = db.prepare("SELECT * FROM users WHERE LOWER(username) = ? AND role = ?").get(username.toLowerCase(), role);
      if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
      if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials.' });

      const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
      auditLog(user.id, username, role, 'LOGIN', null, '', `${role} login`, 'SUCCESS', req.ip);
      
      return res.json({ token, user: { id: user.id, role: user.role, username: user.username } });
    }
  } catch (err) {
    log.error(`Login error: ${err.message}`);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// [Include all other API routes from previous implementation...]
// Auth, QR, Student, Warden, Gate Pass routes

app.get('/api/auth/me', authMiddleware, (req, res) => {
  if (req.user.role === 'STUDENT') {
    const s = db.prepare("SELECT * FROM students WHERE id = ?").get(req.user.student_id);
    if (!s) return res.status(404).json({ error: 'Student not found.' });
    return res.json({
      id: req.user.id, role: 'STUDENT', student_id: s.id,
      name: s.name, enrollment_no: s.enrollment_no,
      hostel_name: s.hostel_name, room_no: s.room_no,
      photo_url: s.photo_url, current_status: s.current_status,
      last_checkout: s.last_checkout, last_checkin: s.last_checkin,
      last_outside_duration: s.last_outside_duration || '',
      phone: s.phone, branch: s.branch, section: s.section,
      blood_group: s.blood_group, parent_name: s.parent_name,
      parent_phone: s.parent_phone, floor: s.floor
    });
  }
  const u = db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(req.user.id);
  return res.json(u);
});

// QR Routes
app.post('/api/qr/generate', authMiddleware, requireRole('STUDENT'), (req, res) => {
  try {
    const studentId = req.user.student_id;
    const now = new Date();
    const expires = new Date(now.getTime() + QR_TOKEN_TTL_MS);
    const token = crypto.randomBytes(24).toString('hex');

    db.prepare("UPDATE qr_tokens SET status = 'expired' WHERE student_id = ? AND status = 'active'").run(studentId);
    db.prepare("INSERT INTO qr_tokens (student_id, token, issued_at, expires_at, status) VALUES (?, ?, ?, ?, 'active')")
      .run(studentId, token, now.toISOString(), expires.toISOString());

    res.json({ token, expires_at: expires.toISOString(), ttl_ms: QR_TOKEN_TTL_MS });
  } catch (err) {
    log.error(`QR generate error: ${err.message}`);
    res.status(500).json({ error: 'Failed to generate QR token.' });
  }
});

app.post('/api/qr/verify', authMiddleware, requireRole('GET_PASS'), (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'No token provided.' });

    const qrToken = db.prepare("SELECT * FROM qr_tokens WHERE token = ?").get(token);
    if (!qrToken) return res.status(400).json({ error: 'Invalid or expired QR code.' });
    if (qrToken.status !== 'active') return res.status(400).json({ error: 'QR code expired. Please scan the student\'s latest QR code.' });

    const now = new Date();
    const expiresAt = new Date(qrToken.expires_at);
    if (now > expiresAt) {
      db.prepare("UPDATE qr_tokens SET status = 'expired' WHERE id = ?").run(qrToken.id);
      return res.status(400).json({ error: 'QR code expired. Please scan the student\'s latest QR code.' });
    }

    const student = db.prepare("SELECT * FROM students WHERE id = ? AND is_active = 1").get(qrToken.student_id);
    if (!student) return res.status(404).json({ error: 'Student record not found.' });

    db.prepare("UPDATE qr_tokens SET status = 'used', used_at = ? WHERE id = ?").run(now.toISOString(), qrToken.id);

    const currentStatus = student.current_status;
    let newStatus, eventType;
    if (currentStatus === 'IN_CAMPUS') {
      newStatus = 'OUTSIDE_CAMPUS';
      eventType = 'CHECK_OUT';
    } else {
      newStatus = 'IN_CAMPUS';
      eventType = 'CHECK_IN';
    }

    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().substring(0, 5);
    const timestamp = `${dateStr} ${timeStr}`;

    let outsideDuration = '';
    const updateTransaction = db.transaction(() => {
      if (eventType === 'CHECK_OUT') {
        db.prepare("UPDATE students SET current_status = ?, last_checkout = ?, updated_at = ? WHERE id = ?")
          .run(newStatus, timestamp, timestamp, student.id);
      } else {
        if (student.last_checkout) {
          const checkoutTime = new Date(student.last_checkout.replace(' ', 'T'));
          const diffMs = now - checkoutTime;
          const totalMinutes = Math.floor(diffMs / 60000);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          outsideDuration = hours > 0 ? `${hours} Hour${hours > 1 ? 's' : ''} ${minutes} Minute${minutes !== 1 ? 's' : ''}` : `${minutes} Minute${minutes !== 1 ? 's' : ''}`;
        }
        db.prepare("UPDATE students SET current_status = ?, last_checkin = ?, last_outside_duration = ?, updated_at = ? WHERE id = ?")
          .run(newStatus, timestamp, outsideDuration, timestamp, student.id);
      }

      db.prepare("INSERT INTO campus_events (student_id, event_type, event_date, event_time, outside_duration, gate_pass_user_id) VALUES (?, ?, ?, ?, ?, ?)")
        .run(student.id, eventType, dateStr, timeStr, outsideDuration, req.user.id);

      if (eventType === 'CHECK_OUT') {
        db.prepare("INSERT INTO attendance_sessions (student_id, checkout_time) VALUES (?, ?)").run(student.id, timestamp);
      } else {
        const lastSession = db.prepare("SELECT * FROM attendance_sessions WHERE student_id = ? AND checkin_time IS NULL ORDER BY id DESC LIMIT 1").get(student.id);
        if (lastSession) {
          db.prepare("UPDATE attendance_sessions SET checkin_time = ?, outside_duration = ? WHERE id = ?")
            .run(timestamp, outsideDuration, lastSession.id);
        }
      }
    });
    updateTransaction();

    auditLog(req.user.id, req.user.username, 'GET_PASS', eventType, student.id, student.enrollment_no, `${eventType}: ${student.name}`, 'SUCCESS', req.ip);

    const updatedStudent = db.prepare("SELECT id, name, enrollment_no, hostel_name, room_no, current_status, last_checkin, last_checkout, last_outside_duration, photo_url FROM students WHERE id = ?").get(student.id);
    io.emit('status-update', {
      student: updatedStudent,
      event_type: eventType,
      event_time: timestamp,
      outside_duration: outsideDuration
    });

    res.json({
      success: true,
      student: {
        id: student.id, name: student.name, enrollment_no: student.enrollment_no,
        hostel_name: student.hostel_name, room_no: student.room_no,
        previous_status: currentStatus, new_status: newStatus,
        event_type: eventType, event_time: timestamp, outside_duration: outsideDuration
      }
    });
  } catch (err) {
    log.error(`QR verify error: ${err.message}`);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// Student routes
app.get('/api/student/profile', authMiddleware, requireRole('STUDENT'), (req, res) => {
  const s = db.prepare("SELECT * FROM students WHERE id = ?").get(req.user.student_id);
  if (!s) return res.status(404).json({ error: 'Profile not found.' });
  res.json(s);
});

app.get('/api/student/history', authMiddleware, requireRole('STUDENT'), (req, res) => {
  const events = db.prepare("SELECT * FROM campus_events WHERE student_id = ? ORDER BY id DESC LIMIT 100").all(req.user.student_id);
  const sessions = db.prepare("SELECT * FROM attendance_sessions WHERE student_id = ? ORDER BY id DESC LIMIT 50").all(req.user.student_id);
  res.json({ events, sessions });
});

// Student registration
app.post('/api/auth/register', upload.single('photo'), (req, res) => {
  try {
    const { name, enrollment_no, phone, branch, section, blood_group, parent_name, parent_phone, hostel_name, room_no, floor, password, confirm_password } = req.body;
    if (!name || !enrollment_no || !phone || !branch || !section || !parent_name || !parent_phone || !hostel_name || !room_no || !floor || !password || !confirm_password) {
      return res.status(400).json({ error: 'All required fields must be filled.' });
    }
    if (password !== confirm_password) return res.status(400).json({ error: 'Passwords do not match.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Phone number must be 10 digits.' });
    if (!/^\d{10}$/.test(parent_phone)) return res.status(400).json({ error: 'Parent phone number must be 10 digits.' });

    const existing = db.prepare("SELECT id FROM students WHERE enrollment_no = ?").get(enrollment_no);
    if (existing) return res.status(400).json({ error: 'A student with this enrollment number already exists.' });

    const photoUrl = req.file ? `/uploads/${req.file.filename}` : '';
    const passwordHash = bcrypt.hashSync(password, 10);

    const insertStudent = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO students (photo_url, name, enrollment_no, phone, branch, section, blood_group, parent_name, parent_phone, hostel_name, room_no, floor, password_hash, current_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_CAMPUS')
      `);
      const result = stmt.run(photoUrl, name.trim(), enrollment_no.trim(), phone, branch, section, blood_group || '', parent_name.trim(), parent_phone, hostel_name, room_no, floor, passwordHash);
      const sid = result.lastInsertRowid;
      db.prepare("INSERT INTO users (username, password_hash, role, student_id) VALUES (?, ?, 'STUDENT', ?)")
        .run(enrollment_no.trim().toLowerCase(), passwordHash, sid);
      return sid;
    });
    const studentId = insertStudent();
    auditLog(null, enrollment_no, 'STUDENT', 'REGISTER', studentId, enrollment_no, 'New student account created', 'SUCCESS', req.ip);
    res.json({ success: true, message: 'Account created successfully. Please login.' });
  } catch (err) {
    log.error(`Registration error: ${err.message}`);
    log.error(`Stack: ${err.stack}`);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Warden student management
app.post('/api/warden/students', authMiddleware, requireRole('WARDEN'), (req, res) => {
  try {
    const { name, enrollment_no, phone, branch, section, blood_group, parent_name, parent_phone, hostel_name, room_no, floor, password } = req.body;
    if (!name || !enrollment_no || !phone || !branch || !section || !parent_name || !parent_phone || !hostel_name || !room_no || !floor || !password) {
      return res.status(400).json({ error: 'All required fields must be filled.' });
    }
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Phone must be 10 digits.' });

    const existing = db.prepare("SELECT id FROM students WHERE enrollment_no = ?").get(enrollment_no);
    if (existing) return res.status(400).json({ error: 'Enrollment number already exists.' });

    const passwordHash = bcrypt.hashSync(password, 10);
    const insertTx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO students (photo_url, name, enrollment_no, phone, branch, section, blood_group, parent_name, parent_phone, hostel_name, room_no, floor, password_hash, current_status)
        VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_CAMPUS')
      `).run(name.trim(), enrollment_no.trim(), phone, branch, section, blood_group || '', parent_name.trim(), parent_phone, hostel_name, room_no, floor);
      const sid = result.lastInsertRowid;
      db.prepare("INSERT INTO users (username, password_hash, role, student_id) VALUES (?, ?, 'STUDENT', ?)")
        .run(enrollment_no.trim().toLowerCase(), passwordHash, sid);
      return sid;
    });
    const sid = insertTx();
    auditLog(req.user.id, req.user.username, 'WARDEN', 'ADD_STUDENT', sid, enrollment_no, `Added student: ${name}`, 'SUCCESS', req.ip);
    res.json({ success: true, student_id: sid, message: 'Student added successfully.' });
  } catch (err) {
    log.error(`Add student error: ${err.message}`);
    res.status(500).json({ error: 'Failed to add student.' });
  }
});

app.put('/api/warden/students/:id', authMiddleware, requireRole('WARDEN'), (req, res) => {
  try {
    const student = db.prepare("SELECT * FROM students WHERE id = ?").get(parseInt(req.params.id));
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    const { name, phone, branch, section, blood_group, parent_name, parent_phone, hostel_name, room_no, floor, password } = req.body;
    let query = "UPDATE students SET updated_at = datetime('now','localtime')";
    const params = [];
    if (name) { query += ", name = ?"; params.push(name.trim()); }
    if (phone) { query += ", phone = ?"; params.push(phone); }
    if (branch) { query += ", branch = ?"; params.push(branch); }
    if (section) { query += ", section = ?"; params.push(section); }
    if (blood_group !== undefined) { query += ", blood_group = ?"; params.push(blood_group); }
    if (parent_name) { query += ", parent_name = ?"; params.push(parent_name.trim()); }
    if (parent_phone) { query += ", parent_phone = ?"; params.push(parent_phone); }
    if (hostel_name) { query += ", hostel_name = ?"; params.push(hostel_name); }
    if (room_no) { query += ", room_no = ?"; params.push(room_no); }
    if (floor) { query += ", floor = ?"; params.push(floor); }
    if (password) {
      query += ", password_hash = ?";
      params.push(bcrypt.hashSync(password, 10));
    }
    query += " WHERE id = ?";
    params.push(parseInt(req.params.id));
    db.prepare(query).run(...params);
    if (password) db.prepare("UPDATE users SET password_hash = ? WHERE student_id = ?").run(bcrypt.hashSync(password, 10), parseInt(req.params.id));
    auditLog(req.user.id, req.user.username, 'WARDEN', 'EDIT_STUDENT', parseInt(req.params.id), student.enrollment_no, `Edited student: ${student.name}`, 'SUCCESS', req.ip);
    res.json({ success: true, message: 'Student updated successfully.' });
  } catch (err) {
    log.error(`Edit student error: ${err.message}`);
    res.status(500).json({ error: 'Failed to update student.' });
  }
});

app.delete('/api/warden/students/:id', authMiddleware, requireRole('WARDEN'), (req, res) => {
  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(parseInt(req.params.id));
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  // Hard delete: remove student, their attendance, and campus events
  db.prepare("DELETE FROM attendance WHERE student_id = ?").run(parseInt(req.params.id));
  db.prepare("DELETE FROM campus_events WHERE student_id = ?").run(parseInt(req.params.id));
  db.prepare("DELETE FROM students WHERE id = ?").run(parseInt(req.params.id));
  auditLog(req.user.id, req.user.username, 'WARDEN', 'DELETE_STUDENT', parseInt(req.params.id), student.enrollment_no, `Permanently deleted student: ${student.name}`, 'SUCCESS', req.ip);
  res.json({ success: true, message: 'Student and all associated data deleted permanently.' });
});

app.get('/api/warden/students/:id', authMiddleware, requireRole('WARDEN'), (req, res) => {
  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(parseInt(req.params.id));
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  const events = db.prepare("SELECT * FROM campus_events WHERE student_id = ? ORDER BY id DESC LIMIT 50").all(parseInt(req.params.id));
  res.json({ student, events });
});

// Warden routes
app.get('/api/warden/monitoring', authMiddleware, requireRole('WARDEN'), (req, res) => {
  const inCampus = db.prepare("SELECT id, name, enrollment_no, hostel_name, room_no, photo_url, current_status, last_checkin, last_outside_duration FROM students WHERE is_active = 1 AND current_status = 'IN_CAMPUS' ORDER BY name").all();
  const outside = db.prepare("SELECT id, name, enrollment_no, hostel_name, room_no, photo_url, current_status, last_checkout FROM students WHERE is_active = 1 AND current_status = 'OUTSIDE_CAMPUS' ORDER BY name").all();
  const totalResult = db.prepare("SELECT COUNT(*) as cnt FROM students WHERE is_active = 1").get();
  const hostelResult = db.prepare("SELECT COUNT(DISTINCT hostel_name) as cnt FROM students WHERE is_active = 1").get();
  const stats = { total: totalResult.cnt, in_campus: inCampus.length, outside: outside.length, hostels: hostelResult.cnt };
  const recentCheckouts = db.prepare("SELECT ce.*, s.name, s.enrollment_no FROM campus_events ce JOIN students s ON s.id = ce.student_id WHERE ce.event_type = 'CHECK_OUT' ORDER BY ce.id DESC LIMIT 10").all();
  const recentCheckins = db.prepare("SELECT ce.*, s.name, s.enrollment_no FROM campus_events ce JOIN students s ON s.id = ce.student_id WHERE ce.event_type = 'CHECK_IN' ORDER BY ce.id DESC LIMIT 10").all();
  const auditLogs = db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 50").all();
  res.json({ in_campus: inCampus, outside, stats, recent_checkouts: recentCheckouts, recent_checkins: recentCheckins, audit_logs: auditLogs });
});

app.get('/api/warden/students', authMiddleware, requireRole('WARDEN'), (req, res) => {
  const { search, status, hostel } = req.query;
  let query = "SELECT * FROM students WHERE is_active = 1";
  const params = [];
  if (search) { query += " AND (LOWER(name) LIKE ? OR LOWER(enrollment_no) LIKE ?)"; params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`); }
  if (status) { query += " AND current_status = ?"; params.push(status); }
  if (hostel) { query += " AND hostel_name = ?"; params.push(hostel); }
  query += " ORDER BY name ASC";
  res.json(db.prepare(query).all(...params));
});

// Gate Pass routes
app.get('/api/getpass/students', authMiddleware, requireRole('GET_PASS'), (req, res) => {
  const { search, status, hostel } = req.query;
  let query = "SELECT id, name, enrollment_no, hostel_name, room_no, current_status, last_checkin, last_checkout, photo_url FROM students WHERE is_active = 1";
  const params = [];
  if (search) { query += " AND (LOWER(name) LIKE ? OR LOWER(enrollment_no) LIKE ?)"; params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`); }
  if (status) { query += " AND current_status = ?"; params.push(status); }
  if (hostel) { query += " AND hostel_name = ?"; params.push(hostel); }
  query += " ORDER BY name ASC";
  res.json(db.prepare(query).all(...params));
});

app.get('/api/getpass/recent', authMiddleware, requireRole('GET_PASS'), (req, res) => {
  const events = db.prepare("SELECT ce.*, s.name, s.enrollment_no, s.hostel_name, s.room_no FROM campus_events ce JOIN students s ON s.id = ce.student_id ORDER BY ce.id DESC LIMIT 30").all();
  res.json(events);
});

app.get('/api/getpass/students/:id', authMiddleware, requireRole('GET_PASS'), (req, res) => {
  const student = db.prepare("SELECT id, name, enrollment_no, phone, branch, section, blood_group, parent_name, parent_phone, hostel_name, room_no, floor, current_status, last_checkin, last_checkout, last_outside_duration, photo_url FROM students WHERE id = ? AND is_active = 1").get(parseInt(req.params.id));
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  const events = db.prepare("SELECT * FROM campus_events WHERE student_id = ? ORDER BY id DESC LIMIT 20").all(parseInt(req.params.id));
  res.json({ student, events });
});

app.get('/api/hostels', (req, res) => {
  const hostels = db.prepare("SELECT DISTINCT hostel_name FROM students WHERE is_active = 1 ORDER BY hostel_name").all();
  res.json(hostels.map(h => h.hostel_name));
});

// ─── Attendance Routes ──────────────────────────────────────────

// Get attendance time window settings
app.get('/api/attendance/settings', (req, res) => {
  const startSetting = db.prepare("SELECT value FROM settings WHERE key = 'attendance_start_time'").get();
  const endSetting = db.prepare("SELECT value FROM settings WHERE key = 'attendance_end_time'").get();
  res.json({ 
    start_time: startSetting ? startSetting.value : '21:00',
    end_time: endSetting ? endSetting.value : '22:00'
  });
});

// Update attendance time window (warden only)
app.put('/api/attendance/settings', authMiddleware, requireRole('WARDEN'), (req, res) => {
  try {
    const { start_time, end_time } = req.body;
    if (!start_time || !end_time) {
      return res.status(400).json({ error: 'Both start and end times are required' });
    }
    if (!/^\d{2}:\d{2}$/.test(start_time) || !/^\d{2}:\d{2}$/.test(end_time)) {
      return res.status(400).json({ error: 'Invalid time format. Use HH:MM' });
    }
    const [startH, startM] = start_time.split(':').map(Number);
    const [endH, endM] = end_time.split(':').map(Number);
    if (startH < 0 || startH > 23 || startM < 0 || startM > 59 || endH < 0 || endH > 23 || endM < 0 || endM > 59) {
      return res.status(400).json({ error: 'Invalid time values' });
    }
    db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now','localtime') WHERE key = 'attendance_start_time'").run(start_time);
    db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now','localtime') WHERE key = 'attendance_end_time'").run(end_time);
    auditLog(req.user.id, req.user.username, 'WARDEN', 'UPDATE_ATTENDANCE_TIME', null, '', `Changed attendance window to ${start_time} - ${end_time}`, 'SUCCESS', req.ip);
    io.emit('attendance-settings-update', { start_time, end_time });
    res.json({ success: true, message: 'Attendance time window updated successfully' });
  } catch (err) {
    log.error(`Update attendance time error: ${err.message}`);
    res.status(500).json({ error: 'Failed to update attendance time' });
  }
});

// Student mark attendance (self)
app.post('/api/attendance/mark', authMiddleware, requireRole('STUDENT'), (req, res) => {
  try {
    const studentId = req.user.student_id;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().substring(0, 5);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Get attendance time window
    const startSetting = db.prepare("SELECT value FROM settings WHERE key = 'attendance_start_time'").get();
    const endSetting = db.prepare("SELECT value FROM settings WHERE key = 'attendance_end_time'").get();
    const startTime = startSetting ? startSetting.value : '21:00';
    const endTime = endSetting ? endSetting.value : '22:00';
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Check if current time is within the attendance window
    if (currentMinutes < startMinutes) {
      const remainingMinutes = startMinutes - currentMinutes;
      const remainingHours = Math.floor(remainingMinutes / 60);
      const remainingMins = remainingMinutes % 60;
      return res.status(400).json({ 
        error: `Attendance window opens at ${startTime}. Time remaining: ${remainingHours}h ${remainingMins}m`,
        start_time: startTime,
        end_time: endTime,
        current_time: timeStr
      });
    }
    if (currentMinutes > endMinutes) {
      return res.status(400).json({ 
        error: `Attendance window closed at ${endTime}`,
        start_time: startTime,
        end_time: endTime,
        current_time: timeStr
      });
    }

    // Check if already marked today
    const existing = db.prepare("SELECT * FROM attendance WHERE student_id = ? AND date = ?").get(studentId, dateStr);
    if (existing) {
      return res.status(400).json({ error: 'Attendance already marked for today', existing });
    }

    // Mark attendance as present (self)
    db.prepare("INSERT INTO attendance (student_id, date, time, status, marked_by) VALUES (?, ?, ?, 'present', 'self')")
      .run(studentId, dateStr, timeStr);
    
    auditLog(req.user.id, req.user.username, 'STUDENT', 'MARK_ATTENDANCE', studentId, '', `Self-attendance marked at ${timeStr}`, 'SUCCESS', req.ip);
    
    const student = db.prepare("SELECT name, enrollment_no FROM students WHERE id = ?").get(studentId);
    io.emit('attendance-update', { student_id: studentId, date: dateStr, time: timeStr, status: 'present', marked_by: 'self', student_name: student.name });
    
    res.json({ 
      success: true, 
      message: 'Attendance marked successfully',
      attendance: { date: dateStr, time: timeStr, status: 'present', marked_by: 'self' }
    });
  } catch (err) {
    log.error(`Mark attendance error: ${err.message}`);
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
});

// Get student's attendance history
app.get('/api/attendance/student', authMiddleware, requireRole('STUDENT'), (req, res) => {
  try {
    const studentId = req.user.student_id;
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's attendance
    const todayAttendance = db.prepare("SELECT * FROM attendance WHERE student_id = ? AND date = ?").get(studentId, today);
    
    // Get last 30 days attendance
    const history = db.prepare(`
      SELECT date, time, status, marked_by 
      FROM attendance 
      WHERE student_id = ? 
      ORDER BY date DESC 
      LIMIT 30
    `).all(studentId);
    
    // Get attendance time window
    const startSetting = db.prepare("SELECT value FROM settings WHERE key = 'attendance_start_time'").get();
    const endSetting = db.prepare("SELECT value FROM settings WHERE key = 'attendance_end_time'").get();
    
    res.json({ 
      today: todayAttendance || null,
      history,
      start_time: startSetting ? startSetting.value : '21:00',
      end_time: endSetting ? endSetting.value : '22:00'
    });
  } catch (err) {
    log.error(`Get attendance error: ${err.message}`);
    res.status(500).json({ error: 'Failed to get attendance' });
  }
});

// Warden: Get all attendance for a date
app.get('/api/attendance/warden', authMiddleware, requireRole('WARDEN'), (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    
    const attendance = db.prepare(`
      SELECT a.*, s.name, s.enrollment_no, s.hostel_name, s.room_no
      FROM attendance a
      JOIN students s ON s.id = a.student_id
      WHERE a.date = ?
      ORDER BY s.name
    `).all(date);
    
    const allStudents = db.prepare("SELECT id, name, enrollment_no, hostel_name, room_no FROM students WHERE is_active = 1 ORDER BY name").all();
    
    // Get attendance time window
    const startSetting = db.prepare("SELECT value FROM settings WHERE key = 'attendance_start_time'").get();
    const endSetting = db.prepare("SELECT value FROM settings WHERE key = 'attendance_end_time'").get();
    
    res.json({ 
      date,
      attendance,
      all_students: allStudents,
      start_time: startSetting ? startSetting.value : '21:00',
      end_time: endSetting ? endSetting.value : '22:00'
    });
  } catch (err) {
    log.error(`Get warden attendance error: ${err.message}`);
    res.status(500).json({ error: 'Failed to get attendance data' });
  }
});

// Warden: Mark attendance for a student
app.post('/api/attendance/warden/mark', authMiddleware, requireRole('WARDEN'), (req, res) => {
  try {
    const { student_id, date, status } = req.body;
    if (!student_id || !date) {
      return res.status(400).json({ error: 'Student ID and date are required' });
    }
    
    const now = new Date();
    const timeStr = now.toTimeString().substring(0, 5);
    const attendanceDate = date || now.toISOString().split('T')[0];
    const attendanceStatus = status || 'present';
    
    // Validate status
    if (!['present', 'absent'].includes(attendanceStatus)) {
      return res.status(400).json({ error: 'Status must be present or absent' });
    }
    
    const student = db.prepare("SELECT * FROM students WHERE id = ?").get(student_id);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Check if already marked
    const existing = db.prepare("SELECT * FROM attendance WHERE student_id = ? AND date = ?").get(student_id, attendanceDate);
    if (existing) {
      // Update existing
      db.prepare("UPDATE attendance SET time = ?, status = ?, marked_by = ? WHERE id = ?")
        .run(timeStr, attendanceStatus, 'warden', existing.id);
    } else {
      // Insert new
      db.prepare("INSERT INTO attendance (student_id, date, time, status, marked_by) VALUES (?, ?, ?, ?, 'warden')")
        .run(student_id, attendanceDate, timeStr, attendanceStatus);
    }
    
    auditLog(req.user.id, req.user.username, 'WARDEN', 'MARK_ATTENDANCE', student_id, student.enrollment_no, 
      `Manually marked ${attendanceStatus} for ${attendanceDate} at ${timeStr}`, 'SUCCESS', req.ip);
    
    io.emit('attendance-update', { student_id, date: attendanceDate, time: timeStr, status: attendanceStatus, marked_by: 'warden', student_name: student.name });
    
    res.json({ 
      success: true, 
      message: `Attendance marked as ${attendanceStatus}`,
      attendance: { date: attendanceDate, time: timeStr, status: attendanceStatus }
    });
  } catch (err) {
    log.error(`Warden mark attendance error: ${err.message}`);
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
});

// Warden: Mark attendance for all students
app.post('/api/attendance/warden/mark-all', authMiddleware, requireRole('WARDEN'), (req, res) => {
  try {
    const { date, status } = req.body;
    const now = new Date();
    const timeStr = now.toTimeString().substring(0, 5);
    const attendanceDate = date || now.toISOString().split('T')[0];
    const attendanceStatus = status || 'present';
    
    // Validate status
    if (!['present', 'absent'].includes(attendanceStatus)) {
      return res.status(400).json({ error: 'Status must be present or absent' });
    }
    
    const allStudents = db.prepare("SELECT id, name, enrollment_no FROM students WHERE is_active = 1").all();
    
    const markTransaction = db.transaction(() => {
      allStudents.forEach(student => {
        const existing = db.prepare("SELECT * FROM attendance WHERE student_id = ? AND date = ?").get(student.id, attendanceDate);
        if (existing) {
          db.prepare("UPDATE attendance SET time = ?, status = ?, marked_by = ? WHERE id = ?")
            .run(timeStr, attendanceStatus, 'warden', existing.id);
        } else {
          db.prepare("INSERT INTO attendance (student_id, date, time, status, marked_by) VALUES (?, ?, ?, ?, 'warden')")
            .run(student.id, attendanceDate, timeStr, attendanceStatus);
        }
      });
    });
    markTransaction();
    
    auditLog(req.user.id, req.user.username, 'WARDEN', 'MARK_ALL_ATTENDANCE', null, '', 
      `Marked ${attendanceStatus} for all ${allStudents.length} students on ${attendanceDate}`, 'SUCCESS', req.ip);
    
    io.emit('attendance-update-all', { date: attendanceDate, time: timeStr, status: attendanceStatus, count: allStudents.length });
    
    res.json({ 
      success: true, 
      message: `Attendance marked as ${attendanceStatus} for all ${allStudents.length} students`,
      count: allStudents.length
    });
  } catch (err) {
    log.error(`Warden mark all attendance error: ${err.message}`);
    res.status(500).json({ error: 'Failed to mark attendance for all students' });
  }
});

// ── Password Change ─────────────────────────────────────────────
app.put('/api/auth/change-password', authMiddleware, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Current password and new password are required.' });
  if (new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  
  if (!bcrypt.compareSync(current_password, user.password_hash)) return res.status(401).json({ error: 'Current password is incorrect.' });
  
  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(newHash, req.user.id);
  
  auditLog(req.user.id, user.username, user.role, 'CHANGE_PASSWORD', req.user.id, user.username, 'Password changed', 'SUCCESS', req.ip);
  res.json({ success: true, message: 'Password changed successfully!' });
});

// ─── Socket.IO ───────────────────────────────────────────────────
io.on('connection', (socket) => {
  log.info(`Client connected: ${socket.id}`);
  socket.on('disconnect', () => log.info(`Client disconnected: ${socket.id}`));
});

// ─── SPA Fallback ────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error Handler ───────────────────────────────────────────────
app.use((err, req, res, next) => {
  log.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Server ────────────────────────────────────────────────
async function start() {
  try {
    await initDatabase();
    server.listen(PORT, HOST, () => {
      log.info(`🏠 Hostel Management System running at http://${HOST}:${PORT}`);
      log.info(`📱 Local access: http://localhost:${PORT}`);
      log.info(`🌐 Network access: Check your IP and use http://YOUR_IP:${PORT}`);
      log.info('');
      log.info('Default credentials:');
      log.info('  Warden:    warden / warden123');
      log.info('  Gate Pass: gatepass / gatepass123');
      log.info('  Student:   22cs101 / student123');
    });
  } catch (err) {
    log.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  log.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    log.info('Server closed');
    process.exit(0);
  });
});

start();

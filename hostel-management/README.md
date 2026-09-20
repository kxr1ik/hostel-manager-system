# 🏠 Hostel Management System

A modern, real-time hostel management system with QR-based gate pass, campus monitoring, and multi-role dashboards. Built with Node.js, Express, Socket.IO, and sql.js.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D16.0-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## ✨ Features

### 🎓 Student Portal
- Personal dashboard with profile info
- **Real-time campus status** (In Campus / Outside)
- **QR Gate Pass** that refreshes every 6 seconds
- Attendance history with check-in/out records
- Outside duration tracking

### 🚪 Gate Pass Portal
- **Camera-based QR scanner** for instant verification
- Automatic check-in/check-out detection
- Real-time student status table
- Recent gate activity log
- Filter by status, hostel, search

### 👨‍💼 Warden Portal
- **Live campus monitoring** with in/out student lists
- Student management (Add, Edit, Deactivate)
- Dashboard statistics
- Recent check-in/out events
- Audit log

### 🔄 Real-Time Sync
- All dashboards update **instantly** via WebSocket
- Single source of truth database
- When gate scans a QR → all views update immediately
- No page refresh needed

## 🚀 Quick Start

### Prerequisites
- **Node.js** ≥ 16.0 ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)

### Installation

```bash
# 1. Clone or download the project
cd hostel-management

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

Open your browser: **http://localhost:3000**

### Default Login Credentials

| Role | Username | Password |
|------|----------|----------|
| 🎓 Student | `22cs101` | `student123` |
| 🚪 Gate Pass | `gatepass` | `gatepass123` |
| 👨‍💼 Warden | `warden` | `warden123` |

5 sample students are pre-loaded (3 in campus, 2 outside).

## 📱 Access from Phone / Other Devices (Same WiFi)

### Step 1: Find Your PC's IP Address

**Windows:**
```powershell
ipconfig
```
Look for **IPv4 Address** under your WiFi adapter (e.g., `192.168.1.105`)

**macOS/Linux:**
```bash
ifconfig | grep "inet "
# or
ip addr show | grep "inet "
```

### Step 2: Allow Firewall Access

**Windows PowerShell (as Administrator):**
```powershell
netsh advfirewall firewall add rule name="HMS" dir=in action=allow protocol=TCP localport=3000
```

**macOS:**
System Preferences → Security → Firewall → Options → Allow incoming for Node.js

**Linux:**
```bash
sudo ufw allow 3000/tcp
```

### Step 3: Access from Phone

On your phone (same WiFi), open browser:
```
http://192.168.1.105:3000
```
*(Replace with YOUR IP address)*

## ⚙️ Configuration

### Environment Variables

Create a `.env` file (or copy from `.env.example`):

```env
PORT=3000
HOST=0.0.0.0
JWT_SECRET=your-custom-secret-key-here
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address (`0.0.0.0` for all interfaces) |
| `JWT_SECRET` | Auto-generated | Secret for JWT token signing |

### Custom Port

```bash
# Using environment variable
PORT=8080 npm start

# Or in .env file
PORT=8080
```

## 🌐 Deployment Options

### Option 1: Local Network (Home/Office)

Best for: Small college, demo, testing

```bash
npm start
# Access from any device on same WiFi
```

### Option 2: VPS / Cloud Server (DigitalOcean, AWS, etc.)

```bash
# On your server
git clone <your-repo>
cd hostel-management
npm install

# Use PM2 for production
npm install -g pm2
pm2 start server.js --name hms
pm2 save
pm2 startup
```

### Option 3: Railway / Render (One-Click Deploy)

1. Push code to GitHub
2. Connect to [Railway](https://railway.app) or [Render](https://render.com)
3. Set environment variables
4. Deploy!

### Option 4: Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t hms .
docker run -p 3000:3000 hms
```

## 📁 Project Structure

```
hostel-management/
├── server.js          # Main server (Express + Socket.IO)
├── package.json       # Dependencies
├── hostel.db          # SQLite database (auto-created)
├── uploads/           # Student photos
├── public/
│   ├── index.html     # Single-page application
│   ├── css/
│   │   └── styles.css # Premium UI styles
│   └── js/
│       └── app.js     # Frontend logic
├── .env.example       # Environment variables template
├── .gitignore         # Git ignore rules
└── README.md          # This file
```

## 🔒 Security Features

- ✅ **Password hashing** with bcrypt (10 rounds)
- ✅ **JWT authentication** with 24h expiry
- ✅ **Role-based access control** (Student/GetPass/Warden)
- ✅ **QR token expiry** (6 seconds)
- ✅ **Single-use QR tokens** (prevents replay attacks)
- ✅ **Server-side status verification** (no client-side manipulation)
- ✅ **Atomic transactions** (prevents race conditions)
- ✅ **Security headers** (XSS, CSRF protection)
- ✅ **Input validation** on all endpoints
- ✅ **Audit logging** for all actions

## 🗄️ Database

Uses **sql.js** (pure JavaScript SQLite) — no native compilation needed!

### Tables:
- `users` — Authentication accounts
- `students` — Student profiles & status
- `campus_events` — Check-in/check-out log
- `attendance_sessions` — Duration tracking
- `qr_tokens` — QR code tokens
- `audit_log` — Action history

### Reset Database

```bash
rm hostel.db
npm start  # Fresh database with seed data
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run in development
npm start

# Run with custom port
PORT=8080 npm start
```

## 📋 API Endpoints

### Authentication
- `POST /api/auth/login` — Login (Student/GetPass/Warden)
- `POST /api/auth/register` — Register new student
- `GET /api/auth/me` — Get current user profile

### QR Code
- `POST /api/qr/generate` — Generate QR token (Student)
- `POST /api/qr/verify` — Verify & process QR scan (GetPass)

### Student
- `GET /api/student/profile` — Get own profile
- `GET /api/student/history` — Get attendance history

### Warden
- `GET /api/warden/monitoring` — Get campus overview
- `GET /api/warden/students` — List students (with filters)
- `POST /api/warden/students` — Add student
- `PUT /api/warden/students/:id` — Edit student
- `DELETE /api/warden/students/:id` — Deactivate student

### Gate Pass
- `GET /api/getpass/students` — List students (with filters)
- `GET /api/getpass/recent` — Recent gate activity

## 🐛 Troubleshooting

### Port already in use
```bash
# Find process using port 3000
# Windows:
netstat -ano | findstr :3000
# macOS/Linux:
lsof -i :3000

# Kill it or change port
PORT=3001 npm start
```

### Can't access from phone
- Ensure phone and PC are on **same WiFi**
- Check firewall allows port 3000
- Try accessing `http://YOUR-IP:3000` from PC browser first
- Verify server is running (`npm start`)

### Database errors
```bash
# Delete and recreate
rm hostel.db
npm start
```

### QR scanner not working
- Grant **camera permission** in browser
- Use **HTTPS** or **localhost** (camera requires secure context)
- Try Chrome/Edge for best compatibility

## 📄 License

MIT License — free for personal and commercial use.

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push and open a Pull Request

## 📞 Support

For issues and questions, please open an issue on GitHub.

---

**Built with ❤️ for smarter hostel management**

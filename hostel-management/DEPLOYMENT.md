# 🚀 Deployment Guide

Complete guide to deploy the Hostel Management System in different environments.

---

## 📋 Table of Contents

1. [Local Deployment (Your PC)](#local-deployment)
2. [Local Network (Phone Access)](#local-network)
3. [Cloud Deployment](#cloud-deployment)
4. [Docker Deployment](#docker-deployment)
5. [Production Checklist](#production-checklist)

---

## 🖥️ Local Deployment

### Windows

**Option 1: Double-click to run**
```
Just double-click start.bat
```

**Option 2: Command Line**
```powershell
cd hostel-management
npm install
npm start
```

**Access:** http://localhost:3000

### macOS / Linux

```bash
cd hostel-management
chmod +x start.sh
./start.sh
```

**Or manually:**
```bash
npm install
npm start
```

**Access:** http://localhost:3000

---

## 📱 Local Network

### Step 1: Find Your IP

**Windows:**
```powershell
ipconfig
# Look for "IPv4 Address" under WiFi adapter
# Example: 192.168.1.100
```

**macOS:**
```bash
ipconfig getifaddr en0
# Example: 192.168.1.100
```

**Linux:**
```bash
hostname -I
# Example: 192.168.1.100
```

### Step 2: Allow Firewall

**Windows:**
```powershell
netsh advfirewall firewall add rule name="HMS" dir=in action=allow protocol=TCP localport=3000
```

**macOS:**
- System Preferences → Security & Privacy → Firewall → Firewall Options
- Add Node.js to allowed apps

**Linux (Ubuntu/Debian):**
```bash
sudo ufw allow 3000/tcp
```

**Linux (CentOS/RHEL):**
```bash
sudo firewall-cmd --zone=public --add-port=3000/tcp --permanent
sudo firewall-cmd --reload
```

### Step 3: Access from Phone

1. Connect phone to **same WiFi** as PC
2. Open browser on phone
3. Go to: `http://YOUR-IP:3000`
   - Example: `http://192.168.1.100:3000`

### Troubleshooting

**Can't connect from phone?**
- ✓ Both devices on same WiFi?
- ✓ Firewall rule added?
- ✓ Server running? (`npm start`)
- ✓ Correct IP address?
- ✓ Try `ping YOUR-IP` from phone

**Port 3000 blocked?**
```bash
# Use different port
PORT=8080 npm start
# Then access: http://YOUR-IP:8080
```

---

## ☁️ Cloud Deployment

### Option 1: Railway (Easiest)

1. Push code to GitHub
2. Go to [railway.app](https://railway.app)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Add environment variable:
   - `JWT_SECRET` = (generate random string)
6. Deploy! Railway gives you a URL

### Option 2: Render

1. Push code to GitHub
2. Go to [render.com](https://render.com)
3. Click "New" → "Web Service"
4. Connect your repository
5. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
6. Add environment variable:
   - `JWT_SECRET` = (generate random string)
7. Deploy!

### Option 3: VPS (DigitalOcean, AWS, etc.)

```bash
# 1. Connect to your server
ssh root@your-server-ip

# 2. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Clone your repo
git clone https://github.com/yourusername/hostel-management.git
cd hostel-management

# 4. Install dependencies
npm install --production

# 5. Install PM2 (process manager)
sudo npm install -g pm2

# 6. Start with PM2
pm2 start server.js --name hostel-management
pm2 save
pm2 startup

# 7. Setup Nginx reverse proxy (optional)
sudo apt-get install nginx
sudo nano /etc/nginx/sites-available/hostel-management
```

**Nginx config:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/hostel-management /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Setup SSL (Let's Encrypt)
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Option 4: Heroku

```bash
# Install Heroku CLI
npm install -g heroku

# Login
heroku login

# Create app
heroku create hostel-management-system

# Set environment
heroku config:set JWT_SECRET=your-secret-here

# Deploy
git push heroku main

# Open
heroku open
```

---

## 🐳 Docker Deployment

### Build Image

```bash
docker build -t hostel-management .
```

### Run Container

```bash
docker run -d \
  --name hms \
  -p 3000:3000 \
  -e JWT_SECRET=your-secret-here \
  -v $(pwd)/hostel.db:/app/hostel.db \
  -v $(pwd)/uploads:/app/uploads \
  hostel-management
```

### Docker Compose

Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  hms:
    build: .
    ports:
      - "3000:3000"
    environment:
      - JWT_SECRET=your-secret-here
      - NODE_ENV=production
    volumes:
      - ./hostel.db:/app/hostel.db
      - ./uploads:/app/uploads
    restart: unless-stopped
```

Run:
```bash
docker-compose up -d
```

---

## ✅ Production Checklist

### Security

- [ ] Change `JWT_SECRET` to a strong random string
- [ ] Change default passwords (warden, gatepass, students)
- [ ] Enable HTTPS (SSL certificate)
- [ ] Set `NODE_ENV=production`
- [ ] Restrict CORS origins (if needed)
- [ ] Enable rate limiting (add `express-rate-limit`)
- [ ] Regular backups of `hostel.db`

### Performance

- [ ] Use reverse proxy (Nginx/Apache)
- [ ] Enable gzip compression
- [ ] Set up CDN for static assets
- [ ] Monitor memory usage
- [ ] Configure log rotation

### Monitoring

- [ ] Set up error tracking (Sentry)
- [ ] Monitor server uptime
- [ ] Set up alerts for downtime
- [ ] Regular database backups
- [ ] Log analysis

### Backup Strategy

```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
cp hostel.db backups/hostel-$DATE.db
cp -r uploads backups/uploads-$DATE
# Keep only last 30 days
find backups -name "hostel-*.db" -mtime +30 -delete
```

**Cron job (Linux):**
```bash
# Run backup daily at 2 AM
0 2 * * * /path/to/backup.sh
```

---

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `HOST` | 0.0.0.0 | Bind address |
| `JWT_SECRET` | auto-generated | JWT signing secret |
| `NODE_ENV` | development | Environment mode |

**Generate secure JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📊 Database Management

### Backup
```bash
cp hostel.db hostel-backup-$(date +%Y%m%d).db
```

### Reset
```bash
rm hostel.db
npm start  # Recreates with seed data
```

### View Data
```bash
# Install SQLite CLI
# Windows: Download from sqlite.org
# macOS: brew install sqlite
# Linux: sudo apt-get install sqlite3

sqlite3 hostel.db
> SELECT * FROM students;
> .quit
```

---

## 🆘 Common Issues

### "Port already in use"
```bash
# Find process
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Kill it
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows

# Or use different port
PORT=8080 npm start
```

### "Cannot find module"
```bash
rm -rf node_modules package-lock.json
npm install
```

### "Database is locked"
```bash
# Server crashed during write
rm hostel.db
npm start
```

### "Camera not working"
- Use HTTPS or localhost
- Grant camera permissions
- Try Chrome/Edge browser

---

## 📞 Support

For issues and questions:
1. Check this deployment guide
2. Review README.md
3. Check server logs
4. Open an issue on GitHub

---

**Good luck with your deployment! 🚀**

# 🚀 Deploy to Render.com — Step by Step

## Complete guide to get your Hostel Management System live on the internet for FREE.

---

## ⏱ Time Required: 10 minutes

---

## STEP 1: Create GitHub Account (skip if you have one)

1. Go to **https://github.com**
2. Click **Sign up**
3. Complete registration

---

## STEP 2: Upload Your Project to GitHub

### Option A: Using GitHub Website (Easiest — No Git needed)

1. Go to **https://github.com/new**
2. Repository name: `hostel-management-system`
3. Keep it **Public** (free tier needs public repo)
4. Click **Create repository**
5. On next page, click **"uploading an existing file"**
6. **Copy the entire `hostel-management` folder contents** and drag-drop into the upload area
7. Click **Commit changes**

### Option B: Using Git Command Line

```bash
cd hostel-management
git init
git add .
git commit -m "Hostel Management System v2.0"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/hostel-management-system.git
git push -u origin main
```

---

## STEP 3: Deploy on Render

1. Go to **https://render.com**
2. Click **Get Started** (or Sign In)
3. **Sign up with your GitHub account** (easiest — one click)
4. Once logged in, click **"New +"** → **"Web Service"**
5. Click **"Configure"** under "Connect your GitHub repository"
6. Find and select **`hostel-management-system`**
7. Click **Connect**

### Configure the service:

| Setting | What to enter |
|---------|---------------|
| **Name** | `hostel-management` (or anything you like) |
| **Region** | Choose closest to you (e.g., Mumbai for India) |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | **Free** |

### Add Environment Variable:

1. Scroll down to **"Environment Variables"**
2. Click **"Add Environment Variable"**
3. Add these 2:

| Key | Value |
|-----|-------|
| `JWT_SECRET` | `mySecretKey123RandomString` (any random string) |
| `NODE_ENV` | `production` |

4. Click **"Create Web Service"** button at the bottom

---

## STEP 4: Wait for Deployment

- Render will show build logs
- Takes about **2-5 minutes** to build and deploy
- When you see **"Your service is live"**, your site is ready!
- The URL will be something like: **`https://hostel-management.onrender.com`**

---

## ✅ That's it! Your site is LIVE!

Share the URL with anyone — it works on:
- ✅ Any browser (Chrome, Firefox, Safari, Edge)
- ✅ Any device (Phone, Tablet, Laptop, Desktop)
- ✅ Anywhere in the world

---

## 🔑 Default Login Credentials

| Role | Username | Password |
|------|----------|----------|
| Warden | warden | warden123 |
| Gate Pass | gatepass | gatepass123 |
| Student | 22cs101 | student123 |

⚠️ **Change passwords after first login in production!**

---

## 📱 QR Scanner Note

The QR scanner uses the camera. For it to work:
- Must use **HTTPS** (Render provides this automatically ✅)
- User must **allow camera permission** when browser asks

---

## ⚠️ Important: Free Tier Limitations

| Feature | Free Tier |
|---------|-----------|
| **Hosting** | ✅ Free forever |
| **HTTPS/SSL** | ✅ Free (auto) |
| **Custom Domain** | ✅ Free |
| **Data Persistence** | ⚠️ Database resets after 15 min of inactivity |
| **Uptime** | ⚠️ Sleeps after 15 min, wakes on first request (~30s) |

### What "Database resets" means:
- The free tier uses **ephemeral storage**
- After 15 min of no traffic, the server sleeps
- When it wakes up, it starts with fresh seed data
- **For permanent data**: Upgrade to Render's paid plan ($7/mo) and add a persistent disk

---

## 💾 Make Data Permanent (Optional — Paid Disk)

If you want data to persist forever:

1. Go to your service on Render dashboard
2. Click **"Disks"** in the left sidebar
3. Click **"Add Disk"**
4. Settings:
   - **Name**: `hms-data`
   - **Mount Path**: `/app/data`
   - **Size**: 1 GB (minimum)
5. Click **"Save Changes"**
6. Redeploy

This gives your database a permanent home. Data survives restarts and sleep cycles.

---

## 🌐 Add Custom Domain (Optional)

If you have your own domain (e.g., `hms.yourcollege.edu`):

1. Go to your service on Render
2. Click **"Settings"** → **"Custom Domains"**
3. Click **"Add Custom Domain"**
4. Enter your domain name
5. Update your DNS records as shown
6. SSL certificate is auto-generated ✅

---

## 🆘 Troubleshooting

### "Build failed"
→ Check that all files were uploaded to GitHub correctly
→ Make sure `package.json` exists in the root

### "Application failed to start"
→ Check the **"Logs"** tab on Render for error details
→ Make sure `server.js` is in the root folder

### "Site loads but shows errors"
→ Check Environment Variables are set correctly
→ Make sure `JWT_SECRET` is added

### "QR scanner not working"
→ Must be on HTTPS (Render does this automatically)
→ Allow camera permission when browser asks
→ Try Chrome browser on Android

### "Site is slow to load first time"
→ Normal on free tier — server wakes from sleep (~30 seconds)
→ After first load, it's fast until it sleeps again

---

## 🔄 Update Your Site Later

When you make changes to the code:

### Via GitHub Website:
1. Go to your repo on GitHub
2. Edit the file
3. Commit changes
4. **Render auto-deploys** within 2 minutes ✅

### Via Git:
```bash
git add .
git commit -m "Updated feature"
git push
# Render auto-deploys! ✅
```

---

**Your Hostel Management System is now live on the internet! 🎉**

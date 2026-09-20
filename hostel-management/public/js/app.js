/* ═══════════════════════════════════════════════════════════════
   HMS PREMIUM — Single Page Application
   ═══════════════════════════════════════════════════════════════ */

// ─── State ───────────────────────────────────────────────────
const S = {
  token: localStorage.getItem('hms_token'),
  user: JSON.parse(localStorage.getItem('hms_user') || 'null'),
  socket: null,
  qrTimer: null,
  qrCountdown: null,
  html5QrCode: null,
  scanning: false,
  lastScan: 0,
  justScanned: false,
  activeTab: 'student',
  durationTimer: null,
};

// ─── API Helper ──────────────────────────────────────────────
async function api(url, opts = {}) {
  const h = { ...(opts.headers || {}) };
  if (S.token) h['Authorization'] = `Bearer ${S.token}`;
  if (!(opts.body instanceof FormData)) h['Content-Type'] = 'application/json';
  const r = await fetch(url, { ...opts, headers: h });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

// ─── Toast ───────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: 'check-circle', error: 'times-circle', warning: 'exclamation-triangle', info: 'info-circle' };
  t.innerHTML = `<i class="fas fa-${icons[type]}"></i> ${msg}`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 3500);
}

// ─── View Switching ──────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── Login Screen ────────────────────────────────────────────
function showLogin(role) {
  const forms = document.getElementById('login-forms');
  forms.style.display = 'block';
  document.getElementById('form-register').style.display = 'none';
  document.getElementById('form-login').style.display = 'block';

  const title = document.getElementById('login-title');
  const label = document.getElementById('login-label-user');
  const btn = document.getElementById('login-btn');
  const roleInput = document.getElementById('login-role');
  const regLink = document.getElementById('register-link');
  const userInput = document.getElementById('login-user');

  if (role === 'student') {
    title.innerHTML = '<i class="fas fa-graduation-cap"></i> Student Login';
    label.textContent = 'Enrollment Number';
    userInput.placeholder = 'e.g. 22CS101';
    btn.className = 'btn-login btn-green';
    roleInput.value = 'STUDENT';
    regLink.style.display = 'block';
  } else if (role === 'gatepass') {
    title.innerHTML = '<i class="fas fa-id-badge"></i> Gate Pass Login';
    label.textContent = 'Username';
    userInput.placeholder = 'Gate pass ID';
    btn.className = 'btn-login btn-orange';
    roleInput.value = 'GET_PASS';
    regLink.style.display = 'none';
  } else {
    title.innerHTML = '<i class="fas fa-user-shield"></i> Warden Login';
    label.textContent = 'Username';
    userInput.placeholder = 'Warden ID';
    btn.className = 'btn-login btn-purple';
    roleInput.value = 'WARDEN';
    regLink.style.display = 'none';
  }
  userInput.value = '';
  document.getElementById('login-pass').value = '';
}
function hideLoginForms() { document.getElementById('login-forms').style.display = 'none'; }
function showRegisterForm() {
  document.getElementById('form-login').style.display = 'none';
  document.getElementById('form-register').style.display = 'block';
}

function stab(btn, id) {
  btn.parentElement.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
}

// ─── Authentication ──────────────────────────────────────────
async function doLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-user').value;
  const password = document.getElementById('login-pass').value;
  const role = document.getElementById('login-role').value;
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, role })
    });
    S.token = data.token;
    S.user = data.user;
    localStorage.setItem('hms_token', data.token);
    localStorage.setItem('hms_user', JSON.stringify(data.user));
    connectSocket();
    toast('Login successful!', 'success');
    enterDashboard();
  } catch (err) { toast(err.message, 'error'); }
}

async function doRegister(e) {
  e.preventDefault();
  const pass = document.getElementById('r-pass').value;
  const cpass = document.getElementById('r-cpass').value;
  if (pass !== cpass) return toast('Passwords do not match', 'error');
  if (pass.length < 6) return toast('Password must be 6+ characters', 'error');

  const fd = new FormData();
  fd.append('name', document.getElementById('r-name').value);
  fd.append('enrollment_no', document.getElementById('r-enroll').value);
  fd.append('phone', document.getElementById('r-phone').value);
  fd.append('branch', document.getElementById('r-branch').value);
  fd.append('section', document.getElementById('r-section').value);
  fd.append('blood_group', document.getElementById('r-blood').value);
  fd.append('parent_name', document.getElementById('r-pname').value);
  fd.append('parent_phone', document.getElementById('r-pphone').value);
  fd.append('hostel_name', document.getElementById('r-hostel').value);
  fd.append('room_no', document.getElementById('r-room').value);
  fd.append('floor', document.getElementById('r-floor').value);
  fd.append('password', pass);
  fd.append('confirm_password', cpass);

  try {
    const data = await api('/api/auth/register', { method: 'POST', body: fd });
    toast(data.message, 'success');
    // Switch to login form
    document.getElementById('form-register').style.display = 'none';
    document.getElementById('form-login').style.display = 'block';
  } catch (err) { toast(err.message, 'error'); }
}

function doLogout() {
  S.token = null; S.user = null;
  localStorage.removeItem('hms_token');
  localStorage.removeItem('hms_user');
  if (S.socket) { S.socket.disconnect(); S.socket = null; }
  clearTimers();
  showView('view-login');
  hideLoginForms();
  toast('Logged out', 'info');
}

// ─── Change Password ───────────────────────────────────────────
function showChangePassword() {
  document.getElementById('modal-box').innerHTML = `
    <h2><i class="fas fa-key" style="color:var(--orange);"></i> Change Password</h2>
    <form onsubmit="changePassword(event)">
      <div class="fg"><label>Current Password</label><input type="password" id="cp-current" required placeholder="Enter current password"></div>
      <div class="fg"><label>New Password</label><input type="password" id="cp-new" required minlength="6" placeholder="Min 6 characters"></div>
      <div class="fg"><label>Confirm New Password</label><input type="password" id="cp-confirm" required minlength="6" placeholder="Re-enter new password"></div>
      <div class="modal-actions">
        <button type="button" class="btn-action" style="background:var(--glass);border:1px solid var(--glass-border);" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-action btn-orange"><i class="fas fa-check"></i> Change Password</button>
      </div>
    </form>`;
  openModal();
}

async function changePassword(e) {
  e.preventDefault();
  const currentPw = document.getElementById('cp-current').value;
  const newPw = document.getElementById('cp-new').value;
  const confirmPw = document.getElementById('cp-confirm').value;
  
  if (newPw !== confirmPw) return toast('New passwords do not match', 'error');
  if (newPw.length < 6) return toast('Password must be at least 6 characters', 'error');
  if (newPw === currentPw) return toast('New password must be different from current', 'error');
  
  try {
    await api('/api/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: currentPw, new_password: newPw })
    });
    closeModal();
    toast('Password changed successfully! ✓', 'success');
  } catch (err) {
    toast(err.message || 'Failed to change password', 'error');
  }
}

// ─── Enter Dashboard ─────────────────────────────────────────
function enterDashboard() {
  showView('view-dashboard');
  const role = S.user.role;
  // Show relevant tabs
  document.getElementById('tab-student').style.display = role === 'STUDENT' ? 'flex' : 'none';
  document.getElementById('tab-gate').style.display = role === 'GET_PASS' ? 'flex' : 'none';
  document.getElementById('tab-warden').style.display = role === 'WARDEN' ? 'flex' : 'none';

  // User info — hidden (don't show logged-in user name on dashboard)
  document.getElementById('nav-user-info').innerHTML = '';

  // Show change password button for Warden and Gate Pass
  const btnChangePw = document.getElementById('btn-change-pw');
  if (btnChangePw) btnChangePw.style.display = (role === 'WARDEN' || role === 'GET_PASS') ? 'flex' : 'none';

  // Set active tab
  if (role === 'STUDENT') switchTab('student');
  else if (role === 'GET_PASS') switchTab('gate');
  else switchTab('warden');
}

// ─── Tab Switching ───────────────────────────────────────────
function switchTab(tab) {
  S.activeTab = tab;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
  document.getElementById(`panel-${tab}`).style.display = 'block';

  clearTimers();
  if (tab === 'student') loadStudentAll();
  if (tab === 'gate') loadGateAll();
  if (tab === 'warden') loadWardenAll();
}

function clearTimers() {
  if (S.qrTimer) { clearInterval(S.qrTimer); S.qrTimer = null; }
  if (S.qrCountdown) { clearInterval(S.qrCountdown); S.qrCountdown = null; }
  if (S.durationTimer) { clearInterval(S.durationTimer); S.durationTimer = null; }
  if (S.scanning) stopScan();
}

// ═══════════════════════════════════════════════════════════════
//  SOCKET.IO — Real-Time Sync
// ═══════════════════════════════════════════════════════════════
function connectSocket() {
  if (S.socket) S.socket.disconnect();
  S.socket = io();
  S.socket.on('connect', () => console.log('Socket connected'));
  S.socket.on('status-update', handleRealtimeUpdate);
  S.socket.on('attendance-update', handleAttendanceUpdate);
  S.socket.on('attendance-update-all', handleAttendanceUpdateAll);
  S.socket.on('attendance-settings-update', handleAttendanceSettingsUpdate);
}

function handleRealtimeUpdate(data) {
  const { student, event_type, event_time, outside_duration } = data;
  const name = student.name || 'Student';
  const isCheckIn = event_type === 'CHECK_IN';
  const emoji = isCheckIn ? '🟢' : '🔴';
  const action = isCheckIn ? 'Checked In' : 'Checked Out';
  const durMsg = isCheckIn && outside_duration ? ` | ⏱ ${outside_duration}` : '';

  toast(`${emoji} ${name} — ${action}${durMsg}`, isCheckIn ? 'success' : 'warning');

  // Skip refresh if we just scanned (the scan handler already refreshes)
  if (S.justScanned) {
    S.justScanned = false;
    return;
  }

  // Refresh panels (with small delay to let DB save)
  setTimeout(() => {
    if (S.activeTab === 'student') loadStudentAll();
    if (S.activeTab === 'gate') { loadGateStudents(); loadGateRecent(); }
    if (S.activeTab === 'warden') loadWardenAll();
  }, 300);
}

// ═══════════════════════════════════════════════════════════════
//  STUDENT PANEL
// ═══════════════════════════════════════════════════════════════
async function loadStudentAll() {
  try {
    const me = await api('/api/auth/me');
    renderStudentStatus(me);
    renderStudentProfile(me);
    loadStudentHistory();
    loadStudentAttendance();
    startQRLoop();
  } catch (err) { console.error(err); }
}

function renderStudentStatus(me) {
  const el = document.getElementById('s-status-card');
  const isIn = me.current_status === 'IN_CAMPUS';
  el.className = `status-card ${isIn ? 'in-campus' : 'outside-campus'}`;

  if (isIn) {
    el.innerHTML = `
      <div class="sc-emoji">🟢</div>
      <div class="sc-label">IN CAMPUS</div>
      <div class="sc-detail">
        Last Check-In<br>
        <strong>${fmtDT(me.last_checkin)}</strong>
      </div>
      ${me.last_outside_duration ? `
      <div class="sc-duration" style="background:rgba(255,255,255,0.2);margin-top:16px;">
        <div style="font-size:0.8rem;opacity:0.8;">⏱ Last Outside Duration</div>
        <div class="dur-val">${me.last_outside_duration}</div>
      </div>` : ''}`;
    if (S.durationTimer) { clearInterval(S.durationTimer); S.durationTimer = null; }
  } else {
    el.innerHTML = `
      <div class="sc-emoji">🔴</div>
      <div class="sc-label">OUTSIDE CAMPUS</div>
      <div class="sc-detail">
        Checked Out<br>
        <strong>${fmtDT(me.last_checkout)}</strong>
      </div>
      <div class="sc-duration">
        <div style="font-size:0.8rem;opacity:0.8;">Outside Duration</div>
        <div class="dur-val" id="dur-val">...</div>
      </div>`;
    startDurationTimer(me.last_checkout);
  }
}

function startDurationTimer(checkout) {
  if (S.durationTimer) clearInterval(S.durationTimer);
  function update() {
    const el = document.getElementById('dur-val');
    if (!el) { clearInterval(S.durationTimer); return; }
    if (!checkout) { el.textContent = 'N/A'; return; }
    const co = new Date(checkout.replace(' ', 'T'));
    const diff = Math.floor((Date.now() - co.getTime()) / 60000);
    const h = Math.floor(diff / 60), m = diff % 60;
    el.textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  update();
  S.durationTimer = setInterval(update, 30000);
}

function renderStudentProfile(me) {
  const photo = me.photo_url ? `<img src="${me.photo_url}">` : '<i class="fas fa-user"></i>';
  document.getElementById('s-profile-card').innerHTML = `
    <div class="profile-top">
      <div class="profile-avatar">${photo}</div>
      <div>
        <h2>${me.name}</h2>
        <p>${me.enrollment_no} • ${me.branch} - ${me.section}</p>
        <div class="profile-badges">
          <span class="p-badge"><i class="fas fa-building"></i> ${me.hostel_name}</span>
          <span class="p-badge"><i class="fas fa-door-open"></i> Room ${me.room_no}</span>
          <span class="p-badge"><i class="fas fa-tint"></i> ${me.blood_group || 'N/A'}</span>
        </div>
      </div>
    </div>
    <div class="profile-grid">
      <div class="profile-item"><label>Phone</label><span>${me.phone}</span></div>
      <div class="profile-item"><label>Branch</label><span>${me.branch}</span></div>
      <div class="profile-item"><label>Parent</label><span>${me.parent_name}</span></div>
      <div class="profile-item"><label>Parent Phone</label><span>${me.parent_phone}</span></div>
      <div class="profile-item"><label>Floor</label><span>${me.floor}</span></div>
      <div class="profile-item"><label>Status</label><span class="${me.current_status === 'IN_CAMPUS' ? 'badge in' : 'badge out'}">${me.current_status === 'IN_CAMPUS' ? 'In Campus' : 'Outside'}</span></div>
    </div>`;
}

async function loadStudentHistory() {
  try {
    const data = await api('/api/student/history');
    const el = document.getElementById('s-history-list');
    if (!data.events || !data.events.length) { el.innerHTML = '<div class="empty"><i class="fas fa-clock"></i><p>No activity yet</p></div>'; return; }
    el.innerHTML = data.events.slice(0, 15).map(e => {
      const isIn = e.event_type === 'CHECK_IN';
      return `<div class="h-item">
        <div class="h-icon ${isIn ? 'checkin' : 'checkout'}"><i class="fas fa-${isIn ? 'arrow-left' : 'arrow-right'}"></i></div>
        <div class="h-info">
          <strong>${isIn ? 'Checked In' : 'Checked Out'}</strong>
          <span>${isIn ? 'Returned to campus' : 'Left campus'}${isIn && e.outside_duration ? ` · <span style="color:var(--orange);font-weight:600;">⏱ ${e.outside_duration}</span>` : ''}</span>
        </div>
        <div class="h-time">${e.event_date}<br>${fmtTime(e.event_time)}</div>
      </div>`;
    }).join('');
  } catch {}
}

// ─── QR Code ─────────────────────────────────────────────────
async function startQRLoop() {
  if (S.qrTimer) clearInterval(S.qrTimer);
  if (S.qrCountdown) clearInterval(S.qrCountdown);
  await genQR();
  S.qrTimer = setInterval(genQR, 6000);
}

async function genQR() {
  try {
    const data = await api('/api/qr/generate', { method: 'POST' });
    const el = document.getElementById('qr-display');
    el.innerHTML = '';
    new QRCode(el, { text: data.token, width: 180, height: 180, colorDark: '#1a1a2e', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    // Animate timer bar
    startQRTimerBar();
  } catch (err) { console.error('QR error:', err); }
}

function startQRTimerBar() {
  if (S.qrCountdown) clearInterval(S.qrCountdown);
  let remaining = 6;
  const fill = document.getElementById('qr-fill');
  const text = document.getElementById('qr-countdown-text');
  if (fill) fill.style.width = '100%';
  if (text) text.textContent = 'Refreshes in 6s';

  S.qrCountdown = setInterval(() => {
    remaining--;
    const pct = (remaining / 6) * 100;
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = remaining > 0 ? `Refreshes in ${remaining}s` : 'Refreshing...';
    if (remaining <= 0) clearInterval(S.qrCountdown);
  }, 1000);
}

// ═══════════════════════════════════════════════════════════════
//  GATE PASS PANEL
// ═══════════════════════════════════════════════════════════════
async function loadGateAll() {
  loadGateStudents();
  loadGateRecent();
}

async function loadGateStudents() {
  try {
    const search = document.getElementById('gp-search')?.value || '';
    const filter = document.getElementById('gp-filter')?.value || '';
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filter) params.set('status', filter);
    const students = await api(`/api/getpass/students?${params}`);
    const el = document.getElementById('gp-student-list');
    if (!students.length) { el.innerHTML = '<div class="empty"><p>No students found</p></div>'; return; }
    
    const html = students.map(s => {
      const isIn = s.current_status === 'IN_CAMPUS';
      const lastTime = isIn ? (s.last_checkin || '') : (s.last_checkout || '');
      const timeStr = fmtTime(lastTime);
      const dateStr = lastTime && lastTime.includes(' ') ? fmtDate(lastTime.split(' ')[0]) : '';
      const colors = ['#8b5cf6','#3b82f6','#06b6d4','#f59e0b','#ef4444','#ec4899'];
      const color = colors[s.id % colors.length];
      const initial = s.name.charAt(0).toUpperCase();
      const activityLabel = isIn ? 'Last Check-In' : 'Last Check-Out';
      return `<div class="s-item" style="cursor:pointer;" onclick="viewStudentGate(${s.id})">
        <div class="si-avatar" style="background:${color};">${initial}</div>
        <div class="si-info">
          <div class="si-name">${s.name}</div>
          <div class="si-meta">${s.enrollment_no} · ${s.hostel_name} · R${s.room_no}</div>
          <div style="font-size:0.78rem;color:${isIn ? '#22c55e' : '#ef4444'};font-weight:600;margin-top:3px;">${isIn ? '🟢' : '🔴'} ${activityLabel}: ${dateStr} ${timeStr || '—'}</div>
        </div>
        <div class="si-status"><span class="badge ${isIn ? 'in' : 'out'}">${isIn ? 'In Campus' : 'Outside'}</span></div>
      </div>`;
    }).join('');
    
    el.innerHTML = html;
  } catch (err) {
    console.error('Load gate students error:', err);
  }
}

async function loadGateRecent() {
  try {
    const events = await api('/api/getpass/recent');
    const el = document.getElementById('gp-recent-list');
    if (!events.length) { el.innerHTML = '<div class="empty"><p>No recent activity</p></div>'; return; }
    
    const html = events.slice(0, 20).map(e => {
      const isIn = e.event_type === 'CHECK_IN';
      const durationHtml = (isIn && e.outside_duration) ? ` · <span style="color:var(--orange);font-weight:600;">⏱ ${e.outside_duration}</span>` : '';
      return `<div class="h-item">
        <div class="h-icon ${isIn ? 'checkin' : 'checkout'}"><i class="fas fa-${isIn ? 'arrow-left' : 'arrow-right'}"></i></div>
        <div class="h-info">
          <strong>${e.name}</strong>
          <span>${e.enrollment_no} · ${e.hostel_name} · R${e.room_no}${durationHtml}</span>
        </div>
        <div class="h-time">${isIn ? '🟢 In' : '🔴 Out'}<br>${fmtDate(e.event_date)} ${fmtTime(e.event_time)}</div>
      </div>`;
    }).join('');
    
    el.innerHTML = html;
  } catch (err) {
    console.error('Load gate recent error:', err);
  }
}

// ─── Scanner ─────────────────────────────────────────────────
async function startScan() {
  try {
    document.getElementById('scanner-placeholder').style.display = 'none';
    if (!S.html5QrCode) S.html5QrCode = new Html5Qrcode("qr-reader");
    await S.html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScan, () => {});
    S.scanning = true;
    document.getElementById('btn-scan-start').style.display = 'none';
    document.getElementById('btn-scan-stop').style.display = 'flex';
  } catch (err) {
    document.getElementById('scanner-placeholder').style.display = 'flex';
    document.getElementById('scanner-placeholder').innerHTML = `<i class="fas fa-exclamation-triangle" style="color:#f59e0b;"></i><p>Camera access denied<br><small>${err}</small></p>`;
    toast('Camera permission required', 'error');
  }
}

async function stopScan() {
  if (S.html5QrCode && S.scanning) {
    try { await S.html5QrCode.stop(); } catch {}
    S.scanning = false;
    document.getElementById('btn-scan-start').style.display = 'flex';
    document.getElementById('btn-scan-stop').style.display = 'none';
    document.getElementById('scanner-placeholder').style.display = 'flex';
    document.getElementById('scanner-placeholder').innerHTML = `<i class="fas fa-qrcode"></i><p>Tap Start to open camera</p>`;
  }
}

async function onScan(decoded) {
  const now = Date.now();
  if (now - S.lastScan < 2000) return;
  S.lastScan = now;

  const el = document.getElementById('scan-result');
  el.style.display = 'block';
  el.className = 'scan-result';
  el.innerHTML = '<div style="padding:20px;"><i class="fas fa-spinner fa-spin fa-2x" style="color:var(--blue);"></i><p style="margin-top:8px;">Verifying...</p></div>';

  try {
    const data = await api('/api/qr/verify', { method: 'POST', body: JSON.stringify({ token: decoded }) });
    const s = data.student;
    const isIn = s.event_type === 'CHECK_IN';
    el.className = 'scan-result ok';
    el.innerHTML = `
      <h4 style="color:var(--green);"><i class="fas fa-check-circle"></i> ${isIn ? 'CHECK-IN ✓' : 'CHECK-OUT ✓'}</h4>
      <p style="margin:6px 0;"><strong>${s.name}</strong> (${s.enrollment_no})</p>
      <p style="font-size:0.85rem;color:var(--text2);">${s.hostel_name} · Room ${s.room_no} · ${s.event_time}</p>
      <span class="badge ${isIn ? 'in' : 'out'}" style="margin-top:8px;font-size:0.85rem;">${isIn ? '🟢 IN CAMPUS' : '🔴 OUTSIDE CAMPUS'}</span>
      ${s.outside_duration ? `<div style="margin-top:12px;padding:10px 16px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);border-radius:8px;display:inline-block;"><p style="color:var(--orange);font-weight:700;font-size:0.9rem;margin:0;">⏱ Outside Duration</p><p style="color:var(--orange);font-weight:800;font-size:1.3rem;margin:4px 0 0 0;">${s.outside_duration}</p></div>` : ''}`;
    toast(`${s.name} ${isIn ? 'checked in' : 'checked out'}!${s.outside_duration ? ' Outside: ' + s.outside_duration : ''}`, 'success');
    // Set flag to prevent socket-triggered double refresh
    S.justScanned = true;
    // Wait briefly for DB to save, then refresh lists
    setTimeout(() => {
      loadGateStudents();
      loadGateRecent();
      // Reset flag after a few seconds
      setTimeout(() => { S.justScanned = false; }, 3000);
    }, 500);
  } catch (err) {
    el.className = 'scan-result fail';
    el.innerHTML = `<h4 style="color:var(--red);"><i class="fas fa-times-circle"></i> FAILED</h4><p style="margin-top:6px;">${err.message}</p>`;
    toast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
//  WARDEN PANEL
// ═══════════════════════════════════════════════════════════════
async function loadWardenAll() {
  try {
    const data = await api('/api/warden/monitoring');
    renderWardenStats(data.stats);
    renderWardenMonitoring(data);
    loadWardenStudents();
    renderWardenRecent(data);
    loadHostelFilters();
    loadWardenAttendance();
  } catch (err) { console.error(err); }
}

function renderWardenStats(stats) {
  document.getElementById('w-stats-row').innerHTML = `
    <div class="stat-box s-total"><div class="sb-icon" style="color:var(--blue);"><i class="fas fa-users"></i></div><div class="sb-val">${stats.total}</div><div class="sb-label">Total Students</div></div>
    <div class="stat-box s-in"><div class="sb-icon" style="color:var(--green);"><i class="fas fa-building"></i></div><div class="sb-val">${stats.in_campus}</div><div class="sb-label">In Campus</div></div>
    <div class="stat-box s-out"><div class="sb-icon" style="color:var(--red);"><i class="fas fa-sign-out-alt"></i></div><div class="sb-val">${stats.outside}</div><div class="sb-label">Outside</div></div>
    <div class="stat-box s-hostel"><div class="sb-icon" style="color:var(--purple);"><i class="fas fa-hotel"></i></div><div class="sb-val">${stats.hostels}</div><div class="sb-label">Hostels</div></div>`;
}

function renderWardenMonitoring(data) {
  document.getElementById('w-in-count').textContent = data.in_campus.length;
  document.getElementById('w-out-count').textContent = data.outside.length;

  const colors = ['#8b5cf6','#3b82f6','#06b6d4','#f59e0b','#ef4444','#ec4899','#22c55e'];

  document.getElementById('w-in-list').innerHTML = data.in_campus.length
    ? data.in_campus.map(s => `<div class="s-item" style="cursor:pointer;" onclick="viewStudent(${s.id})">
        <div class="si-avatar" style="background:${colors[s.id % colors.length]};">${s.name[0]}</div>
        <div class="si-info">
          <div class="si-name">${s.name}</div>
          <div class="si-meta">${s.enrollment_no} · ${s.hostel_name} · R${s.room_no}</div>
          ${s.last_outside_duration ? `<div class="si-duration" style="color:var(--orange);">⏱ Last outside: ${s.last_outside_duration}</div>` : ''}
        </div>
        <div class="si-time" style="color:var(--green);">🟢<br>${fmtTime(s.last_checkin)}</div>
      </div>`).join('')
    : '<div class="empty"><p>No students in campus</p></div>';

  document.getElementById('w-out-list').innerHTML = data.outside.length
    ? data.outside.map(s => `<div class="s-item" style="cursor:pointer;" onclick="viewStudent(${s.id})">
        <div class="si-avatar" style="background:${colors[s.id % colors.length]};">${s.name[0]}</div>
        <div class="si-info">
          <div class="si-name">${s.name}</div>
          <div class="si-meta">${s.enrollment_no} · ${s.hostel_name} · R${s.room_no}</div>
          <div class="si-duration" data-co="${s.last_checkout}">⏱ ${calcDur(s.last_checkout)}</div>
        </div>
        <div class="si-time" style="color:var(--red);">🔴<br>${fmtTime(s.last_checkout)}</div>
      </div>`).join('')
    : '<div class="empty"><p>No students outside</p></div>';

  // Timer for outside durations
  if (S.durationTimer) clearInterval(S.durationTimer);
  S.durationTimer = setInterval(() => {
    document.querySelectorAll('[data-co]').forEach(el => {
      el.innerHTML = `⏱ ${calcDur(el.dataset.co)}`;
    });
  }, 60000);
}

async function loadWardenStudents() {
  try {
    const search = document.getElementById('w-search')?.value || '';
    const status = document.getElementById('w-status-filter')?.value || '';
    const hostel = document.getElementById('w-hostel-filter')?.value || '';
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (hostel) params.set('hostel', hostel);
    const students = await api(`/api/warden/students?${params}`);
    const tbody = document.getElementById('w-students-tbody');
    if (!students.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="empty"><p>No students found</p></div></td></tr>'; return; }
    tbody.innerHTML = students.map(s => {
      const isIn = s.current_status === 'IN_CAMPUS';
      return `<tr style="cursor:pointer;" onclick="viewStudent(${s.id})">
        <td><strong>${s.name}</strong></td>
        <td>${s.enrollment_no}</td>
        <td>${s.hostel_name}</td>
        <td>${s.room_no}</td>
        <td><span class="badge ${isIn ? 'in' : 'out'}">${isIn ? 'In Campus' : 'Outside'}</span></td>
        <td onclick="event.stopPropagation()">
          <button class="table-btn view" onclick="viewStudent(${s.id})" title="View Details"><i class="fas fa-eye"></i></button>
          <button class="table-btn edit" onclick="editStudent(${s.id})" title="Edit Student"><i class="fas fa-edit"></i></button>
          <button class="table-btn del" onclick="confirmDelete(${s.id},'${s.name}')" title="Delete Student"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  } catch {}
}

function renderWardenRecent(data) {
  const events = [...(data.recent_checkouts || []), ...(data.recent_checkins || [])].sort((a, b) => b.id - a.id).slice(0, 15);
  const el = document.getElementById('w-recent-events');
  if (!events.length) { el.innerHTML = '<div class="empty"><p>No recent events</p></div>'; return; }
  el.innerHTML = events.map(e => {
    const isIn = e.event_type === 'CHECK_IN';
    return `<div class="h-item">
      <div class="h-icon ${isIn ? 'checkin' : 'checkout'}"><i class="fas fa-${isIn ? 'arrow-left' : 'arrow-right'}"></i></div>
      <div class="h-info">
        <strong>${e.name}</strong>
        <span>${e.enrollment_no} — ${isIn ? 'Checked In' : 'Checked Out'}${isIn && e.outside_duration ? ` · <span style="color:var(--orange);font-weight:600;">⏱ ${e.outside_duration}</span>` : ''}</span>
      </div>
      <div class="h-time">${e.event_date}<br>${fmtTime(e.event_time)}</div>
    </div>`;
  }).join('');
}

// ─── Warden CRUD ─────────────────────────────────────────────
function showAddStudent() {
  document.getElementById('modal-box').innerHTML = `
    <h2><i class="fas fa-user-plus" style="color:var(--purple);"></i> Add Student</h2>
    <form onsubmit="addStudent(event)">
      <div class="fg-row"><div class="fg"><label>Name *</label><input id="a-name" required></div><div class="fg"><label>Enrollment *</label><input id="a-enroll" required></div></div>
      <div class="fg-row"><div class="fg"><label>Phone *</label><input id="a-phone" required pattern="[0-9]{10}"></div><div class="fg"><label>Blood Group</label><select id="a-blood"><option value="">-</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>O+</option><option>O-</option><option>AB+</option><option>AB-</option></select></div></div>
      <div class="fg-row"><div class="fg"><label>Branch *</label><select id="a-branch" required><option value="">-</option><option>CSE</option><option>ECE</option><option>ME</option><option>CE</option><option>EE</option><option>IT</option></select></div><div class="fg"><label>Section *</label><select id="a-section" required><option value="">-</option><option>A</option><option>B</option><option>C</option></select></div></div>
      <div class="fg-row"><div class="fg"><label>Parent Name *</label><input id="a-pname" required></div><div class="fg"><label>Parent Phone *</label><input id="a-pphone" required pattern="[0-9]{10}"></div></div>
      <div class="fg-row"><div class="fg"><label>Hostel *</label><select id="a-hostel" required><option value="">-</option><option>Boys Hostel</option><option>Girls Hostel</option></select></div><div class="fg"><label>Room *</label><input id="a-room" required></div></div>
      <div class="fg-row"><div class="fg"><label>Floor *</label><select id="a-floor" required><option value="">-</option><option>Ground</option><option>1</option><option>2</option><option>3</option></select></div><div class="fg"><label>Password *</label><input type="password" id="a-pass" required minlength="6"></div></div>
      <div class="modal-actions"><button type="button" class="btn-action" style="background:var(--glass);border:1px solid var(--glass-border);" onclick="closeModal()">Cancel</button><button type="submit" class="btn-action btn-purple">Add Student</button></div>
    </form>`;
  openModal();
}

async function addStudent(e) {
  e.preventDefault();
  try {
    await api('/api/warden/students', {
      method: 'POST',
      body: JSON.stringify({
        name: gv('a-name'), enrollment_no: gv('a-enroll'), phone: gv('a-phone'),
        branch: gv('a-branch'), section: gv('a-section'), blood_group: gv('a-blood'),
        parent_name: gv('a-pname'), parent_phone: gv('a-pphone'),
        hostel_name: gv('a-hostel'), room_no: gv('a-room'),
        floor: gv('a-floor'), password: gv('a-pass')
      })
    });
    closeModal(); toast('Student added!', 'success');
    loadWardenStudents();
  } catch (err) { toast(err.message, 'error'); }
}

async function viewStudent(id) {
  try {
    const data = await api(`/api/warden/students/${id}`);
    const s = data.student;
    const isIn = s.current_status === 'IN_CAMPUS';
    const photo = s.photo_url ? `<img src="${s.photo_url}">` : '<i class="fas fa-user"></i>';
    const durHtml = (!isIn && s.last_checkout) ? `<div style="margin-top:8px;padding:10px 14px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:8px;display:inline-block;"><span style="color:var(--orange);font-weight:700;">⏱ Outside: ${calcDur(s.last_checkout)}</span></div>` : '';
    const lastDurHtml = (isIn && s.last_outside_duration) ? `<div style="margin-top:8px;padding:10px 14px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:8px;display:inline-block;"><span style="color:var(--orange);font-weight:700;">⏱ Last Outside: ${s.last_outside_duration}</span></div>` : '';
    document.getElementById('modal-box').innerHTML = `
      <h2><i class="fas fa-user" style="color:var(--blue);"></i> ${s.name}</h2>
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;">
        <div class="profile-avatar" style="width:56px;height:56px;">${photo}</div>
        <div><p style="color:var(--text2);">${s.enrollment_no} · ${s.branch}-${s.section}</p><span class="badge ${isIn ? 'in' : 'out'}">${isIn ? '🟢 In Campus' : '🔴 Outside'}</span></div>
      </div>
      ${durHtml}${lastDurHtml}
      <div class="profile-grid" style="margin-top:16px;">
        <div class="profile-item"><label>Phone</label><span>${s.phone}</span></div>
        <div class="profile-item"><label>Blood Group</label><span>${s.blood_group || 'N/A'}</span></div>
        <div class="profile-item"><label>Parent</label><span>${s.parent_name}</span></div>
        <div class="profile-item"><label>Parent Phone</label><span>${s.parent_phone}</span></div>
        <div class="profile-item"><label>Hostel</label><span>${s.hostel_name}</span></div>
        <div class="profile-item"><label>Room / Floor</label><span>Room ${s.room_no}, Floor ${s.floor}</span></div>
        ${isIn ? `<div class="profile-item"><label>Last Check-In</label><span>${fmtDT(s.last_checkin)}</span></div>` : `<div class="profile-item"><label>Last Check-Out</label><span>${fmtDT(s.last_checkout)}</span></div>`}
      </div>
      <h3 style="margin-top:16px;font-size:0.9rem;"><i class="fas fa-clock-rotate-left"></i> Recent Events</h3>
      <div style="max-height:150px;overflow-y:auto;">
        ${data.events.length ? data.events.slice(0, 8).map(e => `<div class="h-item"><div class="h-icon ${e.event_type === 'CHECK_IN' ? 'checkin' : 'checkout'}"><i class="fas fa-${e.event_type === 'CHECK_IN' ? 'arrow-left' : 'arrow-right'}"></i></div><div class="h-info"><strong>${e.event_type === 'CHECK_IN' ? 'Checked In' : 'Checked Out'}</strong>${e.outside_duration ? `<span> · ⏱ ${e.outside_duration}</span>` : ''}</div><div class="h-time">${e.event_date} ${fmtTime(e.event_time)}</div></div>`).join('') : '<div class="empty"><p>No events</p></div>'}
      </div>
      <div class="modal-actions"><button class="btn-action" style="background:var(--glass);border:1px solid var(--glass-border);" onclick="closeModal()">Close</button></div>`;
    openModal();
  } catch (err) { toast(err.message, 'error'); }
}

// Gate Pass: View student details
async function viewStudentGate(id) {
  try {
    const data = await api(`/api/getpass/students/${id}`);
    const s = data.student;
    const isIn = s.current_status === 'IN_CAMPUS';
    const photo = s.photo_url ? `<img src="${s.photo_url}">` : '<i class="fas fa-user"></i>';
    const durHtml = (!isIn && s.last_checkout) ? `<div style="margin-top:8px;padding:10px 14px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:8px;display:inline-block;"><span style="color:var(--orange);font-weight:700;">⏱ Outside: ${calcDur(s.last_checkout)}</span></div>` : '';
    const lastDurHtml = (isIn && s.last_outside_duration) ? `<div style="margin-top:8px;padding:10px 14px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:8px;display:inline-block;"><span style="color:var(--orange);font-weight:700;">⏱ Last Outside: ${s.last_outside_duration}</span></div>` : '';
    document.getElementById('modal-box').innerHTML = `
      <h2><i class="fas fa-user" style="color:var(--orange);"></i> ${s.name}</h2>
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;">
        <div class="profile-avatar" style="width:56px;height:56px;">${photo}</div>
        <div><p style="color:var(--text2);">${s.enrollment_no} · ${s.branch}-${s.section}</p><span class="badge ${isIn ? 'in' : 'out'}">${isIn ? '🟢 In Campus' : '🔴 Outside'}</span></div>
      </div>
      ${durHtml}${lastDurHtml}
      <div class="profile-grid" style="margin-top:16px;">
        <div class="profile-item"><label>Phone</label><span>${s.phone}</span></div>
        <div class="profile-item"><label>Blood Group</label><span>${s.blood_group || 'N/A'}</span></div>
        <div class="profile-item"><label>Parent</label><span>${s.parent_name}</span></div>
        <div class="profile-item"><label>Parent Phone</label><span>${s.parent_phone}</span></div>
        <div class="profile-item"><label>Hostel</label><span>${s.hostel_name}</span></div>
        <div class="profile-item"><label>Room / Floor</label><span>Room ${s.room_no}, Floor ${s.floor}</span></div>
        ${isIn ? `<div class="profile-item"><label>Last Check-In</label><span>${fmtDT(s.last_checkin)}</span></div>` : `<div class="profile-item"><label>Last Check-Out</label><span>${fmtDT(s.last_checkout)}</span></div>`}
      </div>
      <h3 style="margin-top:16px;font-size:0.9rem;"><i class="fas fa-clock-rotate-left"></i> Recent Gate Activity</h3>
      <div style="max-height:150px;overflow-y:auto;">
        ${data.events.length ? data.events.slice(0, 8).map(e => `<div class="h-item"><div class="h-icon ${e.event_type === 'CHECK_IN' ? 'checkin' : 'checkout'}"><i class="fas fa-${e.event_type === 'CHECK_IN' ? 'arrow-left' : 'arrow-right'}"></i></div><div class="h-info"><strong>${e.event_type === 'CHECK_IN' ? 'Checked In' : 'Checked Out'}</strong>${e.outside_duration ? `<span> · ⏱ ${e.outside_duration}</span>` : ''}</div><div class="h-time">${e.event_date} ${fmtTime(e.event_time)}</div></div>`).join('') : '<div class="empty"><p>No events</p></div>'}
      </div>
      <div class="modal-actions"><button class="btn-action" style="background:var(--glass);border:1px solid var(--glass-border);" onclick="closeModal()">Close</button></div>`;
    openModal();
  } catch (err) { toast(err.message, 'error'); }
}

async function editStudent(id) {
  try {
    const data = await api(`/api/warden/students/${id}`);
    const s = data.student;
    document.getElementById('modal-box').innerHTML = `
      <h2><i class="fas fa-edit" style="color:var(--orange);"></i> Edit ${s.name}</h2>
      <form onsubmit="saveStudent(event,${id})">
        <div class="fg-row"><div class="fg"><label>Name</label><input id="e-name" value="${s.name}" required></div><div class="fg"><label>Phone</label><input id="e-phone" value="${s.phone}" required></div></div>
        <div class="fg-row"><div class="fg"><label>Branch</label><select id="e-branch">${['CSE','ECE','ME','CE','EE','IT'].map(b=>`<option ${s.branch===b?'selected':''}>${b}</option>`).join('')}</select></div><div class="fg"><label>Section</label><select id="e-section">${['A','B','C','D'].map(x=>`<option ${s.section===x?'selected':''}>${x}</option>`).join('')}</select></div></div>
        <div class="fg-row"><div class="fg"><label>Parent</label><input id="e-pname" value="${s.parent_name}" required></div><div class="fg"><label>Parent Ph.</label><input id="e-pphone" value="${s.parent_phone}" required></div></div>
        <div class="fg-row"><div class="fg"><label>Hostel</label><select id="e-hostel">${['Boys Hostel','Girls Hostel'].map(h=>`<option ${s.hostel_name===h?'selected':''}>${h}</option>`).join('')}</select></div><div class="fg"><label>Room</label><input id="e-room" value="${s.room_no}" required></div></div>
        <div class="fg-row"><div class="fg"><label>Floor</label><select id="e-floor">${['Ground','1','2','3','4'].map(f=>`<option ${s.floor===f?'selected':''}>${f}</option>`).join('')}</select></div><div class="fg"><label>New Password</label><input type="password" id="e-pass" placeholder="Leave blank"></div></div>
        <div class="modal-actions"><button type="button" class="btn-action" style="background:var(--glass);border:1px solid var(--glass-border);" onclick="closeModal()">Cancel</button><button type="submit" class="btn-action btn-orange">Save</button></div>
      </form>`;
    openModal();
  } catch (err) { toast(err.message, 'error'); }
}

async function saveStudent(e, id) {
  e.preventDefault();
  try {
    const body = { name: gv('e-name'), phone: gv('e-phone'), branch: gv('e-branch'), section: gv('e-section'), parent_name: gv('e-pname'), parent_phone: gv('e-pphone'), hostel_name: gv('e-hostel'), room_no: gv('e-room'), floor: gv('e-floor') };
    const pw = gv('e-pass'); if (pw) body.password = pw;
    await api(`/api/warden/students/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    closeModal(); toast('Student updated!', 'success');
    loadWardenStudents();
  } catch (err) { toast(err.message, 'error'); }
}

function confirmDelete(id, name) {
  document.getElementById('modal-box').innerHTML = `
    <h2><i class="fas fa-exclamation-triangle" style="color:var(--red);"></i> Delete Student</h2>
    <p style="margin:16px 0;font-size:1rem;">Are you sure you want to permanently delete <strong>${name}</strong>?</p>
    <p style="color:var(--red);font-size:0.85rem;"><i class="fas fa-warning"></i> This will remove their account, attendance records, and all gate pass history. This cannot be undone.</p>
    <div class="modal-actions"><button class="btn-action" style="background:var(--glass);border:1px solid var(--glass-border);" onclick="closeModal()">Cancel</button><button class="btn-action btn-red" onclick="deleteStudent(${id})"><i class="fas fa-trash"></i> Delete Permanently</button></div>`;
  openModal();
}

async function deleteStudent(id) {
  try {
    await api(`/api/warden/students/${id}`, { method: 'DELETE' });
    closeModal(); toast('Student deleted permanently', 'success');
    loadWardenAll();
  } catch (err) { toast(err.message, 'error'); }
}

// ─── Hostel Filters ──────────────────────────────────────────
let hostelFiltersLoaded = false;
async function loadHostelFilters() {
  if (hostelFiltersLoaded) return;
  try {
    const hostels = await api('/api/hostels');
    const sel = document.getElementById('w-hostel-filter');
    hostels.forEach(h => { const o = document.createElement('option'); o.value = h; o.textContent = h; sel.appendChild(o); });
    hostelFiltersLoaded = true;
  } catch {}
}

// ─── Modal ───────────────────────────────────────────────────
function openModal() { document.getElementById('modal-overlay').style.display = 'flex'; }
function closeModal(e) { if (e && e.target !== e.currentTarget) return; document.getElementById('modal-overlay').style.display = 'none'; }

// ─── Helpers ─────────────────────────────────────────────────
function gv(id) { return document.getElementById(id)?.value || ''; }

// Password reveal
function togglePasswords() {
  const btn = document.getElementById('password-reveal-btn');
  const details = document.getElementById('password-details');
  if (details.style.display === 'none') {
    details.style.display = 'block';
    btn.innerHTML = '<i class="fas fa-lock"></i> Hide Passwords';
    btn.classList.add('active');
  } else {
    details.style.display = 'none';
    btn.innerHTML = '<i class="fas fa-key"></i> Show Passwords';
    btn.classList.remove('active');
  }
}
function fmtDT(dt) {
  if (!dt) return 'N/A';
  try { const [d, t] = dt.split(' '); return fmtDate(d) + ' — ' + fmtTime(t); } catch { return dt; }
}
function fmtDate(d) { try { const [y,m,dd] = d.split('-'); const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${dd} ${months[parseInt(m)-1]} ${y}`; } catch { return d; } }
function extractTime(t) {
  if (!t) return '';
  // Handle "YYYY-MM-DD HH:MM" format - extract just the time part
  if (typeof t === 'string' && t.includes(' ')) return t.split(' ').pop();
  return t;
}
function fmtTime(t) {
  if (!t) return '';
  t = extractTime(t);
  try {
    const parts = String(t).split(':');
    const hr = parseInt(parts[0]);
    const mn = parts[1] || '00';
    if (isNaN(hr)) return t;
    return `${hr % 12 || 12}:${mn} ${hr >= 12 ? 'PM' : 'AM'}`;
  } catch { return t; }
}
function calcDur(co) {
  if (!co) return 'N/A';
  try {
    const diff = Math.floor((Date.now() - new Date(co.replace(' ','T')).getTime()) / 60000);
    const h = Math.floor(diff/60), m = diff%60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  } catch { return 'N/A'; }
}

function handleAttendanceUpdate(data) {
  if (S.activeTab === 'student') loadStudentAttendance();
  if (S.activeTab === 'warden') loadWardenAttendance();
}

function handleAttendanceUpdateAll(data) {
  toast(`Attendance marked for ${data.count} students by Warden`, 'info');
  if (S.activeTab === 'student') loadStudentAttendance();
  if (S.activeTab === 'warden') loadWardenAttendance();
}

function handleAttendanceSettingsUpdate(data) {
  toast(`Attendance time changed to ${data.attendance_time}`, 'info');
  if (S.activeTab === 'student') loadStudentAttendance();
  if (S.activeTab === 'warden') loadWardenAttendance();
}

// ═══════════════════════════════════════════════════════════════
//  ATTENDANCE SYSTEM
// ═══════════════════════════════════════════════════════════════

// Student: Load attendance
async function loadStudentAttendance() {
  try {
    const data = await api('/api/attendance/student');
    const statusEl = document.getElementById('s-attendance-status');
    const btnEl = document.getElementById('s-attendance-btn');
    const infoEl = document.getElementById('s-attendance-info');
    const historyEl = document.getElementById('s-attendance-history');
    
    if (data.today) {
      if (data.today.status === 'present') {
        const byLabel = data.today.marked_by === 'self' ? 'Self' : 'Warden';
        statusEl.className = 'attendance-status present';
        statusEl.innerHTML = `<i class="fas fa-check-circle"></i> ✅ Present — Marked by ${byLabel} at ${fmtTime(data.today.time)}`;
      } else {
        statusEl.className = 'attendance-status absent';
        statusEl.innerHTML = `<i class="fas fa-times-circle"></i> ❌ Absent — Marked by Warden at ${fmtTime(data.today.time)}`;
      }
      btnEl.disabled = true;
      btnEl.innerHTML = '<i class="fas fa-check"></i> Already Marked';
      infoEl.textContent = '';
    } else {
      // Check current time vs attendance window
      const now = new Date();
      const [startH, startM] = (data.start_time || '21:00').split(':').map(Number);
      const [endH, endM] = (data.end_time || '22:00').split(':').map(Number);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      
      if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
        // Within window — can mark
        statusEl.className = 'attendance-status not-marked';
        statusEl.innerHTML = `<i class="fas fa-clock"></i> Attendance window is OPEN — Mark now!`;
        btnEl.disabled = false;
        btnEl.innerHTML = '<i class="fas fa-check-circle"></i> Mark My Attendance';
        btnEl.className = 'btn-attendance';
        infoEl.textContent = `Window: ${data.start_time} to ${data.end_time}`;
      } else if (currentMinutes < startMinutes) {
        // Before window
        const remaining = startMinutes - currentMinutes;
        const rH = Math.floor(remaining / 60);
        const rM = remaining % 60;
        statusEl.className = 'attendance-status locked';
        statusEl.innerHTML = `<i class="fas fa-lock"></i> Attendance opens at ${data.start_time}`;
        btnEl.disabled = true;
        btnEl.innerHTML = `<i class="fas fa-lock"></i> Opens at ${data.start_time}`;
        infoEl.textContent = `Window: ${data.start_time} to ${data.end_time} — Wait ${rH}h ${rM}m`;
      } else {
        // After window closed
        statusEl.className = 'attendance-status locked';
        statusEl.innerHTML = `<i class="fas fa-times-circle"></i> Attendance window closed at ${data.end_time}`;
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="fas fa-times-circle"></i> Window Closed';
        infoEl.textContent = `Window was: ${data.start_time} to ${data.end_time}`;
      }
    }
    
    // History
    if (data.history && data.history.length > 0) {
      let html = '<h4>Last 30 Days</h4>';
      data.history.forEach(h => {
        const byLabel = h.marked_by === 'self' ? '🧑 Self' : '👨‍💼 Warden';
        html += `<div class="attendance-day">
          <span class="day-date">${fmtDate(h.date)}</span>
          <span class="day-status ${h.status}">${h.status === 'present' ? '✓ Present' : '✗ Absent'} (${byLabel})</span>
        </div>`;
      });
      historyEl.innerHTML = html;
    } else {
      historyEl.innerHTML = '<h4>No attendance records yet</h4>';
    }
  } catch (err) {
    console.error('Load attendance error:', err);
  }
}

// Student: Mark attendance
async function markAttendance() {
  try {
    const data = await api('/api/attendance/mark', { method: 'POST' });
    toast('Attendance marked successfully! ✓', 'success');
    loadStudentAttendance();
  } catch (err) {
    toast(err.message || 'Failed to mark attendance', 'error');
  }
}

// Warden: Load attendance
async function loadWardenAttendance() {
  try {
    const dateInput = document.getElementById('w-attendance-date');
    const date = dateInput.value || new Date().toISOString().split('T')[0];
    if (!dateInput.value) dateInput.value = date;
    
    const data = await api(`/api/attendance/warden?date=${date}`);
    
    // Set attendance time inputs
    document.getElementById('w-attendance-start').value = data.start_time || '21:00';
    document.getElementById('w-attendance-end').value = data.end_time || '22:00';
    
    // Stats
    const marked = data.attendance.length;
    const present = data.attendance.filter(a => a.status === 'present').length;
    const absent = data.attendance.filter(a => a.status === 'absent').length;
    const notMarked = data.all_students.length - marked;
    const total = data.all_students.length;
    
    document.getElementById('w-attendance-stats').innerHTML = `
      <div class="att-stat total"><div class="att-val">${total}</div><div class="att-label">Total Students</div></div>
      <div class="att-stat present"><div class="att-val">${present}</div><div class="att-label">✓ Present</div></div>
      <div class="att-stat absent"><div class="att-val">${absent + notMarked}</div><div class="att-label">✗ Absent / Not Marked</div></div>
    `;
    
    // Build attendance map
    const attMap = {};
    data.attendance.forEach(a => { attMap[a.student_id] = a; });
    
    // Table
    const tbody = document.getElementById('w-attendance-tbody');
    tbody.innerHTML = data.all_students.map(s => {
      const att = attMap[s.id];
      const isMarked = !!att;
      const status = isMarked ? att.status : 'not-marked';
      let statusLabel, statusClass;
      if (!isMarked) {
        statusLabel = '— Not Marked';
        statusClass = 'not-marked';
      } else if (att.status === 'present') {
        statusLabel = '✓ Present';
        statusClass = 'present';
      } else {
        statusLabel = '✗ Absent';
        statusClass = 'absent';
      }
      const markedBy = isMarked ? (att.marked_by === 'self' ? '🧑 Self' : '👨‍💼 Warden') : '—';
      return `<tr>
        <td><strong>${s.name}</strong></td>
        <td>${s.enrollment_no}</td>
        <td>${s.hostel_name}</td>
        <td>${s.room_no}</td>
        <td><span class="day-status ${statusClass}" style="padding:4px 12px;border-radius:12px;font-size:0.8rem;">${statusLabel}</span></td>
        <td>${isMarked ? fmtTime(att.time) : '—'}</td>
        <td style="font-size:0.8rem;">${markedBy}</td>
        <td>
          <button class="table-btn view" onclick="wardenMarkAttendance(${s.id},'present')" title="Mark Present"><i class="fas fa-check"></i></button>
          <button class="table-btn del" onclick="wardenMarkAttendance(${s.id},'absent')" title="Mark Absent"><i class="fas fa-times"></i></button>
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error('Load warden attendance error:', err);
  }
}

// Warden: Mark single student attendance
async function wardenMarkAttendance(studentId, status) {
  try {
    const date = document.getElementById('w-attendance-date').value || new Date().toISOString().split('T')[0];
    await api('/api/attendance/warden/mark', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, date, status })
    });
    toast(`Attendance marked: ${status}`, 'success');
    loadWardenAttendance();
  } catch (err) {
    toast(err.message || 'Failed to mark attendance', 'error');
  }
}

// Warden: Mark all students present
async function markAllAttendance() {
  if (!confirm('Mark all students as present for the selected date?')) return;
  try {
    const date = document.getElementById('w-attendance-date').value || new Date().toISOString().split('T')[0];
    const data = await api('/api/attendance/warden/mark-all', {
      method: 'POST',
      body: JSON.stringify({ date, status: 'present' })
    });
    toast(`Attendance marked for ${data.count} students! ✓`, 'success');
    loadWardenAttendance();
  } catch (err) {
    toast(err.message || 'Failed to mark all attendance', 'error');
  }
}

// Warden: Update attendance time window
async function updateAttendanceTime() {
  const startTime = document.getElementById('w-attendance-start').value;
  const endTime = document.getElementById('w-attendance-end').value;
  if (!startTime || !endTime) return;
  try {
    await api('/api/attendance/settings', {
      method: 'PUT',
      body: JSON.stringify({ start_time: startTime, end_time: endTime })
    });
    toast(`Attendance window set to ${startTime} - ${endTime}`, 'success');
    // Reload student attendance if active
    if (S.activeTab === 'student') loadStudentAttendance();
  } catch (err) {
    toast(err.message || 'Failed to update time', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
(function init() {
  if (S.token && S.user) {
    connectSocket();
    enterDashboard();
  } else {
    showView('view-login');
  }
})();

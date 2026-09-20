@echo off
echo.
echo  ============================================
echo   Hostel Management System - Windows Setup
echo  ============================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Node.js is not installed!
    echo  Download from: https://nodejs.org/
    pause
    exit /b 1
)

echo  [✓] Node.js found:
node --version
echo.

REM Install dependencies
echo  [1/2] Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] npm install failed!
    pause
    exit /b 1
)
echo  [✓] Dependencies installed
echo.

REM Get local IP
echo  [2/2] Finding your IP address...
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
)
set IP=%IP: =%
echo  Your PC IP: %IP%
echo.
echo  ============================================
echo   Access the system:
echo   ------------------------------------------
echo   On this PC:   http://localhost:3000
echo   On phone:     http://%IP%:3000
echo   ============================================
echo.
echo  Default Logins:
echo   Student:    22cs101 / student123
echo   Gate Pass:  gatepass / gatepass123
echo   Warden:     warden / warden123
echo.

REM Add firewall rule
echo  [!] Adding Windows Firewall rule...
netsh advfirewall firewall add rule name="HMS-Server" dir=in action=allow protocol=TCP localport=3000 >nul 2>nul
echo  [✓] Firewall rule added
echo.

REM Start server
echo  Starting server...
echo  Press Ctrl+C to stop
echo  ============================================
echo.
node server.js
pause

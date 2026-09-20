#!/bin/bash

echo ""
echo "  ============================================"
echo "   Hostel Management System - Setup"
echo "  ============================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "  [ERROR] Node.js is not installed!"
    echo "  Download from: https://nodejs.org/"
    exit 1
fi

echo "  [✓] Node.js found: $(node --version)"
echo ""

# Install dependencies
echo "  [1/3] Installing dependencies..."
npm install
echo "  [✓] Dependencies installed"
echo ""

# Get local IP
echo "  [2/3] Finding your IP address..."
OS=$(uname -s)
if [[ "$OS" == "Darwin" ]]; then
    IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "unknown")
else
    IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown")
fi

echo "  Your IP: $IP"
echo ""

# Firewall hint
echo "  [3/3] Firewall setup:"
if [[ "$OS" == "Darwin" ]]; then
    echo "  macOS: System Preferences → Security → Firewall → Allow Node"
elif [[ "$OS" == "Linux" ]]; then
    echo "  Linux: sudo ufw allow 3000/tcp"
fi
echo ""

echo "  ============================================"
echo "   Access the system:"
echo "  --------------------------------------------"
echo "   This device: http://localhost:3000"
echo "   Phone/Other: http://$IP:3000"
echo "  ============================================"
echo ""
echo "  Default Logins:"
echo "   Student:    22cs101 / student123"
echo "   Gate Pass:  gatepass / gatepass123"
echo "   Warden:     warden / warden123"
echo ""
echo "  Starting server..."
echo "  Press Ctrl+C to stop"
echo "  ============================================"
echo ""

node server.js

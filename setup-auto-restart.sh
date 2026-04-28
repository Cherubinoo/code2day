#!/bin/bash

# Setup auto-restart for Code2Day services
# Run with sudo

set -e

SYSTEMD_DIR="/etc/systemd/system"
DEPLOY_DIR="/home/administrator/Desktop/doc_judge/judge0"

if [[ $EUID -ne 0 ]]; then
    echo "❌ This script must be run with sudo"
    exit 1
fi

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║              Setting up Auto-Restart Services                               ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Create systemd service for docker-compose
echo "📝 Creating systemd service: code2day-docker-compose.service..."

cat > "$SYSTEMD_DIR/code2day-docker-compose.service" << 'EOF'
[Unit]
Description=Code2Day Docker Compose Services
After=docker.service
Requires=docker.service
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
WorkingDirectory=/home/administrator/Desktop/doc_judge/judge0
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=/usr/bin/docker-compose up
ExecStop=/usr/bin/docker-compose down
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "✓ Service file created"
echo ""

# Reload systemd
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload
echo "✓ Systemd reloaded"
echo ""

# Enable service
echo "⚙️  Enabling service..."
systemctl enable code2day-docker-compose.service
echo "✓ Service enabled"
echo ""

# Start service
echo "🚀 Starting service..."
systemctl start code2day-docker-compose.service
sleep 3
echo "✓ Service started"
echo ""

# Check status
echo "📊 Service status:"
systemctl status code2day-docker-compose.service
echo ""

# Show logs
echo "📋 Recent logs:"
journalctl -u code2day-docker-compose.service -n 20
echo ""

echo "✅ Auto-restart setup complete!"
echo ""
echo "🔧 Useful commands:"
echo "   • Status: sudo systemctl status code2day-docker-compose.service"
echo "   • Logs: sudo journalctl -u code2day-docker-compose.service -f"
echo "   • Restart: sudo systemctl restart code2day-docker-compose.service"
echo "   • Stop: sudo systemctl stop code2day-docker-compose.service"
echo "   • Disable: sudo systemctl disable code2day-docker-compose.service"
echo ""

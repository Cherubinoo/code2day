#!/bin/bash

# Production Deployment Script
# Deploy frontend on port 5001, backend on port 8000, and code2day.ramcoad.com

set -e

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║              Code2Day Production Deployment Script                          ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DEPLOY_DIR="/home/administrator/Desktop/doc_judge/judge0"
SYSTEMD_DIR="/etc/systemd/system"

# Check if running as root for systemd setup
if [[ $EUID -ne 0 ]]; then
    echo -e "${YELLOW}⚠ This script should be run as root for systemd service creation.${NC}"
    echo -e "${YELLOW}  Continuing without systemd setup...${NC}"
    echo ""
fi

# Step 1: Stop existing containers
echo -e "${BLUE}[1/7] Stopping existing containers...${NC}"
cd "$DEPLOY_DIR"
docker-compose down 2>/dev/null || true
echo -e "${GREEN}✓ Containers stopped${NC}"
echo ""

# Step 2: Build images
echo -e "${BLUE}[2/7] Building Docker images...${NC}"
docker-compose build --no-cache
echo -e "${GREEN}✓ Images built successfully${NC}"
echo ""

# Step 3: Start services
echo -e "${BLUE}[3/7] Starting services...${NC}"
docker-compose up -d
echo -e "${GREEN}✓ Services started${NC}"
echo ""

# Step 4: Wait for services to be healthy
echo -e "${BLUE}[4/7] Waiting for services to be healthy...${NC}"
sleep 10
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -f http://localhost:8000 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is healthy${NC}"
        break
    fi
    attempt=$((attempt + 1))
    if [ $attempt -lt $max_attempts ]; then
        echo "  Waiting for backend... ($attempt/$max_attempts)"
        sleep 2
    fi
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}✗ Backend failed to start${NC}"
    exit 1
fi
echo ""

# Step 5: Setup systemd services
echo -e "${BLUE}[5/7] Setting up systemd services...${NC}"
if [[ $EUID -eq 0 ]]; then
    cat > "$SYSTEMD_DIR/code2day-docker-compose.service" << 'EOF'
[Unit]
Description=Code2Day Docker Compose Services
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/home/administrator/Desktop/doc_judge/judge0
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=/usr/bin/docker-compose up
ExecStop=/usr/bin/docker-compose down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable code2day-docker-compose.service
    echo -e "${GREEN}✓ Systemd service created and enabled${NC}"
else
    echo -e "${YELLOW}⚠ Skipping systemd setup (run as root to enable auto-restart)${NC}"
fi
echo ""

# Step 6: Setup Nginx reverse proxy
echo -e "${BLUE}[6/7] Setting up Nginx reverse proxy...${NC}"
if command -v nginx &> /dev/null; then
    if [[ $EUID -eq 0 ]]; then
        cp "$DEPLOY_DIR/nginx.conf" /etc/nginx/sites-available/code2day.conf
        ln -sf /etc/nginx/sites-available/code2day.conf /etc/nginx/sites-enabled/code2day.conf
        rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
        nginx -t && systemctl restart nginx
        echo -e "${GREEN}✓ Nginx configured${NC}"
    else
        echo -e "${YELLOW}⚠ Nginx setup requires root privileges${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Nginx not installed. Install with: sudo apt-get install nginx${NC}"
fi
echo ""

# Step 6b: Reset all user passwords (forces first-login on next access)
echo -e "${BLUE}[6b/7] Resetting all user passwords...${NC}"
docker-compose exec -T backend python manage.py truncate_passwords --exclude-superusers
echo ""

# Step 7: Verify deployment
echo -e "${BLUE}[7/7] Verifying deployment...${NC}"
echo ""
echo "Service Status:"
docker-compose ps
echo ""

# Test endpoints
echo "Testing endpoints..."
echo -n "  Backend (8000): "
if curl -s http://localhost:8000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

echo -n "  Frontend (5001): "
if curl -s http://localhost:5001 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

echo -n "  Judge0 (2358): "
if curl -s http://localhost:2358 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                     Deployment Complete!                                    ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "📍 Access URLs:"
echo "   • Frontend: http://localhost:5001"
echo "   • Backend: http://localhost:8000"
echo "   • Domain: http://code2day.ramcoad.com (requires DNS/hosts setup)"
echo "   • Judge0: http://localhost:2358"
echo ""
echo "🔧 Useful Commands:"
echo "   • View logs: docker-compose logs -f"
echo "   • Restart services: docker-compose restart"
echo "   • Stop services: docker-compose down"
echo "   • Service status: systemctl status code2day-docker-compose.service"
echo "   • View systemd logs: journalctl -u code2day-docker-compose.service -f"
echo ""

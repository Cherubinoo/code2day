#!/bin/bash

# Code2Day Deployment Fix Script
# This script fixes the deployment issues with code2day.ramcoad.com

set -e

echo "=========================================="
echo "Code2Day Deployment Fix"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the current directory
CURRENT_DIR=$(pwd)
BACKEND_DIR="$CURRENT_DIR/backend"
FRONTEND_DIR="$CURRENT_DIR/frontend"

echo -e "${YELLOW}Current directory: $CURRENT_DIR${NC}"

# Step 1: Fix Nginx configuration
echo -e "\n${YELLOW}Step 1: Fixing Nginx configuration...${NC}"

sudo tee /etc/nginx/sites-available/code2day.ramcoad.com > /dev/null <<'EOF'
# HTTP redirect to HTTPS
server {
    listen 80;
    server_name code2day.ramcoad.com;
    return 301 https://$host$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name code2day.ramcoad.com;

    # SSL certificate
    ssl_certificate /etc/letsencrypt/live/code2day.ramcoad.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/code2day.ramcoad.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Frontend - serve static files
    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Judge0 API
    location /judge0 {
        proxy_pass http://127.0.0.1:2358;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

echo -e "${GREEN}✓ Nginx configuration updated${NC}"

# Step 2: Fix backend systemd service
echo -e "\n${YELLOW}Step 2: Fixing backend systemd service...${NC}"

sudo tee /etc/systemd/system/code2day-backend.service > /dev/null <<EOF
[Unit]
Description=Code2Day Django Backend
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=administrator
WorkingDirectory=$BACKEND_DIR
EnvironmentFile=$BACKEND_DIR/.env
ExecStart=$BACKEND_DIR/venv/bin/gunicorn \\
    --workers 3 \\
    --bind 127.0.0.1:8000 \\
    --timeout 60 \\
    code2day.wsgi:application
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓ Backend service configuration updated${NC}"

# Step 3: Fix frontend systemd service
echo -e "\n${YELLOW}Step 3: Fixing frontend systemd service...${NC}"

sudo tee /etc/systemd/system/code2day-frontend.service > /dev/null <<EOF
[Unit]
Description=Code2Day Vite Frontend
After=network.target

[Service]
Type=simple
User=administrator
WorkingDirectory=$FRONTEND_DIR
ExecStart=/usr/bin/npm run preview -- --port 5001 --host 0.0.0.0
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓ Frontend service configuration updated${NC}"

# Step 4: Fix Judge0 systemd service
echo -e "\n${YELLOW}Step 4: Fixing Judge0 systemd service...${NC}"

sudo tee /etc/systemd/system/code2day-judge0.service > /dev/null <<EOF
[Unit]
Description=Judge0 Code Execution Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$CURRENT_DIR
ExecStart=/usr/bin/docker compose up -d judge0-server judge0-workers judge0-db judge0-redis
ExecStop=/usr/bin/docker compose down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓ Judge0 service configuration updated${NC}"

# Step 5: Reload systemd
echo -e "\n${YELLOW}Step 5: Reloading systemd...${NC}"
sudo systemctl daemon-reload
echo -e "${GREEN}✓ Systemd reloaded${NC}"

# Step 6: Start Docker services
echo -e "\n${YELLOW}Step 6: Starting Docker services...${NC}"
docker compose up -d
echo -e "${GREEN}✓ Docker services started${NC}"

# Step 7: Wait for services to be ready
echo -e "\n${YELLOW}Step 7: Waiting for services to be ready...${NC}"
sleep 5

# Step 8: Start systemd services
echo -e "\n${YELLOW}Step 8: Starting systemd services...${NC}"
sudo systemctl start code2day-backend
sudo systemctl start code2day-frontend
echo -e "${GREEN}✓ Systemd services started${NC}"

# Step 9: Enable services for auto-start
echo -e "\n${YELLOW}Step 9: Enabling services for auto-start...${NC}"
sudo systemctl enable code2day-backend
sudo systemctl enable code2day-frontend
sudo systemctl enable code2day-judge0
echo -e "${GREEN}✓ Services enabled${NC}"

# Step 10: Restart Nginx
echo -e "\n${YELLOW}Step 10: Restarting Nginx...${NC}"
sudo systemctl restart nginx
echo -e "${GREEN}✓ Nginx restarted${NC}"

# Step 11: Check service status
echo -e "\n${YELLOW}Step 11: Checking service status...${NC}"
echo ""
echo "Docker containers:"
docker compose ps
echo ""
echo "Backend service:"
sudo systemctl status code2day-backend --no-pager -l | head -15
echo ""
echo "Frontend service:"
sudo systemctl status code2day-frontend --no-pager -l | head -15
echo ""
echo "Nginx service:"
sudo systemctl status nginx --no-pager -l | head -10

# Step 12: Test endpoints
echo -e "\n${YELLOW}Step 12: Testing endpoints...${NC}"
echo ""
echo "Testing HTTP redirect:"
curl -I http://code2day.ramcoad.com 2>&1 | grep -E "HTTP|Location" || true
echo ""
echo "Testing HTTPS:"
curl -I https://code2day.ramcoad.com 2>&1 | grep -E "HTTP|Server" || true

echo ""
echo -e "${GREEN}=========================================="
echo -e "Deployment fix completed!"
echo -e "==========================================${NC}"
echo ""
echo "Access your application at: https://code2day.ramcoad.com"
echo ""
echo "To check logs:"
echo "  Backend:  sudo journalctl -u code2day-backend -f"
echo "  Frontend: sudo journalctl -u code2day-frontend -f"
echo "  Docker:   docker compose logs -f"
echo ""

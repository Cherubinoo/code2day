#!/bin/bash
# ============================================================
# rebuild-judge0.sh
# Full teardown → rebuild → deploy for Code2Day
#
# What this does:
#   1. Stops systemd service + kills all old containers
#   2. Removes old images for a clean build
#   3. Builds custom Judge0 image (with Python/JS/C++ packages)
#   4. Starts all Docker services (judge0, backend, frontend)
#   5. Installs & configures host Nginx as reverse proxy
#   6. Updates systemd service for auto-restart on reboot
#
# Run as root:  sudo bash rebuild-judge0.sh
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

DEPLOY_DIR="/home/administrator/Desktop/doc_judge/judge0"
DOCKER="/snap/bin/docker"
PUBLIC_IP="210.212.255.194"
DOMAIN="code2day.ramcoad.com"

if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}✗ Please run as root: sudo bash rebuild-judge0.sh${NC}"
    exit 1
fi

cd "$DEPLOY_DIR"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║        Code2Day — Full Rebuild & Deploy to ${DOMAIN}  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Stop systemd service ─────────────────────────────────────────────
echo -e "${BLUE}[1/8] Stopping systemd service...${NC}"
systemctl stop docker-compose-judge0.service 2>/dev/null || true
echo -e "${GREEN}✓ Done${NC}"

# ── Step 2: Force-kill and remove ALL containers ──────────────────────────────
echo -e "${BLUE}[2/8] Removing all containers...${NC}"
$DOCKER compose down --volumes --remove-orphans 2>/dev/null || true

for name in code2day-backend code2day-frontend judge0-server judge0-workers \
            judge0-db judge0-redis judge0-db-1 judge0-redis-1; do
    if $DOCKER inspect "$name" &>/dev/null; then
        PID=$($DOCKER inspect "$name" --format '{{.State.Pid}}' 2>/dev/null || echo "")
        [ -n "$PID" ] && [ "$PID" != "0" ] && kill -9 "$PID" 2>/dev/null || true
        $DOCKER rm -f "$name" 2>/dev/null || true
        echo "  Removed: $name"
    fi
done

$DOCKER network prune -f 2>/dev/null || true
echo -e "${GREEN}✓ All containers removed${NC}"

# ── Step 3: Remove old images for clean build ─────────────────────────────────
echo -e "${BLUE}[3/8] Removing old images...${NC}"
$DOCKER rmi -f code2day-judge0:latest code2day-backend:latest code2day-frontend:latest 2>/dev/null || true
echo -e "${GREEN}✓ Old images removed${NC}"

# ── Step 4: Build custom Judge0 image ────────────────────────────────────────
echo -e "${BLUE}[4/8] Building custom Judge0 image...${NC}"
echo "      Packages: numpy scipy pandas sympy sortedcontainers"
echo "                more-itertools networkx bitarray heapq_max pyparsing"
echo "                lodash underscore libboost-all-dev"
echo ""
$DOCKER compose build --no-cache judge0-server
echo -e "${GREEN}✓ Judge0 image built${NC}"

# ── Step 5: Build backend + frontend images ───────────────────────────────────
echo -e "${BLUE}[5/8] Building backend and frontend images...${NC}"
$DOCKER compose build --no-cache backend frontend
echo -e "${GREEN}✓ Backend and frontend images built${NC}"

# ── Step 6: Start all Docker services ────────────────────────────────────────
echo -e "${BLUE}[6/8] Starting all services...${NC}"
$DOCKER compose up -d
echo -e "${GREEN}✓ All services started${NC}"

# Wait for Judge0
echo "  Waiting for Judge0 on port 2358..."
for i in $(seq 1 60); do
    if curl -sf http://localhost:2358/system_info > /dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Judge0 is ready${NC}"
        break
    fi
    [ $i -eq 60 ] && echo -e "${YELLOW}  ⚠ Judge0 not responding yet — check: $DOCKER logs judge0-server${NC}"
    sleep 5
done

# Wait for backend
echo "  Waiting for backend on port 8000..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/api/health/ > /dev/null 2>&1 || \
       curl -sf http://localhost:8000/ > /dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Backend is ready${NC}"
        break
    fi
    [ $i -eq 30 ] && echo -e "${YELLOW}  ⚠ Backend not responding yet — check: $DOCKER logs code2day-backend${NC}"
    sleep 3
done

# Run Django migrations (fresh DB on every clean deploy)
echo "  Running Django migrations..."
$DOCKER exec code2day-backend python manage.py migrate --noinput 2>&1 | tail -5
echo -e "${GREEN}  ✓ Migrations applied${NC}"

# ── Step 7: Install and configure host Nginx ──────────────────────────────────
echo -e "${BLUE}[7/8] Configuring Nginx reverse proxy...${NC}"

# Install nginx if not present
if ! command -v nginx &>/dev/null; then
    echo "  Installing nginx..."
    apt-get update -qq && apt-get install -y nginx
fi

# Remove any conflicting configs we may have added before
rm -f /etc/nginx/sites-enabled/code2day.conf
rm -f /etc/nginx/sites-available/code2day.conf

# Write the canonical config (HTTPS with Let's Encrypt)
cp "$DEPLOY_DIR/nginx.conf" /etc/nginx/sites-available/code2day.ramcoad.com

# Enable it (idempotent)
ln -sf /etc/nginx/sites-available/code2day.ramcoad.com \
       /etc/nginx/sites-enabled/code2day.ramcoad.com

# Remove default site if present
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Test and reload
nginx -t
systemctl enable nginx
systemctl reload nginx
echo -e "${GREEN}✓ Nginx configured and reloaded${NC}"

# ── Step 8: Update systemd service ───────────────────────────────────────────
echo -e "${BLUE}[8/8] Updating systemd auto-restart service...${NC}"
cat > /etc/systemd/system/docker-compose-judge0.service << EOF
[Unit]
Description=Code2Day Docker Compose Service
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${DEPLOY_DIR}
Environment=PATH=/snap/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/snap/bin/docker compose up -d
ExecStop=/snap/bin/docker compose down
TimeoutStartSec=300
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable docker-compose-judge0.service
echo -e "${GREEN}✓ Systemd service updated and enabled${NC}"

# ── Final status ──────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  Deployment Complete!                        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Container status:"
$DOCKER compose ps
echo ""
echo -e "${CYAN}Access URLs:${NC}"
echo "  Domain:      http://${DOMAIN}"
echo "  Public IP:   http://${PUBLIC_IP}"
echo "  Backend:     http://${PUBLIC_IP}:8000  (direct)"
echo "  Frontend:    http://${PUBLIC_IP}:5001  (direct)"
echo "  Judge0 API:  http://${PUBLIC_IP}:2358  (internal)"
echo ""
echo -e "${CYAN}Useful commands:${NC}"
echo "  $DOCKER compose ps"
echo "  $DOCKER compose logs -f judge0-server"
echo "  $DOCKER compose logs -f judge0-workers"
echo "  $DOCKER compose logs -f code2day-backend"
echo "  $DOCKER compose logs -f code2day-frontend"
echo "  systemctl status docker-compose-judge0.service"
echo "  systemctl status nginx"
echo ""
echo -e "${CYAN}Verify Judge0:${NC}"
echo "  curl http://localhost:2358/system_info"
echo ""

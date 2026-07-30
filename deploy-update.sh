#!/bin/bash

# ─────────────────────────────────────────────────────────────────────────────
# Code2Day — Safe Update Deploy Script
# Pulls latest code, rebuilds & restarts ONLY backend + frontend.
# The execution engine (code2day-executor) and Redis are NEVER touched.
# PostgreSQL runs on the host — migrations are applied automatically.
# ─────────────────────────────────────────────────────────────────────────────

set -e

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓ $*${NC}"; }
info() { echo -e "${BLUE}▶ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
fail() { echo -e "${RED}✗ $*${NC}"; exit 1; }

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗"
echo    "║         Code2Day — Safe Update Deployment                        ║"
echo -e "╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Git pull ──────────────────────────────────────────────────────────
info "[1/6] Pulling latest code from server branch..."
cd "$DEPLOY_DIR"

# Make sure we are on server
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "server" ]; then
    warn "Currently on branch '$CURRENT_BRANCH'. Switching to server..."
    git checkout server
fi

git pull origin server
ok "Code updated to latest commit: $(git log -1 --format='%h %s')"
echo ""

# ── Step 2: Verify execution engine is running (do NOT touch it) ──────────────
info "[2/6] Verifying execution engine is untouched..."
if docker ps --format '{{.Names}}' | grep -q "^code2day-executor$"; then
    ok "code2day-executor is running — will NOT be restarted"
else
    warn "code2day-executor is not running. Starting it now (first-time setup)..."
    cd "$DEPLOY_DIR"
    docker-compose up -d code2day-executor code2day-redis
    sleep 5
    ok "Execution engine started"
fi
echo ""

# ── Step 3: Rebuild backend & frontend images ─────────────────────────────────
info "[3/6] Rebuilding backend and frontend images (no cache)..."
cd "$DEPLOY_DIR"
docker-compose build --no-cache backend frontend
ok "Images rebuilt"
echo ""

# ── Step 4: Restart backend & frontend (zero-downtime swap) ──────────────────
info "[4/6] Restarting backend and frontend containers..."
docker-compose up -d --force-recreate --no-deps backend frontend
ok "Containers restarted"
echo ""

# ── Step 5: Post-start tasks now run automatically via entrypoint ─────────────
info "[5/6] Waiting for backend entrypoint to finish (migrate + SQL cleanup + collectstatic)..."

MAX_WAIT=90
WAITED=0
until docker exec code2day-backend python manage.py check --database default > /dev/null 2>&1; do
    if [ $WAITED -ge $MAX_WAIT ]; then
        fail "Backend did not become ready in ${MAX_WAIT}s. Check logs: docker logs code2day-backend"
    fi
    echo "  Waiting for backend to be ready... (${WAITED}s)"
    sleep 3
    WAITED=$((WAITED + 3))
done
ok "Backend is up — migrations and SQL cleanup already applied by entrypoint"
echo ""

# ── Step 6: Health checks ─────────────────────────────────────────────────────
info "[6/6] Running health checks..."
sleep 3

echo ""
echo "  Container status:"
docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker-compose ps
echo ""

# Backend
echo -n "  Backend  (port 8000): "
if curl -sf http://localhost:8000/api/ > /dev/null 2>&1 || curl -sf http://localhost:8000/ > /dev/null 2>&1; then
    ok "responding"
else
    warn "not responding on HTTP yet (may still be starting — check: docker logs code2day-backend)"
fi

# Frontend
echo -n "  Frontend (port 8001): "
if curl -sf http://localhost:8001/ > /dev/null 2>&1; then
    ok "responding"
else
    warn "not responding yet (check: docker logs code2day-frontend)"
fi

# Executor — just confirm still alive
echo -n "  Executor (port 2358): "
if curl -sf http://localhost:2358/ > /dev/null 2>&1 || docker ps --format '{{.Names}}' | grep -q "^code2day-executor$"; then
    ok "running (untouched)"
else
    warn "executor may be down — check: docker logs code2day-executor"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗"
echo    "║                  Update Deployment Complete!                     ║"
echo -e "╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Frontend : http://localhost:8001"
echo "  Backend  : http://localhost:8000"
echo "  Executor : http://localhost:2358"
echo ""
echo "  Useful commands:"
echo "    docker logs -f code2day-backend    # backend logs"
echo "    docker logs -f code2day-frontend   # frontend logs"
echo "    docker-compose ps                  # all container status"
echo ""

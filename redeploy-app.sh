#!/bin/bash

# Redeploy Frontend and Backend (Keep Judge0 Running)
# This script rebuilds and restarts only the backend and frontend containers
# while keeping Judge0 services running without interruption

set -e

echo "════════════════════════════════════════════════════════════════"
echo "  Code2Day - Redeploy Frontend & Backend (Keep Judge0 Running)"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}⚠️  This script should be run as root for proper permissions${NC}"
    echo "   Run: sudo bash redeploy-app.sh"
    exit 1
fi

echo -e "${BLUE}📋 Deployment Plan:${NC}"
echo "   ✓ Keep Judge0 containers running"
echo "   ✓ Rebuild backend Docker image"
echo "   ✓ Rebuild frontend Docker image"
echo "   ✓ Restart backend container"
echo "   ✓ Restart frontend container"
echo ""

# Step 1: Check current container status
echo -e "${BLUE}🔍 Checking current container status...${NC}"
docker-compose ps
echo ""

# Step 2: Build backend image
echo -e "${BLUE}🔨 Building backend Docker image...${NC}"
docker-compose build backend
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backend image built successfully${NC}"
else
    echo -e "${YELLOW}❌ Backend build failed${NC}"
    exit 1
fi
echo ""

# Step 3: Build frontend image
echo -e "${BLUE}🔨 Building frontend Docker image...${NC}"
docker-compose build frontend
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Frontend image built successfully${NC}"
else
    echo -e "${YELLOW}❌ Frontend build failed${NC}"
    exit 1
fi
echo ""

# Step 4: Stop and remove old backend container
echo -e "${BLUE}🛑 Stopping old backend container...${NC}"
docker-compose stop backend
docker-compose rm -f backend
echo -e "${GREEN}✅ Old backend container removed${NC}"
echo ""

# Step 5: Stop and remove old frontend container
echo -e "${BLUE}🛑 Stopping old frontend container...${NC}"
docker-compose stop frontend
docker-compose rm -f frontend
echo -e "${GREEN}✅ Old frontend container removed${NC}"
echo ""

# Step 6: Start new backend container
echo -e "${BLUE}🚀 Starting new backend container...${NC}"
docker-compose up -d backend
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backend container started${NC}"
else
    echo -e "${YELLOW}❌ Backend start failed${NC}"
    exit 1
fi
echo ""

# Step 7: Start new frontend container
echo -e "${BLUE}🚀 Starting new frontend container...${NC}"
docker-compose up -d frontend
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Frontend container started${NC}"
else
    echo -e "${YELLOW}❌ Frontend start failed${NC}"
    exit 1
fi
echo ""

# Step 8: Wait for services to be ready
echo -e "${BLUE}⏳ Waiting for services to be ready...${NC}"
sleep 5
echo ""

# Step 9: Check container status
echo -e "${BLUE}📊 Final container status:${NC}"
docker-compose ps
echo ""

# Step 10: Check backend health
echo -e "${BLUE}🏥 Checking backend health...${NC}"
BACKEND_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health/ || echo "000")
if [ "$BACKEND_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ Backend is healthy (HTTP 200)${NC}"
else
    echo -e "${YELLOW}⚠️  Backend health check returned: $BACKEND_HEALTH${NC}"
    echo "   Checking backend logs..."
    docker-compose logs --tail=20 backend
fi
echo ""

# Step 10b: Reset all user passwords (forces first-login on next access)
echo -e "${BLUE}🔐 Resetting all user passwords...${NC}"
docker-compose exec -T backend python manage.py truncate_passwords --exclude-superusers
echo ""

# Step 11: Check frontend
echo -e "${BLUE}🌐 Checking frontend...${NC}"
FRONTEND_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/ || echo "000")
if [ "$FRONTEND_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ Frontend is accessible (HTTP 200)${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend check returned: $FRONTEND_HEALTH${NC}"
    echo "   Checking frontend logs..."
    docker-compose logs --tail=20 frontend
fi
echo ""

# Step 12: Verify Judge0 is still running
echo -e "${BLUE}🔍 Verifying Judge0 services are still running...${NC}"
JUDGE0_STATUS=$(docker-compose ps judge0-server | grep -c "Up" || echo "0")
if [ "$JUDGE0_STATUS" -gt 0 ]; then
    echo -e "${GREEN}✅ Judge0 server is still running${NC}"
else
    echo -e "${YELLOW}⚠️  Judge0 server may not be running${NC}"
fi
echo ""

# Step 13: Test Judge0 connectivity
echo -e "${BLUE}🧪 Testing Judge0 connectivity...${NC}"
JUDGE0_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:2358/system_info || echo "000")
if [ "$JUDGE0_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ Judge0 is responding (HTTP 200)${NC}"
else
    echo -e "${YELLOW}⚠️  Judge0 check returned: $JUDGE0_HEALTH${NC}"
fi
echo ""

# Step 14: Restart Nginx to ensure routing is correct
echo -e "${BLUE}🔄 Restarting Nginx...${NC}"
systemctl restart nginx
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Nginx restarted successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Nginx restart had issues${NC}"
fi
echo ""

# Step 15: Show access URLs
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo -e "${BLUE}🌐 Access URLs:${NC}"
echo "   Frontend:  https://code2day.ramcoad.com"
echo "   Backend:   https://code2day.ramcoad.com/api/"
echo "   Judge0:    https://code2day.ramcoad.com/judge0/"
echo ""
echo "   Local Frontend:  http://localhost:8001"
echo "   Local Backend:   http://localhost:8000"
echo "   Local Judge0:    http://localhost:2358"
echo ""
echo -e "${BLUE}📊 Service Status:${NC}"
echo "   Backend:  $(docker-compose ps backend | grep -q 'Up' && echo '✅ Running' || echo '❌ Stopped')"
echo "   Frontend: $(docker-compose ps frontend | grep -q 'Up' && echo '✅ Running' || echo '❌ Stopped')"
echo "   Judge0:   $(docker-compose ps judge0-server | grep -q 'Up' && echo '✅ Running' || echo '❌ Stopped')"
echo ""
echo -e "${BLUE}📝 View Logs:${NC}"
echo "   Backend:  docker-compose logs -f backend"
echo "   Frontend: docker-compose logs -f frontend"
echo "   All:      docker-compose logs -f"
echo ""
echo -e "${BLUE}🔧 Useful Commands:${NC}"
echo "   Status:   docker-compose ps"
echo "   Restart:  docker-compose restart backend frontend"
echo "   Stop:     docker-compose stop backend frontend"
echo ""
echo "════════════════════════════════════════════════════════════════"

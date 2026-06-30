#!/bin/bash

# Full Deployment Script - Judge0, Backend, Frontend
# Deploys all services to code2day.ramcoad.com

set -e

echo "════════════════════════════════════════════════════════════════"
echo "  Code2Day - Full Deployment (Judge0 + Backend + Frontend)"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}⚠️  This script should be run as root${NC}"
    echo "   Run: sudo bash full-deploy.sh"
    exit 1
fi

echo -e "${BLUE}📋 Deployment Plan:${NC}"
echo "   1. Stop all existing containers"
echo "   2. Build Judge0 custom image"
echo "   3. Build backend image"
echo "   4. Build frontend image"
echo "   5. Start all services"
echo "   6. Verify deployment"
echo ""

read -p "Continue with deployment? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

# Step 1: Stop Nginx first to free up ports
echo -e "${BLUE}🛑 Stopping Nginx to free up ports...${NC}"
systemctl stop nginx
echo -e "${GREEN}✅ Nginx stopped${NC}"
echo ""

# Step 2: Stop all containers
echo -e "${BLUE}🛑 Stopping all containers...${NC}"
docker-compose down
echo -e "${GREEN}✅ All containers stopped${NC}"
echo ""

# Step 2: Build Judge0 custom image
echo -e "${BLUE}🔨 Building Judge0 custom image...${NC}"
docker-compose build judge0-server judge0-workers
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Judge0 image built successfully${NC}"
else
    echo -e "${RED}❌ Judge0 build failed${NC}"
    exit 1
fi
echo ""

# Step 3: Build backend image
echo -e "${BLUE}🔨 Building backend image...${NC}"
docker-compose build backend
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backend image built successfully${NC}"
else
    echo -e "${RED}❌ Backend build failed${NC}"
    exit 1
fi
echo ""

# Step 4: Build frontend image
echo -e "${BLUE}🔨 Building frontend image...${NC}"
docker-compose build frontend
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Frontend image built successfully${NC}"
else
    echo -e "${RED}❌ Frontend build failed${NC}"
    exit 1
fi
echo ""

# Step 5: Start all services
echo -e "${BLUE}🚀 Starting all services...${NC}"
docker-compose up -d
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ All services started${NC}"
else
    echo -e "${RED}❌ Service start failed${NC}"
    exit 1
fi
echo ""

# Step 6: Wait for services to be ready
echo -e "${BLUE}⏳ Waiting for services to initialize (30 seconds)...${NC}"
sleep 30
echo ""

# Step 7: Check container status
echo -e "${BLUE}📊 Container Status:${NC}"
docker-compose ps
echo ""

# Step 8: Check Judge0
echo -e "${BLUE}🧪 Testing Judge0...${NC}"
sleep 5
JUDGE0_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:2358/system_info || echo "000")
if [ "$JUDGE0_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ Judge0 is responding (HTTP 200)${NC}"
else
    echo -e "${YELLOW}⚠️  Judge0 check returned: $JUDGE0_HEALTH${NC}"
    echo "   Checking Judge0 logs..."
    docker-compose logs --tail=30 judge0-server
fi
echo ""

# Step 9: Check backend
echo -e "${BLUE}🏥 Testing Backend...${NC}"
BACKEND_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health/ || echo "000")
if [ "$BACKEND_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ Backend is healthy (HTTP 200)${NC}"
else
    echo -e "${YELLOW}⚠️  Backend check returned: $BACKEND_HEALTH${NC}"
    echo "   Checking backend logs..."
    docker-compose logs --tail=30 backend
fi
echo ""

# Step 9b: Reset all user passwords (forces first-login on next access)
echo -e "${BLUE}🔐 Resetting all user passwords...${NC}"
docker-compose exec -T backend python manage.py truncate_passwords --exclude-superusers
echo ""

# Step 10: Check frontend
echo -e "${BLUE}🌐 Testing Frontend...${NC}"
FRONTEND_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5001/ || echo "000")
if [ "$FRONTEND_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ Frontend is accessible (HTTP 200)${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend check returned: $FRONTEND_HEALTH${NC}"
    echo "   Checking frontend logs..."
    docker-compose logs --tail=30 frontend
fi
echo ""

# Step 11: Restart Nginx
echo -e "${BLUE}🔄 Restarting Nginx...${NC}"
systemctl restart nginx
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Nginx restarted successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Nginx restart had issues${NC}"
fi
echo ""

# Step 12: Test code execution
echo -e "${BLUE}🧪 Testing code execution...${NC}"
TEST_RESULT=$(curl -s -X POST http://localhost:2358/submissions \
  -H "Content-Type: application/json" \
  -d '{
    "source_code": "print(\"Hello from Code2Day\")",
    "language_id": 71,
    "stdin": ""
  }' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ ! -z "$TEST_RESULT" ]; then
    echo -e "${GREEN}✅ Code execution test submitted (Token: ${TEST_RESULT:0:20}...)${NC}"
    sleep 2
    EXEC_RESULT=$(curl -s "http://localhost:2358/submissions/$TEST_RESULT" | grep -o '"status":{"description":"[^"]*"' | cut -d'"' -f6)
    echo -e "${GREEN}   Execution status: $EXEC_RESULT${NC}"
else
    echo -e "${YELLOW}⚠️  Code execution test failed${NC}"
fi
echo ""

# Final Summary
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo -e "${BLUE}🌐 Access URLs:${NC}"
echo "   Production:  https://code2day.ramcoad.com"
echo "   Backend API: https://code2day.ramcoad.com/api/"
echo "   Judge0 API:  https://code2day.ramcoad.com/judge0/"
echo ""
echo "   Local Frontend:  http://localhost:5001"
echo "   Local Backend:   http://localhost:8000"
echo "   Local Judge0:    http://localhost:2358"
echo ""
echo -e "${BLUE}📊 Service Status:${NC}"
docker-compose ps | grep -E "judge0-server|judge0-workers|backend|frontend" | awk '{print "   " $1 ": " $7}'
echo ""
echo -e "${BLUE}📝 View Logs:${NC}"
echo "   All services:  docker-compose logs -f"
echo "   Backend only:  docker-compose logs -f backend"
echo "   Frontend only: docker-compose logs -f frontend"
echo "   Judge0 only:   docker-compose logs -f judge0-server judge0-workers"
echo ""
echo -e "${BLUE}🔧 Useful Commands:${NC}"
echo "   Status:   docker-compose ps"
echo "   Restart:  docker-compose restart"
echo "   Stop:     docker-compose down"
echo "   Logs:     docker-compose logs -f [service]"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN}🎉 Code2Day is now live at https://code2day.ramcoad.com${NC}"
echo "════════════════════════════════════════════════════════════════"

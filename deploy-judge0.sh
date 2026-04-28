#!/bin/bash

# Deploy Judge0 with Custom Packages
# This script builds and deploys Judge0 with pre-installed packages

set -e

echo "=========================================="
echo "Judge0 Custom Deployment Script"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker is running${NC}"
echo ""

# Stop existing containers (if any)
echo "Stopping existing Judge0 containers..."
docker-compose down 2>/dev/null || true
echo -e "${GREEN}✓ Stopped existing containers${NC}"
echo ""

# Build custom Judge0 image
echo "Building custom Judge0 image with packages..."
echo "This may take 5-10 minutes on first build..."
docker-compose build --no-cache

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Custom Judge0 image built successfully${NC}"
else
    echo -e "${RED}✗ Failed to build Judge0 image${NC}"
    exit 1
fi
echo ""

# Start services
echo "Starting Judge0 services..."
docker-compose up -d

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Judge0 services started${NC}"
else
    echo -e "${RED}✗ Failed to start Judge0 services${NC}"
    exit 1
fi
echo ""

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 10

# Check service health
echo "Checking service health..."
echo ""

# Check if containers are running
RUNNING_CONTAINERS=$(docker-compose ps --services --filter "status=running" | wc -l)
TOTAL_CONTAINERS=$(docker-compose ps --services | wc -l)

echo "Running containers: $RUNNING_CONTAINERS/$TOTAL_CONTAINERS"

if [ "$RUNNING_CONTAINERS" -eq "$TOTAL_CONTAINERS" ]; then
    echo -e "${GREEN}✓ All containers are running${NC}"
else
    echo -e "${YELLOW}⚠ Some containers are not running${NC}"
    docker-compose ps
fi
echo ""

# Test Judge0 API
echo "Testing Judge0 API..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:2358/system_info)

if [ "$RESPONSE" -eq 200 ]; then
    echo -e "${GREEN}✓ Judge0 API is responding${NC}"
    curl -s http://localhost:2358/system_info | python3 -m json.tool
else
    echo -e "${RED}✗ Judge0 API is not responding (HTTP $RESPONSE)${NC}"
fi
echo ""

# Test Python packages
echo "Testing Python packages..."
docker exec judge0-server python3 -c "import numpy; print('✓ numpy:', numpy.__version__)" 2>/dev/null || echo "✗ numpy not found"
docker exec judge0-server python3 -c "import pandas; print('✓ pandas:', pandas.__version__)" 2>/dev/null || echo "✗ pandas not found"
docker exec judge0-server python3 -c "import requests; print('✓ requests:', requests.__version__)" 2>/dev/null || echo "✗ requests not found"
docker exec judge0-server python3 -c "import scipy; print('✓ scipy:', scipy.__version__)" 2>/dev/null || echo "✗ scipy not found"
echo ""

# Test Node.js packages
echo "Testing Node.js packages..."
docker exec judge0-server node -e "console.log('✓ lodash:', require('lodash').VERSION)" 2>/dev/null || echo "✗ lodash not found"
docker exec judge0-server node -e "console.log('✓ axios:', require('axios').VERSION)" 2>/dev/null || echo "✗ axios not found"
echo ""

# Display logs
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Judge0 API: http://localhost:2358"
echo ""
echo "Useful commands:"
echo "  - View logs: docker-compose logs -f"
echo "  - Stop services: docker-compose down"
echo "  - Restart services: docker-compose restart"
echo "  - Check status: docker-compose ps"
echo ""
echo -e "${GREEN}Judge0 is ready to execute code with pre-installed packages!${NC}"

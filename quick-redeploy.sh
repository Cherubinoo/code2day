#!/bin/bash

# Quick deployment script for fast redeployment

set -e

cd /home/administrator/Desktop/doc_judge/judge0

echo "🔄 Redeploying services..."
echo ""

# Rebuild and restart
docker-compose down
docker-compose build
docker-compose up -d

echo ""
echo "✅ Redeployment complete!"
echo ""
echo "Status:"
docker-compose ps
echo ""
echo "URLs:"
echo "  • Frontend: http://localhost:5001"
echo "  • Backend: http://localhost:8000"
echo "  • Judge0: http://localhost:2358"

#!/bin/bash

# Build Custom Judge0 Image with Pre-installed Packages
# This script builds a custom Judge0 image without stopping current services

set -e  # Exit on error

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║          Building Custom Judge0 Image with Pre-installed Packages            ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
IMAGE_NAME="judge0-custom"
IMAGE_TAG="latest"
FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"

# Check if Dockerfile.custom exists
if [ ! -f "Dockerfile.custom" ]; then
    echo "❌ Error: Dockerfile.custom not found!"
    echo "Please ensure Dockerfile.custom is in the current directory."
    exit 1
fi

echo "📋 Build Configuration:"
echo "   Image Name: ${FULL_IMAGE_NAME}"
echo "   Dockerfile: Dockerfile.custom"
echo ""

# Check current Judge0 status
echo "📊 Current Judge0 Status:"
docker compose ps
echo ""

# Build the custom image
echo "🔨 Building custom Judge0 image..."
echo "   This may take 5-10 minutes depending on your internet speed."
echo ""

docker build \
    -f Dockerfile.custom \
    -t ${FULL_IMAGE_NAME} \
    --progress=plain \
    .

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Custom image built successfully!"
    echo ""
    
    # Show image details
    echo "📦 Image Details:"
    docker images ${IMAGE_NAME}
    echo ""
    
    # Create backup of current docker-compose.yml
    if [ -f "docker-compose.yml" ]; then
        BACKUP_FILE="docker-compose.yml.backup-$(date +%Y%m%d-%H%M%S)"
        cp docker-compose.yml "${BACKUP_FILE}"
        echo "💾 Backup created: ${BACKUP_FILE}"
        echo ""
    fi
    
    echo "╔══════════════════════════════════════════════════════════════════════════════╗"
    echo "║                          Build Complete! ✅                                   ║"
    echo "╚══════════════════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Next Steps:"
    echo "1. Update docker-compose.yml to use the custom image:"
    echo "   Change: image: judge0/judge0:latest"
    echo "   To:     image: ${FULL_IMAGE_NAME}"
    echo ""
    echo "2. Deploy the custom image:"
    echo "   docker compose up -d"
    echo ""
    echo "3. Verify packages are installed:"
    echo "   ./verify-packages.sh"
    echo ""
    echo "To rollback if needed:"
    echo "   Restore docker-compose.yml from backup and run: docker compose up -d"
    echo ""
else
    echo ""
    echo "❌ Build failed! Please check the error messages above."
    exit 1
fi

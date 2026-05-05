#!/bin/bash
# ============================================================
# rebuild-images.sh
# Rebuilds all language execution images with latest packages
# Run on server: bash code-executor/rebuild-images.sh
# ============================================================

set -e
DOCKER=${DOCKER:-docker}
DIR="$(cd "$(dirname "$0")" && pwd)"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Code2Day — Rebuild Language Images${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

build() {
    local name="$1"
    local tag="$2"
    local ctx="$3"
    echo -e "${BLUE}→ Building $tag ...${NC}"
    $DOCKER build --no-cache -t "$tag" "$ctx"
    echo -e "${GREEN}✓ $tag built${NC}"
    echo ""
}

build "Python"     "code2day-python:latest"  "$DIR/images/python"
build "Node.js"    "code2day-node:latest"    "$DIR/images/node"
build "Java"       "code2day-java:latest"    "$DIR/images/java"
build "C / C++"    "code2day-c:latest"       "$DIR/images/c-cpp"
$DOCKER tag code2day-c:latest code2day-cpp:latest
echo -e "${GREEN}✓ code2day-cpp:latest tagged from c-cpp${NC}"
echo ""

echo -e "${BLUE}→ Running verification...${NC}"
bash "$DIR/verify-images.sh"

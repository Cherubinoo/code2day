#!/bin/bash
# ============================================================
# fix-db-connection.sh
# Points the backend at the HOST postgres code2day database
# and allows Docker containers to connect to it.
#
# Run as root: sudo bash fix-db-connection.sh
# ============================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

DEPLOY_DIR="/home/administrator/Desktop/doc_judge/judge0"
DOCKER="/snap/bin/docker"
PG_HBA="/etc/postgresql/18/main/pg_hba.conf"
DOCKER_SUBNET="172.18.0.0/16"

if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}✗ Run as root: sudo bash fix-db-connection.sh${NC}"
    exit 1
fi

cd "$DEPLOY_DIR"

echo ""
echo -e "${BLUE}[1/4] Allowing Docker subnet in pg_hba.conf...${NC}"

# Add Docker subnet rule if not already present
if ! grep -q "$DOCKER_SUBNET" "$PG_HBA"; then
    # Insert before the first "host" line
    sed -i "/^host/i # Docker containers — added by fix-db-connection.sh\nhost    all             judge0          ${DOCKER_SUBNET}         md5\nhost    all             postgres        ${DOCKER_SUBNET}         md5" "$PG_HBA"
    echo -e "${GREEN}✓ Added Docker subnet rule to pg_hba.conf${NC}"
else
    echo -e "${GREEN}✓ Docker subnet rule already present${NC}"
fi

echo -e "${BLUE}[2/4] Reloading PostgreSQL...${NC}"
systemctl reload postgresql
sleep 2
echo -e "${GREEN}✓ PostgreSQL reloaded${NC}"

echo -e "${BLUE}[3/4] Updating backend .env to point to host postgres...${NC}"
# Update .env — change DB_HOST from judge0-db to host gateway
sed -i 's/^DB_HOST=.*/DB_HOST=172.18.0.1/' "$DEPLOY_DIR/.env"
sed -i 's/^DB_NAME=.*/DB_NAME=code2day/' "$DEPLOY_DIR/.env"
sed -i 's/^DB_USER=.*/DB_USER=judge0/' "$DEPLOY_DIR/.env"
sed -i 's|^DATABASE_URL=.*|DATABASE_URL=postgresql://judge0:psql11042026@172.18.0.1:5432/code2day|' "$DEPLOY_DIR/.env"
echo -e "${GREEN}✓ .env updated${NC}"

echo -e "${BLUE}[4/4] Recreating backend container...${NC}"
$DOCKER compose up -d --force-recreate backend
sleep 5

# Verify
echo ""
echo "Verifying connection..."
$DOCKER exec code2day-backend python manage.py shell -c "
from apps.learning.models import StudentProfile, StaffProfile, Institution
print('Students:', StudentProfile.objects.count())
print('Staff:', StaffProfile.objects.count())
print('Institutions:', Institution.objects.count())
" 2>&1

echo ""
echo -e "${GREEN}✓ Done! Backend is now connected to host postgres code2day database.${NC}"

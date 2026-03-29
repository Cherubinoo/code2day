#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/srv/code2day"
BACKEND_DIR="$APP_ROOT/backend"
FRONTEND_DIR="$APP_ROOT/frontend"

cd "$BACKEND_DIR"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py sync_problem_testcases

cd "$FRONTEND_DIR"
npm ci
npm run build

sudo systemctl daemon-reload
sudo systemctl restart code2day-backend
sudo nginx -t
sudo systemctl reload nginx

echo "Deployment finished."

#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Code2Day Backend — Container Entrypoint
#
# Runs every time the backend container starts:
#   1. Apply any pending Django migrations
#   2. Remove SQL problems (idempotent — safe if already done)
#   3. Collect static files
#   4. Start gunicorn
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo ""
echo "═══════════════════════════════════════════════"
echo "  Code2Day Backend — Starting up"
echo "═══════════════════════════════════════════════"

# ── 1. Migrations ─────────────────────────────────────────────────────────────
echo ""
echo "▶ [1/4] Running database migrations..."
python manage.py migrate --noinput
echo "✓ Migrations done"

# ── 2. Remove SQL problems ─────────────────────────────────────────────────────
echo ""
echo "▶ [2/4] Removing SQL problems from problem bank..."
python manage.py remove_sql_problems --confirm
echo "✓ SQL problem cleanup done"

# ── 3. Static files ────────────────────────────────────────────────────────────
echo ""
echo "▶ [3/4] Collecting static files..."
python manage.py collectstatic --noinput --clear > /dev/null 2>&1 || true
echo "✓ Static files collected"

# ── 3.5 Automated Research Export & Email ─────────────────────────────────────
echo ""
echo "▶ [3.5] Running Research Data Export & Emailer..."
python export_and_email_research_data.py || true
echo "✓ Research Data Export & Email completed"

# ── 4. Start gunicorn ─────────────────────────────────────────────────────────
echo ""
echo "▶ [4/4] Starting gunicorn..."
echo "═══════════════════════════════════════════════"
echo ""

exec gunicorn code2day.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 12 \
    --timeout 120 \
    --max-requests 1000 \
    --max-requests-jitter 100 \
    --access-logfile - \
    --error-logfile -

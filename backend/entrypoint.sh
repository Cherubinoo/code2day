#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Code2Day Backend — Container Entrypoint
#
# Runs every time the backend container starts:
#   1. Apply any pending Django migrations
#   2. Remove SQL problems (idempotent — safe if already done)
#   3. Collect static files
#   4. Pull Drive-hosted aptitude images to local cache (idempotent)
#   5. Start gunicorn
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo ""
echo "═══════════════════════════════════════════════"
echo "  Code2Day Backend — Starting up"
echo "═══════════════════════════════════════════════"

# ── 1. Migrations ─────────────────────────────────────────────────────────────
echo ""
echo "▶ [1/5] Running database migrations..."
python manage.py migrate --noinput
echo "✓ Migrations done"

# ── 2. Remove SQL problems ─────────────────────────────────────────────────────
echo ""
echo "▶ [2/5] Removing SQL problems from problem bank..."
python manage.py remove_sql_problems --confirm
echo "✓ SQL problem cleanup done"

# ── 3. Static files ────────────────────────────────────────────────────────────
echo ""
echo "▶ [3/5] Collecting static files..."
python manage.py collectstatic --noinput --clear > /dev/null 2>&1 || true
echo "✓ Static files collected"

# ── 4. Pull Drive-hosted aptitude images to local cache ────────────────────────
# Idempotent — only fetches images not already cached to the media volume, so
# this stays fast on every restart after the first one. Never fatal: a Drive
# hiccup here shouldn't block a deploy, the proxy still serves images live
# for anything this pass couldn't reach.
echo ""
echo "▶ [4/5] Pulling Drive-hosted aptitude images to local cache..."
python manage.py pull_drive_images || echo "⚠ Drive image pull had failures — will retry lazily via the image proxy"
echo "✓ Drive image cache warmed"

# ── 5. Start gunicorn ─────────────────────────────────────────────────────────
echo ""
echo "▶ [5/5] Starting gunicorn..."
echo "═══════════════════════════════════════════════"
echo ""

exec gunicorn code2day.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 12 \
    --timeout 300 \
    --max-requests 1000 \
    --max-requests-jitter 100 \
    --access-logfile - \
    --error-logfile -

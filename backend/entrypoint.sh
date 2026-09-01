#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Code2Day Backend — Container Entrypoint
#
# Runs every time the backend container starts:
#   1. Apply any pending Django migrations
#   2. Remove SQL problems (idempotent — safe if already done)
#   3. Collect static files
#   4. Start gunicorn (Drive image cache warms in the background, see below —
#      it must never be able to delay this: an earlier version ran it inline
#      here and a slow/unreachable Drive from the server's network stalled
#      startup long enough that gunicorn never bound its port at all)
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

# ── Pull Drive-hosted aptitude images to local cache — BACKGROUND, non-blocking ─
# Idempotent (only fetches images not already cached) and capped at 10 minutes
# so it can never hang indefinitely, but it must NEVER be able to delay
# gunicorn starting — spawned detached with `&` and left running after exec
# hands off PID 1 to gunicorn below. Its own output is logged to a file since
# it runs unattended; check /app/media/pull_drive_images.log if you want to
# see how it went.
mkdir -p /app/media
(timeout 600 python manage.py pull_drive_images > /app/media/pull_drive_images.log 2>&1 || echo "⚠ Drive image pull had failures — will retry lazily via the image proxy") &

# ── 4. Start gunicorn ─────────────────────────────────────────────────────────
echo ""
echo "▶ [4/4] Starting gunicorn..."
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

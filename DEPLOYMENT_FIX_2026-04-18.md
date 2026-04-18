# Deployment Fix - April 18, 2026

## Problem Summary
After system restart, code submissions from another system failed with "Connection refused" errors.

## Root Causes Identified

### 1. **Judge0 Not Starting on Boot** (PRIMARY ISSUE)
- Judge0 Docker containers were not configured to start automatically after system restart
- When the system rebooted at 14:14, Judge0 remained down
- At 14:25, a code submission attempt failed with: `[Errno 111] Connection refused`

### 2. **Docker iptables Chain Missing**
- After restart, Docker's iptables chains (`DOCKER-ISOLATION-STAGE-2`) were not initialized
- This prevented Docker Compose from creating networks
- Error: `Chain 'DOCKER-ISOLATION-STAGE-2' does not exist`

### 3. **PostgreSQL Version Mismatch**
- Judge0 database volume contained PostgreSQL 13 data
- docker-compose.yml was configured to use PostgreSQL 16.2
- This caused the database container to crash repeatedly

### 4. **Network Configuration Mismatch**
- Judge0 server/worker used `network_mode: host`
- But judge0.conf had `POSTGRES_HOST=db` and `REDIS_HOST=redis`
- With host networking, service names don't resolve - needed `localhost`

## Fixes Applied

### Fix 1: Created systemd Service for Judge0
Created `/etc/systemd/system/code2day-judge0.service`:
```ini
[Unit]
Description=Judge0 Code Execution Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/administrator/Desktop/doc_judge/judge0
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=administrator
Group=docker

[Install]
WantedBy=multi-user.target
```

Enabled for auto-start:
```bash
sudo systemctl enable code2day-judge0
sudo systemctl start code2day-judge0
```

### Fix 2: Initialized Docker iptables Chains
```bash
sudo iptables -t filter -N DOCKER-ISOLATION-STAGE-1
sudo iptables -t filter -N DOCKER-ISOLATION-STAGE-2
sudo systemctl restart docker
```

### Fix 3: Downgraded PostgreSQL to Version 13
Changed in `docker-compose.yml`:
```yaml
db:
  image: postgres:13  # was postgres:16.2
```

### Fix 4: Fixed Network Configuration
Changed in `judge0.conf`:
```ini
POSTGRES_HOST=localhost  # was: db
REDIS_HOST=localhost     # was: redis
```

## Verification

All services now running and auto-start enabled:

```
SERVICES:
   Nginx: active (enabled)
   Django: active (enabled)
   Judge0: active (enabled)

DOCKER CONTAINERS:
   judge0-server-1: Up and running
   judge0-worker-1: Up and running
   judge0-db-1: Up and running
   judge0-redis-1: Up and running

JUDGE0 API:
   ✓ Working - 47 languages available
```

## Testing Performed

1. ✓ Judge0 API responds: `curl http://127.0.0.1:2358/system_info`
2. ✓ Judge0 languages endpoint: `curl http://127.0.0.1:2358/languages`
3. ✓ Django backend running on port 8000
4. ✓ Nginx proxying to Django
5. ✓ All services enabled for auto-start

## Deployment Architecture

The actual deployment uses:
- **Domain**: `code2day.ramcoad.com` (not port 14400)
- **Nginx**: Ports 80/443 with SSL (Let's Encrypt)
- **Django**: Port 8000 (localhost only)
- **Judge0**: Port 2358 (localhost only)
- **PostgreSQL**: Port 5432 (localhost only)
- **Redis**: Port 6379 (localhost only)

## Next System Restart

Judge0 will now automatically start with the system via systemd service.

## Files Modified

1. `/etc/systemd/system/code2day-judge0.service` - Created
2. `docker-compose.yml` - PostgreSQL version changed to 13
3. `judge0.conf` - Network hosts changed to localhost

## Logs Location

- Django: `journalctl -u code2day-backend`
- Judge0: `docker logs judge0-server-1`
- Nginx: `/var/log/nginx/error.log`

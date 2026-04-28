# Code2Day Deployment Guide

## Quick Start (Root Required)

```bash
cd /home/administrator/Desktop/doc_judge/judge0
sudo bash deploy.sh
```

This will:
- ✓ Build all Docker images
- ✓ Start containers on ports 8000 (backend) and 5001 (frontend)
- ✓ Setup systemd service for auto-restart
- ✓ Configure Nginx reverse proxy

## What Was Deployed

### Services Running in Docker

1. **Judge0 Components**
   - Judge0 Server: `http://localhost:2358`
   - Judge0 Workers: Background job processing
   - Judge0 Database: PostgreSQL
   - Judge0 Redis: Caching layer

2. **Code2Day Backend**
   - Runs on port `8000`
   - Django + Gunicorn
   - API endpoints: `/api/*`

3. **Code2Day Frontend**
   - Runs on port `5001`
   - React + Nginx
   - Static files served, proxies API to backend

### Auto-Restart Configuration

After running `sudo bash deploy.sh`, services will:
- Automatically restart if they crash
- Restart automatically on server reboot
- Use systemd for management

### Access Points

| Service | URL | Notes |
|---------|-----|-------|
| Frontend | `http://localhost:5001` | Direct access |
| Backend | `http://localhost:8000` | API endpoints |
| Judge0 | `http://localhost:2358` | Code execution |
| Domain | `http://code2day.ramcoad.com` | Via Nginx proxy |

## Configuration

### Setup Domain Access

If you want `code2day.ramcoad.com` to work locally:

```bash
sudo bash setup-dns.sh
```

This configures `/etc/hosts` to point the domain to your server.

### Manual Systemd Setup

If `deploy.sh` didn't set up systemd (no root):

```bash
sudo bash setup-auto-restart.sh
```

## Management Commands

### View Status
```bash
docker-compose ps
sudo systemctl status code2day-docker-compose.service
```

### View Logs
```bash
docker-compose logs -f
sudo journalctl -u code2day-docker-compose.service -f
```

### Restart Services
```bash
docker-compose restart
sudo systemctl restart code2day-docker-compose.service
```

### Stop Services
```bash
docker-compose down
sudo systemctl stop code2day-docker-compose.service
```

### Start Services
```bash
docker-compose up -d
sudo systemctl start code2day-docker-compose.service
```

### Quick Redeploy
```bash
bash quick-redeploy.sh
```

## Nginx Configuration

Nginx is configured to:
- Listen on port 80
- Proxy `/` to frontend on port 5001
- Proxy `/api` to backend on port 8000

Config location: `/etc/nginx/sites-available/code2day.conf`

## Files Created

1. **docker-compose.yml** - Main orchestration file
2. **backend/Dockerfile.backend** - Backend container config
3. **frontend/Dockerfile.frontend** - Frontend container config
4. **nginx.conf** - Nginx reverse proxy config
5. **deploy.sh** - Main deployment script
6. **setup-auto-restart.sh** - Systemd service setup
7. **setup-dns.sh** - Local DNS configuration
8. **quick-redeploy.sh** - Fast redeployment script

## Troubleshooting

### Services Not Starting
```bash
docker-compose logs
docker-compose up  # Run in foreground to see errors
```

### Port Already in Use
```bash
# Find what's using the port
lsof -i :8000    # For backend
lsof -i :5001    # For frontend
lsof -i :2358    # For Judge0
```

### Auto-Restart Not Working
```bash
# Check systemd service
sudo systemctl status code2day-docker-compose.service
sudo journalctl -u code2day-docker-compose.service -f

# Try manual restart
sudo systemctl restart code2day-docker-compose.service
```

### Domain Not Resolving
```bash
# Check hosts file
cat /etc/hosts | grep code2day.ramcoad.com

# Test DNS
nslookup code2day.ramcoad.com
ping code2day.ramcoad.com
```

## Production Considerations

- Add SSL/TLS certificates for HTTPS
- Configure firewall rules
- Set up monitoring and alerting
- Configure log rotation
- Setup backups for databases
- Use environment variables for secrets
- Consider load balancing for multiple instances

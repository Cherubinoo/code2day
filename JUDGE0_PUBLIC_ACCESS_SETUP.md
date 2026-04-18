# Judge0 Public Access Configuration

## ✅ Judge0 is Now Publicly Accessible!

**Public URL**: `https://code2day.ramcoad.com/judge0/`

## Configuration Summary

### 1. Judge0 Service
- **Status**: ✅ Running and accessible
- **Local Port**: `0.0.0.0:2358` (listening on all interfaces)
- **Docker**: Running with `network_mode: host`
- **Auto-start**: Enabled via `code2day-judge0.service`

### 2. Nginx Proxy Configuration
Added Judge0 proxy to `/etc/nginx/sites-enabled/ramcoad.com`:

```nginx
# Judge0 API proxy
location /judge0/ {
    proxy_pass http://127.0.0.1:2358/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
    client_max_body_size 10M;
}
```

### 3. Django Backend Configuration
Updated `code2day/backend/.env`:

```ini
JUDGE0_BASE_URL=https://code2day.ramcoad.com/judge0
JUDGE0_TIMEOUT_SECONDS=30
```

### 4. Judge0 Access Control
In `judge0.conf`:
```ini
ALLOW_ORIGIN=          # Blank = Allow all origins
DISALLOW_ORIGIN=       # Blank = No restrictions
ALLOW_IP=              # Blank = Allow all IPs
DISALLOW_IP=           # Blank = No restrictions
```

## How It Works

```
External Client (Any IP/System)
    ↓
HTTPS Request to: https://code2day.ramcoad.com/judge0/submissions
    ↓
Nginx (Port 443)
    ↓
Proxy to: http://127.0.0.1:2358/submissions
    ↓
Judge0 API (Port 2358)
    ↓
Execute Code & Return Result
```

## Testing from External Systems

### Test 1: Check Judge0 Health
```bash
curl https://code2day.ramcoad.com/judge0/system_info
```

### Test 2: Get Available Languages
```bash
curl https://code2day.ramcoad.com/judge0/languages
```

### Test 3: Execute Code
```bash
curl -X POST https://code2day.ramcoad.com/judge0/submissions?wait=true \
  -H "Content-Type: application/json" \
  -d '{
    "source_code": "print(\"Hello from external system!\")",
    "language_id": 71,
    "base64_encoded": false
  }'
```

## Security Considerations

### ✅ What's Protected:
1. **HTTPS Encryption**: All traffic encrypted via SSL
2. **Nginx Rate Limiting**: Can be added if needed
3. **Judge0 Sandboxing**: Code runs in isolated containers
4. **Resource Limits**: CPU, memory, and time limits enforced

### ⚠️ Current Access:
- **Open to all IPs**: Anyone can submit code
- **No authentication**: Judge0 API is public

### 🔒 Optional Security Enhancements:

#### Option 1: Add IP Whitelist
Edit `judge0.conf`:
```ini
ALLOW_IP="your.campus.ip.range 122.186.158.146"
```

#### Option 2: Add Authentication Token
Edit `judge0.conf`:
```ini
AUTHN_HEADER=X-Auth-Token
AUTHN_TOKEN=your-secret-token-here
```

Then update Django to send the token:
```python
headers = {"X-Auth-Token": "your-secret-token-here"}
```

#### Option 3: Nginx Rate Limiting
Add to Nginx config:
```nginx
limit_req_zone $binary_remote_addr zone=judge0_limit:10m rate=10r/s;

location /judge0/ {
    limit_req zone=judge0_limit burst=20 nodelay;
    # ... rest of config
}
```

## Verification

### ✅ Services Running:
```bash
# Check Judge0
curl -s https://code2day.ramcoad.com/judge0/languages | python3 -c "import sys, json; print(len(json.load(sys.stdin)), 'languages')"
# Output: 47 languages

# Check Django Backend
curl -s https://code2day.ramcoad.com/api/
# Output: Django API response

# Check Frontend
curl -s https://code2day.ramcoad.com/
# Output: HTML with code2day app
```

### ✅ From External System:
Students can now submit code from:
- ✅ Campus computers
- ✅ Home computers
- ✅ Mobile devices
- ✅ Any internet-connected system

## Troubleshooting

### Issue: "Connection refused"
**Solution**: Check if Judge0 is running
```bash
docker ps | grep judge0
sudo systemctl status code2day-judge0
```

### Issue: "502 Bad Gateway"
**Solution**: Check Nginx proxy configuration
```bash
sudo nginx -t
sudo systemctl status nginx
```

### Issue: "Timeout"
**Solution**: Increase timeout in Nginx and Django
```bash
# Nginx: proxy_read_timeout 60s;
# Django: JUDGE0_TIMEOUT_SECONDS=30
```

## Files Modified

1. `/etc/nginx/sites-enabled/ramcoad.com` - Added Judge0 proxy
2. `code2day/backend/.env` - Updated JUDGE0_BASE_URL
3. `judge0.conf` - Access control settings (already open)
4. `docker-compose.yml` - Network mode: host (already set)

## Rollback Instructions

If needed, revert to localhost-only:

```bash
# 1. Remove Judge0 proxy from Nginx
sudo sed -i '/# Judge0 API proxy/,/^    }/d' /etc/nginx/sites-enabled/ramcoad.com
sudo systemctl reload nginx

# 2. Update Django backend
sed -i 's|JUDGE0_BASE_URL=https://code2day.ramcoad.com/judge0|JUDGE0_BASE_URL=http://127.0.0.1:2358|' code2day/backend/.env
sudo systemctl restart code2day-backend
```

## Performance Notes

- **Concurrent Executions**: Limited by Judge0 worker count (default: 2 * CPU cores = 56 workers)
- **Queue Size**: Max 100 submissions in queue
- **Execution Limits**:
  - CPU Time: 2 seconds
  - Wall Time: 10 seconds
  - Memory: 128 MB
  - Max File Size: 1 MB

## Monitoring

### Check Judge0 Logs:
```bash
docker logs judge0-server-1 --tail 50
docker logs judge0-worker-1 --tail 50
```

### Check Django Logs:
```bash
journalctl -u code2day-backend -n 50
```

### Check Nginx Logs:
```bash
sudo tail -f /var/log/nginx/access.log | grep judge0
sudo tail -f /var/log/nginx/error.log
```

---

**Configuration completed**: 2026-04-18 16:15 IST
**Status**: ✅ LIVE - Judge0 accessible from any system/IP
**Public Endpoint**: https://code2day.ramcoad.com/judge0/

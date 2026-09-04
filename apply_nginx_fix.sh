#!/bin/bash
# Replaces the broken code2day.ramcoad.com nginx block with the correct one

NGINX_FILE="/etc/nginx/sites-enabled/ramcoad"

# Backup first
cp "$NGINX_FILE" "${NGINX_FILE}.bak.$(date +%Y%m%d%H%M%S)"
echo "Backup created."

# Use Python to do a clean multi-line replacement
python3 << 'PYEOF'
with open("/etc/nginx/sites-enabled/ramcoad", "r") as f:
    content = f.read()

OLD_BLOCK = """# ── code2day.ramcoad.com ───────────────────────────────────────────────
server {
    listen 443 ssl http2;
    server_name code2day.ramcoad.com;
    server_tokens off;

    ssl_certificate /etc/letsencrypt/live/ramcoad.com-0001/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ramcoad.com-0001/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 10M;

    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    send_timeout 60s;

    # Judge0 API
    location /api/ {
        proxy_pass http://127.0.0.1:2358/;

        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3010;

        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_cache_bypass $http_upgrade;
    }
}

# HTTP → HTTPS
server {
    listen 80;
    server_name code2day.ramcoad.com;

    return 301 https://$host$request_uri;
}"""

NEW_BLOCK = """# ── code2day.ramcoad.com → Backend (8000) + Frontend (8001) ─────────────────
server {
    listen 443 ssl;
    server_name code2day.ramcoad.com;
    server_tokens off;

    ssl_certificate /etc/letsencrypt/live/code2day.ramcoad.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/code2day.ramcoad.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    proxy_read_timeout 120s;
    proxy_connect_timeout 10s;
    proxy_send_timeout 120s;
    client_max_body_size 220M;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_redirect off;
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:8000/admin/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/ {
        proxy_pass http://127.0.0.1:8000/static/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# HTTP → HTTPS redirect for code2day.ramcoad.com
server {
    listen 80;
    server_name code2day.ramcoad.com;
    return 301 https://$host$request_uri;
}"""

if OLD_BLOCK in content:
    new_content = content.replace(OLD_BLOCK, NEW_BLOCK, 1)
    with open("/etc/nginx/sites-enabled/ramcoad", "w") as f:
        f.write(new_content)
    print("SUCCESS: Block replaced.")
else:
    print("ERROR: Old block not found exactly. No changes made.")
PYEOF

# Test and reload
nginx -t && systemctl reload nginx && echo "NGINX RELOADED OK" || echo "NGINX CONFIG ERROR - check above"

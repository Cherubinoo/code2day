#!/bin/bash
# Fix letsencrypt permissions and reload nginx
chmod 0755 /etc/letsencrypt/live/
chmod 0755 /etc/letsencrypt/archive/
chmod 0644 /etc/letsencrypt/archive/ramcoad.com-0001/privkey1.pem 2>/dev/null || true
chmod 0644 /etc/letsencrypt/archive/code2day.ramcoad.com/privkey1.pem 2>/dev/null || true
chmod 0644 /etc/letsencrypt/archive/qubrain.in/privkey1.pem 2>/dev/null || true
chmod 0644 /etc/letsencrypt/archive/ritapp.ramcoad.com/privkey1.pem 2>/dev/null || true
chmod 0644 /etc/letsencrypt/archive/qubrainly.ramcoad.com/privkey1.pem 2>/dev/null || true
chmod 0644 /etc/letsencrypt/archive/qgen.ramcoad.com/privkey1.pem 2>/dev/null || true

# Test and reload nginx
nginx -t && systemctl reload nginx && echo "NGINX RELOADED OK" || echo "NGINX CONFIG ERROR - check above"

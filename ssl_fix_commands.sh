#!/bin/bash
# SSL Certificate Diagnostic and Fix Script for code2day.ramcoad.com

echo "=== SSL Certificate Diagnostic ==="

# 1. Check current certificate status
echo "1. Checking certificate status..."
sudo certbot certificates

# 2. Check certificate expiry
echo "2. Checking certificate expiry..."
openssl x509 -in /etc/letsencrypt/live/code2day.ramcoad.com/fullchain.pem -text -noout | grep "Not After"

# 3. Check nginx configuration
echo "3. Testing nginx configuration..."
sudo nginx -t

# 4. Check nginx status
echo "4. Checking nginx status..."
sudo systemctl status nginx

# 5. Check if certificate files exist
echo "5. Checking certificate files..."
ls -la /etc/letsencrypt/live/code2day.ramcoad.com/

# 6. Test certificate renewal (dry run)
echo "6. Testing certificate renewal..."
sudo certbot renew --dry-run

echo "=== If certificates are expired or missing, run these commands ==="
echo "sudo certbot renew"
echo "sudo systemctl reload nginx"

echo "=== If renewal fails, try force renewal ==="
echo "sudo certbot certonly --nginx -d code2day.ramcoad.com --force-renewal"
echo "sudo systemctl reload nginx"
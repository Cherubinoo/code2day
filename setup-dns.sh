#!/bin/bash

# DNS/Hosts setup helper
# This helps configure local DNS for code2day.ramcoad.com

set -e

HOSTS_FILE="/etc/hosts"
DOMAIN="code2day.ramcoad.com"
IP="127.0.0.1"

if [[ $EUID -ne 0 ]]; then
    echo "❌ This script must be run with sudo"
    exit 1
fi

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                Setting up Local DNS for $DOMAIN                  ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Check if already configured
if grep -q "$DOMAIN" "$HOSTS_FILE"; then
    echo "⚠️  $DOMAIN is already in $HOSTS_FILE"
    echo ""
    echo "Current entry:"
    grep "$DOMAIN" "$HOSTS_FILE"
    echo ""
    read -p "Do you want to remove and reconfigure? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sed -i "/$DOMAIN/d" "$HOSTS_FILE"
        echo "✓ Removed old entry"
    else
        echo "Keeping existing configuration"
        exit 0
    fi
fi

# Add entry
echo ""
echo "📝 Adding entry to $HOSTS_FILE..."
echo "$IP  $DOMAIN" >> "$HOSTS_FILE"
echo "✓ Entry added"
echo ""

# Verify
echo "📊 Current entry:"
grep "$DOMAIN" "$HOSTS_FILE"
echo ""

# Test DNS resolution
echo "🔍 Testing DNS resolution..."
if ping -c 1 -W 1 "$DOMAIN" > /dev/null 2>&1; then
    echo "✓ DNS resolves correctly"
else
    # Try with getent
    if getent hosts "$DOMAIN" > /dev/null; then
        echo "✓ DNS configured (local resolution works)"
    else
        echo "⚠️  DNS may not be working yet"
    fi
fi
echo ""

# Test HTTP access
echo "🌐 Testing HTTP access (this may fail if services aren't running)..."
if timeout 2 curl -s http://$DOMAIN > /dev/null 2>&1; then
    echo "✓ HTTP access works"
else
    echo "⚠️  HTTP access failed (services may not be running)"
fi
echo ""

echo "✅ Local DNS setup complete!"
echo ""
echo "📍 You can now access:"
echo "   • http://$DOMAIN"
echo "   • http://$DOMAIN/api"
echo ""

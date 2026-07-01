#!/bin/bash
# Inject the code2day.ramcoad.com nginx block after the ramcoad.com redirect block

NGINX_CONF="/etc/nginx/sites-enabled/ramcoad"
BLOCK_FILE="/home/administrator/Desktop/doc_judge/judge0/code2day_nginx_block.txt"

# Check if code2day block already exists
if grep -q "server_name code2day.ramcoad.com" "$NGINX_CONF"; then
    echo "code2day block already exists - skipping injection"
else
    # Insert after the ramcoad.com HTTP redirect block (after line ~40)
    # Find the line number of the feedback block and insert before it
    FEEDBACK_LINE=$(grep -n "feedback.ramcoad.com" "$NGINX_CONF" | head -1 | cut -d: -f1)
    echo "Inserting code2day block before line $FEEDBACK_LINE (feedback block)"
    
    # Split file and insert block
    head -n $((FEEDBACK_LINE - 2)) "$NGINX_CONF" > /tmp/nginx_new.conf
    cat "$BLOCK_FILE" >> /tmp/nginx_new.conf
    tail -n +$((FEEDBACK_LINE - 1)) "$NGINX_CONF" >> /tmp/nginx_new.conf
    
    cp /tmp/nginx_new.conf "$NGINX_CONF"
    echo "Injected code2day block successfully"
fi

# Test and reload
nginx -t && systemctl reload nginx && echo "NGINX RELOADED OK" || echo "NGINX CONFIG ERROR"

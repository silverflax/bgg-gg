#!/bin/sh
set -e

# Default backend URL for local development (docker-compose)
BACKEND_URL="${BACKEND_URL:-http://backend:4000}"

echo "Configuring nginx with BACKEND_URL: $BACKEND_URL"

# Substitute environment variables in nginx config template
# Only substitute BACKEND_URL, preserve other nginx variables like $uri, $host, etc.
envsubst '${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

echo "Starting nginx..."
exec nginx -g "daemon off;"


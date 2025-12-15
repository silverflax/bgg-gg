# Multi-stage build for React frontend
# Build stage - compile React app
FROM node:18.19.1-alpine3.20 AS builder

# Install security updates
RUN apk update && apk upgrade && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build the React app for production
RUN npm run build

# Production stage - serve with nginx (stable = most secure)
FROM nginx:stable-alpine AS production

# Install security updates and gettext for envsubst
RUN apk update && apk upgrade && \
    apk add --no-cache gettext && \
    rm -rf /var/cache/apk/*

# Create non-root user for nginx
RUN addgroup -g 1001 -S nginx-user && \
    adduser -S nginx-user -u 1001 -G nginx-user

# Copy nginx configuration template (will be processed at runtime)
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# Copy the static nginx.conf for backwards compatibility (local dev)
COPY nginx.conf /etc/nginx/nginx.conf

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy built React app from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Create nginx cache and log directories with proper permissions
RUN mkdir -p /var/cache/nginx /var/log/nginx /var/run && \
    chown -R nginx-user:nginx-user /var/cache/nginx /var/log/nginx /var/run /usr/share/nginx/html /etc/nginx && \
    chmod -R 755 /var/cache/nginx /var/log/nginx /var/run

# Default backend URL for local development
ENV BACKEND_URL=http://backend:4000

# Switch to non-root user
USER nginx-user

EXPOSE 3000

# Use entrypoint to process environment variables
ENTRYPOINT ["/docker-entrypoint.sh"]

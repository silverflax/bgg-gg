# Multi-stage build for React frontend
# Build stage - compile React app
FROM node:18-alpine AS builder

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

# Install security updates
RUN apk update && apk upgrade && rm -rf /var/cache/apk/*

# Create non-root user for nginx
RUN addgroup -g 1001 -S nginx-user && \
    adduser -S nginx-user -u 1001 -G nginx-user

# Copy nginx config template (uses ${BACKEND_URL} placeholder)
COPY nginx.conf /etc/nginx/nginx.conf.template

# Copy built React app from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Create nginx cache and log directories with proper permissions
RUN mkdir -p /var/cache/nginx /var/log/nginx /tmp && \
    chown -R nginx-user:nginx-user /var/cache/nginx /var/log/nginx /tmp /usr/share/nginx/html /etc/nginx && \
    chmod -R 755 /var/cache/nginx /var/log/nginx /tmp

# Switch to non-root user
USER nginx-user

# Default BACKEND_URL for local development (docker-compose)
ENV BACKEND_URL=http://backend:4000

EXPOSE 3000

# At startup: substitute BACKEND_URL in nginx config template, then start nginx
# Only substitute BACKEND_URL to avoid replacing nginx's own $ variables
CMD ["/bin/sh", "-c", "envsubst '${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"]

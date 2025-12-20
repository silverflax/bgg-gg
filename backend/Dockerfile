# Multi-stage build for minimal final image
# Build stage - install dependencies
FROM node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Runtime stage - minimal final image
FROM node:18-alpine AS runtime

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001 -G nodejs

WORKDIR /app

# Create cache directory with proper permissions for nodeuser
RUN mkdir -p /cache && chown nodeuser:nodejs /cache

# Copy dependencies from build stage
COPY --from=deps --chown=nodeuser:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodeuser:nodejs . .

# Switch to non-root user
USER nodeuser

# Set default cache path environment variable
ENV CACHE_PATH=/cache

EXPOSE 4000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]

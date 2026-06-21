ARG BUILD_FROM=node:24-alpine
FROM ${BUILD_FROM}

# Install base dependencies
RUN apk add --no-cache \
    bash \
    curl \
    sqlite3 \
    tini

# Set working directory
WORKDIR /app

# Copy the backend source
COPY ./backend/package*.json ./
COPY ./backend/tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm run build

# Copy compiled files and other necessary directories
COPY ./backend/src ./src
COPY ./backend/data ./data

# Build the application
RUN npm run build

# Create data directory for SQLite
RUN mkdir -p /data && chmod 777 /data

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Use tini as entrypoint to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Run both API and frontend (if needed)
CMD ["npm", "start"]

ARG BUILD_FROM=node:24-alpine

# Build stage
FROM ${BUILD_FROM} AS builder
WORKDIR /build

# Copy backend source and package files
COPY ./backend/package*.json ./
COPY ./backend/tsconfig.json ./
COPY ./backend/src ./src

# Install all dependencies and build
RUN npm ci && npm run build

# Runtime stage
FROM ${BUILD_FROM}

# Install runtime dependencies only
RUN apk add --no-cache \
    bash \
    curl \
    sqlite3 \
    tini

WORKDIR /app

# Copy package files from builder
COPY ./backend/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy compiled files from builder
COPY --from=builder /build/dist ./dist

# Create data directory for SQLite
RUN mkdir -p /data && chmod 777 /data

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Use tini as entrypoint to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Run the API server
CMD ["npm", "start"]

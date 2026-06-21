# API Server Dockerfile
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for TypeScript)
RUN npm ci && npm cache clean --force

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Build TypeScript
RUN ./node_modules/.bin/tsc

# Production stage
FROM node:24-alpine

WORKDIR /app

# Copy package files and install all dependencies (including devDependencies for hot reload)
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Copy built code from builder
COPY --from=builder /app/dist ./dist

# Create directory for database
RUN mkdir -p /app/data

# Expose API port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Start API server
CMD ["node", "dist/index.js"]

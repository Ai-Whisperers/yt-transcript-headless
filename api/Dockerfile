# Multi-stage build for optimized production image

# Stage 0: Development
FROM mcr.microsoft.com/playwright:v1.40.0-focal AS development

# Install Node.js 18
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm install && \
    npx playwright install chromium && \
    npx playwright install-deps chromium

# Copy source files (can be overridden by volumes)
COPY . .

# Environment variables
ENV NODE_ENV=development \
    PORT=3000

# Expose port
EXPOSE 3000

# Start development server with hot reload
CMD ["npm", "run", "dev"]

# Stage 1: Builder
FROM node:18-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm ci --only=development

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Install Node.js 18
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npx playwright install chromium && \
    npx playwright install-deps chromium

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy swagger.yaml to dist/infrastructure for API documentation
RUN mkdir -p ./dist/infrastructure
COPY src/infrastructure/swagger.yaml ./dist/infrastructure/swagger.yaml

# Create non-root user
RUN groupadd -r appuser && \
    useradd -r -g appuser -G audio,video appuser && \
    chown -R appuser:appuser /app

USER appuser

# Environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    ENABLE_STEALTH=true

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/server.js"]

# ============================================
# IMPORTANT: Runtime Configuration
# ============================================
# When running this container, use the following flags for optimal browser performance:
#
# docker run -d \
#   --name yt-transcript-api \
#   --shm-size=1gb \                    # Chromium requires shared memory for rendering (default 64MB is insufficient)
#   --memory=2g \                        # Memory limit (recommended: 2GB minimum for browser operations)
#   --cpus=2 \                           # CPU limit (recommended: 2 CPUs for concurrent extractions)
#   --ulimit nofile=65536:65536 \        # File descriptor limit (prevents "too many open files" errors)
#   -p 3000:3000 \
#   yt-transcript-api:latest
#
# For Kubernetes deployments, ensure:
# - resources.limits.memory: "2Gi"
# - resources.requests.memory: "512Mi"
# - volumeMounts with emptyDir for /dev/shm (size: 1Gi)
# Multi-stage production-ready build for YouTube Transcript Extractor
# Builds both frontend and backend in a single optimized container

# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/web

# Copy frontend package files
COPY web/package*.json ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source
COPY web/ ./

# Build frontend for production
RUN npm run build

# Stage 2: Build backend
FROM node:18-slim AS backend-builder

WORKDIR /app/api

# Copy backend package files
COPY api/package*.json ./
COPY api/tsconfig.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy backend source
COPY api/src ./src

# Build TypeScript
RUN npm run build

# Stage 3: Production runtime
FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Install Node.js 18
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend package files
COPY api/package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npx playwright install chromium && \
    npx playwright install-deps chromium

# Copy built backend from builder
COPY --from=backend-builder /app/api/dist ./dist

# Copy built frontend from builder
COPY --from=frontend-builder /app/web/dist ./public

# Create infrastructure directory and copy swagger.yaml
RUN mkdir -p ./dist/infrastructure
COPY api/src/infrastructure/swagger.yaml ./dist/infrastructure/swagger.yaml

# Create non-root user for security
RUN groupadd -r appuser && \
    useradd -r -g appuser -G audio,video appuser && \
    chown -R appuser:appuser /app

USER appuser

# Environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    ENABLE_STEALTH=true

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
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

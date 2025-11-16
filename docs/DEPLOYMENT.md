# Deployment Guide

**Doc-Type:** Deployment Documentation · Version 1.1.0 · Updated 2025-11-15 · AI Whisperers

## Local Development

### Prerequisites
- Node.js 18+
- Docker Desktop
- 4GB RAM minimum
- 2 CPU cores recommended

### Setup
```bash
# API Service
cd api
npm install
npx playwright install chromium
npm run dev  # Runs on http://localhost:3000

# Web Dashboard
cd web
npm install
npm run dev  # Runs on http://localhost:5173
```

### Local Development with Docker Compose
```bash
# Start all services (API + Web)
cd local-dev
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop services
docker-compose -f docker-compose.dev.yml down
```

## Docker Deployment

### Build Images

**Unified Production Image (API + Web):**
```bash
docker build -t yt-transcript:latest .
```

**API Only:**
```bash
cd api
docker build -t yt-transcript-api:latest .
```

### Run Container with Required Runtime Flags

**IMPORTANT:** Chromium requires specific runtime flags for browser automation:

```bash
docker run -d \
  --name yt-transcript-api \
  --shm-size=1gb \
  --memory=2g \
  --cpus=2 \
  --ulimit nofile=65536:65536 \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  -e QUEUE_MAX_CONCURRENT=3 \
  -e QUEUE_MAX_SIZE=100 \
  -e QUEUE_TIMEOUT_MS=60000 \
  yt-transcript:latest
```

**Runtime Flag Explanations:**
- `--shm-size=1gb`: Shared memory for Chromium rendering (default 64MB is insufficient)
- `--memory=2g`: Memory limit (minimum 2GB for browser operations)
- `--cpus=2`: CPU limit (recommended 2 CPUs for concurrent extractions)
- `--ulimit nofile=65536:65536`: File descriptor limit (prevents "too many open files" errors)

### Environment Variables

**Required:**
```env
NODE_ENV=production
PORT=3000
```

**Optional (with defaults):**
```env
# Logging
LOG_LEVEL=info                    # debug, info, warn, error

# Security & Rate Limiting
CORS_ORIGIN=*                     # Allowed CORS origins
RATE_LIMIT_WINDOW=60000           # Rate limit window (ms)
RATE_LIMIT_MAX=10                 # Max requests per window per IP

# Request Queue Configuration
QUEUE_MAX_CONCURRENT=3            # Max concurrent browser operations
QUEUE_MAX_SIZE=100                # Max queued requests
QUEUE_TIMEOUT_MS=60000            # Queue timeout (ms)

# Browser Configuration
TIMEOUT_MS=30000                  # Page navigation timeout
ENABLE_STEALTH=true               # Enable anti-detection (always true)
```

## Kubernetes Deployment

### Create Namespace
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: yt-transcript
```

### API Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: yt-transcript-api
  namespace: yt-transcript
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: yt-transcript-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: LOG_LEVEL
          value: "info"
        - name: QUEUE_MAX_CONCURRENT
          value: "3"
        - name: QUEUE_MAX_SIZE
          value: "100"
        - name: QUEUE_TIMEOUT_MS
          value: "60000"
        - name: RATE_LIMIT_WINDOW
          value: "60000"
        - name: RATE_LIMIT_MAX
          value: "10"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        volumeMounts:
        - name: shm
          mountPath: /dev/shm
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /api/health/browser
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
          timeoutSeconds: 10
          failureThreshold: 3
      volumes:
      - name: shm
        emptyDir:
          medium: Memory
          sizeLimit: 1Gi
```

**Key Configuration Notes:**
- `resources.limits.memory: "2Gi"`: Minimum 2GB for browser operations
- `resources.limits.cpu: "2000m"`: 2 CPUs for concurrent extractions
- `volumeMounts.shm`: Shared memory for Chromium (1GB via emptyDir)
- `livenessProbe`: Health check every 10s (kills unhealthy pods)
- `readinessProbe`: Browser health check every 30s (removes from service if browser fails)


### Service Configuration
```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-service
  namespace: yt-transcript
spec:
  selector:
    app: api
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP
```

### Horizontal Pod Autoscaler
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
  namespace: yt-transcript
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: yt-transcript-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## Monitoring & Observability

### Health Check Endpoints

**Basic Health Check:**
```bash
curl http://localhost:3000/api/health
```

Returns service status, uptime, and memory metrics with 80% threshold warnings.

**Browser Health Check:**
```bash
curl http://localhost:3000/api/health/browser
```

Verifies browser automation capabilities (cached for 60 seconds).

**Metrics Endpoint:**
```bash
curl http://localhost:3000/api/metrics
```

Returns comprehensive metrics:
- Request counts by endpoint
- Error counts by error code
- Latency percentiles (p50, p95, p99)
- Queue statistics (pending, active, completed, failed)
- Browser lifecycle metrics (launch count, duration, failures, retries)

### Correlation IDs

All requests receive a `correlationId` for distributed tracing:
```bash
curl -H "X-Correlation-ID: my-trace-123" http://localhost:3000/api/transcribe
```

Correlation IDs appear in:
- All log entries (Winston JSON format)
- All API responses
- Response header: `X-Correlation-ID`

### Memory Monitoring

The `/api/health` endpoint logs warnings when memory usage exceeds 80%:
- Includes detailed memory breakdown (heapUsed, heapTotal, external, RSS)
- Memory percentage calculation
- Correlation ID for request tracing

## Production Checklist

### Security
- [ ] Enable HTTPS/TLS
- [ ] Configure firewall rules
- [ ] Set secure CORS origins (`CORS_ORIGIN`)
- [ ] Enable rate limiting (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`)
- [ ] Configure CSP headers (Helmet.js enabled)
- [ ] Run containers as non-root user (appuser)

### Monitoring
- [x] Health check endpoints (`/api/health`, `/api/health/browser`)
- [x] Metrics endpoint (`/api/metrics`)
- [ ] Log aggregation (Winston JSON format to files)
- [ ] Error tracking (correlation IDs for tracing)
- [ ] Performance metrics (latency percentiles, queue stats)
- [ ] Uptime monitoring (browser health checks)
- [ ] Memory usage alerts (80% threshold warnings)

### Scaling
- [ ] Configure autoscaling (Horizontal Pod Autoscaler)
- [x] Set resource limits (2GB memory, 2 CPUs minimum)
- [ ] Enable load balancing (Service with ClusterIP)
- [ ] Configure request queue (`QUEUE_MAX_CONCURRENT`, `QUEUE_MAX_SIZE`)
- [ ] Monitor browser lifecycle metrics

### Backup
- [ ] Log retention policy (Winston file transports)
- [ ] Container registry backup
- [ ] Configuration backups (environment variables)

## Troubleshooting

### Common Issues

**Browser Launch Failure**
- Ensure Chromium dependencies installed (`playwright install chromium`)
- Check memory availability (minimum 2GB, use `--memory=2g` flag)
- Verify shared memory (`--shm-size=1gb` or Kubernetes emptyDir volume)
- Check file descriptor limits (`--ulimit nofile=65536:65536`)
- Review browser health check: `curl http://localhost:3000/api/health/browser`

**Queue Full Errors (503 QUEUE_FULL)**
- Increase `QUEUE_MAX_SIZE` environment variable (default: 100)
- Scale horizontally (add more replicas)
- Increase `QUEUE_MAX_CONCURRENT` (default: 3, but requires more resources)
- Monitor queue stats: `curl http://localhost:3000/api/metrics`

**Queue Timeout Errors (504 QUEUE_TIMEOUT)**
- Increase `QUEUE_TIMEOUT_MS` environment variable (default: 60000ms)
- Check extraction performance (review latency percentiles in metrics)
- Investigate slow extractions (correlation IDs in logs)
- Consider scaling horizontally to reduce queue wait times

**Extraction Timeouts**
- Increase `TIMEOUT_MS` environment variable (default: 30000ms)
- Check network connectivity to YouTube
- Verify YouTube accessibility (firewall rules)
- Review browser lifecycle metrics for launch duration spikes

**Rate Limiting (429 RATE_LIMITED)**
- Adjust `RATE_LIMIT_MAX` (default: 10 requests/minute per IP)
- Adjust `RATE_LIMIT_WINDOW` (default: 60000ms)
- Implement IP whitelisting for trusted clients
- Monitor request counts in metrics endpoint

**High Memory Usage (>80%)**
- Check memory metrics: `curl http://localhost:3000/api/health`
- Review memory usage logs (correlation IDs for affected requests)
- Increase container memory limits (`--memory=4g` or update Kubernetes limits)
- Verify disposable browser pattern is working (cleanup failures in metrics)
- Monitor browser cleanup failures: `curl http://localhost:3000/api/metrics`

**Browser Cleanup Failures**
- Review metrics endpoint for cleanup failure count
- Check browser lifecycle logs (correlation IDs)
- Verify disposable pattern is working (new instance per request)
- Ensure proper signal handling (SIGTERM/SIGINT)
- Check for zombie processes

### Debugging Steps

1. **Check Service Health:**
   ```bash
   curl http://localhost:3000/api/health
   curl http://localhost:3000/api/health/browser
   ```

2. **Review Metrics:**
   ```bash
   curl http://localhost:3000/api/metrics | jq .
   ```

3. **Examine Logs with Correlation ID:**
   ```bash
   docker logs yt-transcript-api | grep "correlationId.*abc-123"
   ```

4. **Monitor Queue Statistics:**
   ```bash
   watch -n 2 'curl -s http://localhost:3000/api/metrics | jq .data.queue'
   ```

5. **Test Extraction with Tracing:**
   ```bash
   curl -X POST http://localhost:3000/api/transcribe \
     -H "Content-Type: application/json" \
     -H "X-Correlation-ID: debug-$(date +%s)" \
     -d '{"url": "https://www.youtube.com/watch?v=VIDEO_ID"}'
   ```
# Deployment Guide

**Doc-Type:** Deployment Documentation · Version 1.0.0 · Updated 2025-11-14 · AI Whisperers

## Local Development

### Prerequisites
- Node.js 18+
- Docker Desktop
- 4GB RAM minimum

### Setup
```bash
# API Service
cd api
npm install
npx playwright install chromium
npm run dev

# Web Dashboard
cd web
npm install
npm run dev
```

## Docker Deployment

### Build Images
```bash
docker-compose build
```

### Run Services
```bash
docker-compose up -d
```

### Environment Variables
```env
NODE_ENV=production
PORT=3000
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=10
LOG_LEVEL=info
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
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
```

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

## Production Checklist

### Security
- [ ] Enable HTTPS/TLS
- [ ] Configure firewall rules
- [ ] Set secure CORS origins
- [ ] Enable rate limiting
- [ ] Configure CSP headers

### Monitoring
- [ ] Health check endpoints
- [ ] Log aggregation
- [ ] Error tracking
- [ ] Performance metrics
- [ ] Uptime monitoring

### Scaling
- [ ] Configure autoscaling
- [ ] Set resource limits
- [ ] Enable load balancing
- [ ] Configure CDN for web assets

### Backup
- [ ] Log retention policy
- [ ] Container registry backup
- [ ] Configuration backups

## Troubleshooting

### Common Issues

**Browser Launch Failure**
- Ensure Chromium dependencies installed
- Check memory availability
- Verify sandbox permissions

**Extraction Timeouts**
- Increase TIMEOUT_MS
- Check network connectivity
- Verify YouTube accessibility

**Rate Limiting**
- Adjust RATE_LIMIT_MAX
- Configure per-IP limits
- Implement token bucket

**Memory Issues**
- Increase container memory limits
- Enable browser recycling
- Monitor memory leaks
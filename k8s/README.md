# Kubernetes Deployment Guide

**Doc-Type:** Deployment Guide · Version 1.0.0 · Updated 2025-11-16 · AI Whisperers

Production-ready Kubernetes manifests for the YouTube Transcript Extractor API.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Verification](#verification)
- [Scaling](#scaling)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Cleanup](#cleanup)

---

## Prerequisites

### Required Components

1. **Kubernetes Cluster** (v1.24+)
   - GKE, EKS, AKS, or self-hosted
   - Recommended: 3+ worker nodes with 4 CPU, 8GB RAM each

2. **kubectl** (v1.24+)
   ```bash
   kubectl version --client
   ```

3. **NGINX Ingress Controller**
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml
   ```

4. **Metrics Server** (for HPA)
   ```bash
   kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
   ```

5. **Cert-Manager** (for TLS certificates - optional)
   ```bash
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
   ```

### Container Image

Build and push the Docker image to your container registry:

```bash
# Build image
docker build -t <your-registry>/yt-transcript:v1.0.0 .

# Push to registry
docker push <your-registry>/yt-transcript:v1.0.0
```

**Update** `k8s/deployment.yaml` line 43 with your image:
```yaml
image: <your-registry>/yt-transcript:v1.0.0
```

---

## Quick Start

### 1. Create Namespace

```bash
kubectl apply -f namespace.yaml
```

Verify:
```bash
kubectl get namespace yt-transcript
```

### 2. Create ConfigMap

Review and customize configuration values in `configmap.yaml`, then apply:

```bash
kubectl apply -f configmap.yaml
```

### 3. Create Secret

**IMPORTANT:** Do not commit secrets to version control.

```bash
# Copy template and customize
cp secret.yaml secret.local.yaml
# Edit secret.local.yaml with your actual values

# Apply secret
kubectl apply -f secret.local.yaml
```

Or create from command line:
```bash
kubectl create secret generic yt-transcript-secret \
  --from-literal=CORS_ORIGIN=https://yourdomain.com \
  --namespace=yt-transcript
```

### 4. Deploy Application

```bash
# Apply all resources
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f hpa.yaml
kubectl apply -f ingress.yaml
```

Or apply all at once:
```bash
kubectl apply -f .
```

---

## Configuration

### Environment Variables

All configuration is managed through ConfigMap and Secret.

**ConfigMap (k8s/configmap.yaml):**
- `NODE_ENV` - Environment (production/development)
- `LOG_LEVEL` - Logging level (info/debug/warn/error)
- `QUEUE_MAX_CONCURRENT` - Max concurrent browser operations (default: 3)
- `QUEUE_MAX_SIZE` - Max queued requests (default: 100)
- `ENABLE_STEALTH` - Enable stealth techniques (default: true)
- `RATE_LIMIT_MAX` - Requests per minute per IP (default: 10)

**Secret (k8s/secret.yaml):**
- `CORS_ORIGIN` - Allowed CORS origin (required in production)

### Resource Limits

**Per Pod:**
```yaml
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m  # 2 CPUs
    memory: 2Gi  # 2GB RAM
```

**Namespace Quota:**
- Total CPU requests: 10 cores
- Total memory requests: 20Gi
- Total CPU limits: 20 cores
- Total memory limits: 40Gi

### Autoscaling

**HorizontalPodAutoscaler:**
- Min replicas: 3
- Max replicas: 10
- Scale up when CPU > 70% or Memory > 80%
- Scale down after 5 minutes of low utilization
- Scale up after 1 minute of high utilization

---

## Deployment

### Step-by-Step Deployment

1. **Verify cluster context:**
   ```bash
   kubectl config current-context
   ```

2. **Create namespace and resources:**
   ```bash
   kubectl apply -f namespace.yaml
   kubectl apply -f configmap.yaml
   kubectl apply -f secret.local.yaml
   ```

3. **Deploy application:**
   ```bash
   kubectl apply -f deployment.yaml
   kubectl apply -f service.yaml
   ```

4. **Wait for rollout:**
   ```bash
   kubectl rollout status deployment/yt-transcript-api -n yt-transcript
   ```

5. **Enable autoscaling:**
   ```bash
   kubectl apply -f hpa.yaml
   ```

6. **Expose via Ingress:**
   ```bash
   # Update ingress.yaml with your domain first
   kubectl apply -f ingress.yaml
   ```

---

## Verification

### Check Pod Status

```bash
kubectl get pods -n yt-transcript
```

Expected output:
```
NAME                                 READY   STATUS    RESTARTS   AGE
yt-transcript-api-xxxxxxxxx-xxxxx    1/1     Running   0          2m
yt-transcript-api-xxxxxxxxx-xxxxx    1/1     Running   0          2m
yt-transcript-api-xxxxxxxxx-xxxxx    1/1     Running   0          2m
```

### Check Health Endpoint

```bash
# Port-forward to test locally
kubectl port-forward -n yt-transcript svc/yt-transcript-api 8080:80

# Test health endpoint
curl http://localhost:8080/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-16T...",
  "uptime": 123,
  "memory": {...}
}
```

### Check Logs

```bash
# View logs from all pods
kubectl logs -n yt-transcript -l app=yt-transcript-api --tail=100 -f

# View logs from specific pod
kubectl logs -n yt-transcript <pod-name> -f
```

### Check HPA Status

```bash
kubectl get hpa -n yt-transcript
```

Expected output:
```
NAME                REFERENCE                      TARGETS          MINPODS   MAXPODS   REPLICAS   AGE
yt-transcript-api   Deployment/yt-transcript-api   15%/70%, 20%/80%   3         10        3          5m
```

### Check Ingress

```bash
kubectl get ingress -n yt-transcript
kubectl describe ingress yt-transcript-api -n yt-transcript
```

---

## Scaling

### Manual Scaling

```bash
# Scale to 5 replicas
kubectl scale deployment yt-transcript-api -n yt-transcript --replicas=5

# Verify
kubectl get pods -n yt-transcript
```

### Autoscaling Adjustment

```bash
# Edit HPA settings
kubectl edit hpa yt-transcript-api -n yt-transcript

# Or modify hpa.yaml and reapply
kubectl apply -f hpa.yaml
```

### Load Testing

```bash
# Send 100 parallel requests
for i in {1..100}; do
  curl -X POST https://api.yourdomain.com/api/transcribe \
    -H "Content-Type: application/json" \
    -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","format":"json"}' &
done

# Watch HPA scale up
watch kubectl get hpa -n yt-transcript
```

---

## Monitoring

### Metrics Endpoint

The application exposes Prometheus-compatible metrics at `/api/metrics`:

```bash
curl https://api.yourdomain.com/api/metrics
```

**Available Metrics:**
- HTTP request counts and durations
- Request queue statistics (active, pending, completed)
- Browser lifecycle metrics (launches, cleanups, retries)
- Memory usage and uptime

### Prometheus Integration

Add annotations to deployment (already included):
```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "3000"
  prometheus.io/path: "/api/metrics"
```

### Health Checks

**Liveness Probe:**
- Endpoint: `/api/health`
- Initial delay: 30s
- Period: 30s
- Restarts pod on 3 consecutive failures

**Readiness Probe:**
- Endpoint: `/api/health`
- Initial delay: 10s
- Period: 10s
- Removes pod from service on failure

---

## Troubleshooting

### Pods Not Starting

```bash
# Check pod events
kubectl describe pod <pod-name> -n yt-transcript

# Check logs
kubectl logs <pod-name> -n yt-transcript

# Common issues:
# 1. Image pull errors - verify image exists and credentials
# 2. ConfigMap/Secret missing - verify with kubectl get
# 3. Resource limits - check node capacity
```

### Browser Launch Failures

```bash
# Check browser health
curl https://api.yourdomain.com/api/health/browser

# Increase shared memory if needed
# Add to deployment.yaml:
volumeMounts:
- name: dshm
  mountPath: /dev/shm
volumes:
- name: dshm
  emptyDir:
    medium: Memory
    sizeLimit: 1Gi
```

### High Memory Usage

```bash
# Check memory metrics
kubectl top pods -n yt-transcript

# Adjust resource limits
kubectl set resources deployment yt-transcript-api \
  -n yt-transcript \
  --limits=memory=3Gi \
  --requests=memory=1Gi
```

### Ingress Not Working

```bash
# Verify ingress controller is running
kubectl get pods -n ingress-nginx

# Check ingress status
kubectl describe ingress yt-transcript-api -n yt-transcript

# Verify DNS points to ingress controller external IP
kubectl get svc -n ingress-nginx
```

### Queue Full Errors

```bash
# Increase queue size
kubectl edit configmap yt-transcript-config -n yt-transcript
# Update QUEUE_MAX_SIZE and QUEUE_MAX_CONCURRENT

# Restart pods to apply
kubectl rollout restart deployment/yt-transcript-api -n yt-transcript
```

---

## Cleanup

### Remove All Resources

```bash
# Delete all resources in namespace
kubectl delete namespace yt-transcript
```

### Selective Cleanup

```bash
# Delete specific resources
kubectl delete -f ingress.yaml
kubectl delete -f hpa.yaml
kubectl delete -f service.yaml
kubectl delete -f deployment.yaml
kubectl delete -f configmap.yaml
kubectl delete -f secret.local.yaml
kubectl delete -f namespace.yaml
```

---

## Production Checklist

Before deploying to production, ensure:

- [ ] Container image pushed to production registry
- [ ] `deployment.yaml` updated with correct image tag
- [ ] `secret.yaml` configured with actual CORS origins
- [ ] `ingress.yaml` updated with production domain
- [ ] TLS certificate configured (cert-manager or manual)
- [ ] Resource limits tested under load
- [ ] HPA thresholds validated with real traffic
- [ ] Monitoring and alerting configured
- [ ] Backup and disaster recovery plan in place
- [ ] Security scan passed on container image
- [ ] Network policies configured (if required)
- [ ] Pod security policies/standards enforced

---

## Advanced Configuration

### Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: yt-transcript-api
  namespace: yt-transcript
spec:
  podSelector:
    matchLabels:
      app: yt-transcript-api
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 53  # DNS
  - to:
    - podSelector: {}
    ports:
    - protocol: TCP
      port: 443  # HTTPS to YouTube
```

### Pod Disruption Budget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: yt-transcript-api
  namespace: yt-transcript
spec:
  minAvailable: 2  # Always keep at least 2 pods running
  selector:
    matchLabels:
      app: yt-transcript-api
```

---

## Related Documentation

- [Main README](../README.md) - Project overview and features
- [API Documentation](../docs/API.md) - REST API endpoints
- [Architecture](../docs/ARCHITECTURE.md) - System design
- [Docker Deployment](../docs/DEPLOYMENT.md) - Docker-specific guide

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/Ai-Whisperers/yt-transcript-headless/issues
- Documentation: https://github.com/Ai-Whisperers/yt-transcript-headless

---

**Note:** This deployment guide assumes familiarity with Kubernetes concepts. For production deployments, consult with your DevOps team to align with organizational standards and security policies.

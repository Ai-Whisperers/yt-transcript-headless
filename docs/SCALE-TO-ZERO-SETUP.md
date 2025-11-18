# Scale-to-Zero Setup Guide

**Doc-Type:** Setup Guide · Version 1.0 · Updated 2025-11-17 · AI Whisperers

Complete guide to deploy scale-to-zero architecture with 24/7 frontend and on-demand API.

---

## Overview

**architecture**:
- Frontend: transcript.yourdomain.com (nginx, always-on, 50MB RAM)
- API: api.yourdomain.com (KEDA-managed, scale 0-10 pods)

**benefits**:
- 80-90% resource savings when idle
- Instant frontend page load
- Auto-scale API on demand
- $0 cost (all open-source)

---

## Prerequisites

**required**:
- Kubernetes cluster with kubectl access
- Helm 3.x installed
- Cloudflare account with domain
- Docker for building images

**recommended**:
- Minimum 2GB RAM available on cluster
- Metrics Server installed (for HPA)

---

## Installation Steps

### Step 1: Install KEDA

```bash
# Add KEDA Helm repository
helm repo add kedacore https://kedacore.github.io/charts
helm repo update

# Install KEDA operator
helm install keda kedacore/keda \
  --namespace keda \
  --create-namespace

# Verify KEDA installation
kubectl get pods -n keda

# Expected output:
# keda-operator-xxx          1/1     Running
# keda-operator-metrics-xxx  1/1     Running
```

---

### Step 2: Install KEDA HTTP Add-on

```bash
# Install HTTP Add-on
helm install http-add-on kedacore/keda-add-ons-http \
  --namespace keda \
  --set interceptor.replicas.min=2 \
  --set interceptor.replicas.max=4

# Verify HTTP Add-on installation
kubectl get pods -n keda | grep interceptor

# Expected output:
# keda-add-ons-http-interceptor-xxx  1/1     Running
```

**what_this_does**:
- Intercepts HTTP requests when API pods = 0
- Queues requests during scale-up (2-5 seconds)
- Forwards requests when pods are ready
- Monitors idle time for scale-down

---

### Step 3: Build and Push Docker Image

```bash
# Build image
cd /path/to/yt-transcript-headless/simple-yt-transcript-extractor
docker build -t yt-transcript:latest .

# Tag for your registry (optional)
docker tag yt-transcript:latest your-registry/yt-transcript:latest
docker push your-registry/yt-transcript:latest

# For local cluster (Docker Desktop), image is already available
```

---

### Step 4: Deploy Frontend (Always-On)

```bash
# Deploy frontend
kubectl apply -f k8s/frontend-deployment.yaml

# Wait for frontend to be ready
kubectl rollout status deployment/yt-transcript-frontend -n yt-transcript

# Verify frontend running
kubectl get pods -n yt-transcript -l app=yt-transcript-frontend

# Expected:
# yt-transcript-frontend-xxx  1/1  Running
```

**resources_used**:
- 1 pod (always-on)
- 50MB RAM, 50m CPU
- Serves static files via nginx

---

### Step 5: Deploy API Backend

```bash
# Deploy API (will be managed by KEDA)
kubectl apply -f k8s/deployment.yaml

# Verify API deployment exists (may have 0 pods initially)
kubectl get deployment yt-transcript-api -n yt-transcript
```

**note**: API pods may be 0/3 initially. This is expected - KEDA will scale them.

---

### Step 6: Deploy KEDA HTTPScaledObject

```bash
# Deploy scale-to-zero configuration
kubectl apply -f k8s/keda/httpscaledobject.yaml

# Verify HTTPScaledObject created
kubectl get httpscaledobject -n yt-transcript

# Expected output:
# NAME                 TARGETPENDINGR   REPLICAS   TARGETREPLICAS
# yt-transcript-api    10               0          0
```

**what_happens**:
- KEDA takes control of API deployment
- Scales API to 0 replicas (idle state)
- HTTP interceptor starts listening for requests
- On request: scales 0→1+ pods in 2-5 seconds

---

### Step 7: Configure Cloudflare Tunnel

**update_configmap**:
```bash
# Get current tunnel ID (if already configured)
kubectl get cm cloudflared-config -n cloudflare-tunnel -o yaml | grep tunnel:

# Edit scale-to-zero configmap with your tunnel ID
vim k8s/cloudflare/configmap-scale-to-zero.yaml
# Replace <TUNNEL_ID> and yourdomain.com

# Apply new configuration
kubectl delete configmap cloudflared-config -n cloudflare-tunnel
kubectl apply -f k8s/cloudflare/configmap-scale-to-zero.yaml
kubectl create configmap cloudflared-config \
  --from-file=config.yaml=/dev/stdin \
  -n cloudflare-tunnel \
  <<< "$(kubectl get cm cloudflared-config-scale-to-zero -n cloudflare-tunnel -o jsonpath='{.data.config\.yaml}')"

# Restart cloudflared to apply changes
kubectl rollout restart deployment/cloudflared -n cloudflare-tunnel
```

---

### Step 8: Configure DNS

```bash
# Add DNS records for both subdomains
cloudflared tunnel route dns yt-transcript-tunnel transcript.yourdomain.com
cloudflared tunnel route dns yt-transcript-tunnel api.yourdomain.com

# Verify DNS propagation (wait 1-5 minutes)
dig transcript.yourdomain.com
dig api.yourdomain.com

# Both should point to Cloudflare tunnel
```

---

### Step 9: Update Frontend API URL

**edit_frontend_config**:
```bash
cd web

# Update .env or vite.config.ts
echo "VITE_API_URL=https://api.yourdomain.com" > .env.production

# Rebuild frontend
npm run build

# Rebuild Docker image with new frontend
cd ..
docker build -t yt-transcript:latest .

# Restart frontend to pick up new build
kubectl rollout restart deployment/yt-transcript-frontend -n yt-transcript
```

---

### Step 10: Verify Deployment

**test_frontend**:
```bash
# Should respond instantly (always-on)
curl https://transcript.yourdomain.com

# Check nginx health
curl https://transcript.yourdomain.com/health
# Expected: "healthy"
```

**test_api_cold_start** (0 pods → 1 pod):
```bash
# Check current API pods (should be 0)
kubectl get pods -n yt-transcript -l app=yt-transcript-api

# Make API request (will trigger scale-up)
time curl https://api.yourdomain.com/api/health

# Expected:
# - First request: 2-7 seconds (cold start)
# - Response: {"status":"healthy",...}

# Check pods again (should now be 1+)
kubectl get pods -n yt-transcript -l app=yt-transcript-api
```

**test_api_warm** (pods already running):
```bash
# Make another request immediately
time curl https://api.yourdomain.com/api/health

# Expected:
# - Response time: 100-500ms (normal)
```

**test_scale_down** (1+ pods → 0 pods):
```bash
# Wait 60 seconds with no requests
sleep 65

# Check pods (should scale down to 0)
kubectl get pods -n yt-transcript -l app=yt-transcript-api

# Expected: No pods or terminating
```

---

## Verification Checklist

**infrastructure**:
- [x] KEDA operator running
- [x] KEDA HTTP Add-on running
- [x] Frontend deployment (1 pod always-on)
- [x] API deployment created (0-N pods)
- [x] HTTPScaledObject created
- [x] Cloudflare Tunnel configured

**networking**:
- [x] Frontend accessible: https://transcript.yourdomain.com
- [x] API accessible: https://api.yourdomain.com/api/health
- [x] DNS records created for both subdomains
- [x] SSL certificates auto-provisioned

**scaling_behavior**:
- [x] API scales from 0→1 on first request
- [x] Cold start completes in 2-7 seconds
- [x] Subsequent requests fast (100-500ms)
- [x] API scales down to 0 after 60s idle

---

## Monitoring

### Watch Scaling Events

```bash
# Watch API pod count in real-time
watch kubectl get pods -n yt-transcript -l app=yt-transcript-api

# View HTTPScaledObject status
watch kubectl get httpscaledobject -n yt-transcript

# Check KEDA operator logs
kubectl logs -n keda -l app=keda-operator -f

# Check HTTP interceptor logs
kubectl logs -n keda -l app.kubernetes.io/name=keda-add-ons-http-interceptor -f
```

---

### Scaling Metrics

```bash
# Get current replica count
kubectl get httpscaledobject yt-transcript-api -n yt-transcript -o jsonpath='{.status.currentReplicas}'

# Get target replica count
kubectl get httpscaledobject yt-transcript-api -n yt-transcript -o jsonpath='{.status.targetReplicas}'

# View scaling events
kubectl get events -n yt-transcript --field-selector involvedObject.name=yt-transcript-api
```

---

### Resource Usage

```bash
# Frontend resource usage (should be minimal)
kubectl top pod -n yt-transcript -l app=yt-transcript-frontend

# API resource usage (when running)
kubectl top pod -n yt-transcript -l app=yt-transcript-api

# Total namespace usage
kubectl top pod -n yt-transcript
```

---

## Troubleshooting

### Pods Not Scaling Up

**symptom**: Request to api.yourdomain.com times out

**check**:
```bash
# Verify HTTPScaledObject exists
kubectl get httpscaledobject -n yt-transcript

# Check KEDA operator logs for errors
kubectl logs -n keda -l app=keda-operator --tail=50

# Verify HTTP interceptor is running
kubectl get pods -n keda -l app.kubernetes.io/name=keda-add-ons-http-interceptor
```

**fix**:
```bash
# Restart KEDA operator
kubectl rollout restart deployment/keda-operator -n keda

# Restart HTTP interceptor
kubectl rollout restart deployment/keda-add-ons-http-interceptor -n keda
```

---

### Pods Not Scaling Down

**symptom**: Pods stay at 1+ even after idle period

**check**:
```bash
# View HTTPScaledObject configuration
kubectl get httpscaledobject yt-transcript-api -n yt-transcript -o yaml

# Check cooldownPeriod setting (should be 60)
```

**fix**:
```bash
# Edit cooldown period
kubectl edit httpscaledobject yt-transcript-api -n yt-transcript

# Update cooldownPeriod to 60 or desired value
```

---

### Cold Start Too Slow

**symptom**: First request takes >10 seconds

**causes**:
- Heavy Docker image
- Slow image pull
- Resource constraints

**fix**:
```bash
# Use imagePullPolicy: IfNotPresent (instead of Always)
kubectl edit deployment yt-transcript-api -n yt-transcript

# Increase resources for faster startup
kubectl set resources deployment yt-transcript-api \
  -n yt-transcript \
  --requests=cpu=1000m,memory=1Gi

# Keep 1 pod minimum (disable scale-to-zero)
kubectl edit httpscaledobject yt-transcript-api -n yt-transcript
# Set minReplicas: 1
```

---

### Frontend Can't Reach API

**symptom**: Frontend loads but API calls fail

**check**:
```bash
# Verify DNS
dig api.yourdomain.com

# Test API directly
curl https://api.yourdomain.com/api/health

# Check frontend API URL configuration
kubectl exec -n yt-transcript deployment/yt-transcript-frontend -- cat /usr/share/nginx/html/index.html | grep -i api
```

**fix**:
```bash
# Rebuild frontend with correct API URL
cd web
echo "VITE_API_URL=https://api.yourdomain.com" > .env.production
npm run build

# Rebuild and redeploy
docker build -t yt-transcript:latest ..
kubectl rollout restart deployment/yt-transcript-frontend -n yt-transcript
```

---

## Tuning Parameters

### Adjust Scaling Thresholds

```yaml
# Edit HTTPScaledObject
kubectl edit httpscaledobject yt-transcript-api -n yt-transcript

# Tune these parameters:
spec:
  replicas:
    min: 0          # Minimum pods (0 for scale-to-zero)
    max: 10         # Maximum pods under load

  targetPendingRequests: 10   # Requests per pod (lower = more pods)
  cooldownPeriod: 60          # Idle seconds before scale-down
  scaledownPeriod: 120        # Minimum time between scale-downs
```

**examples**:
- **More aggressive scale-up**: targetPendingRequests: 5 (more pods)
- **Faster scale-down**: cooldownPeriod: 30 (30 seconds idle)
- **Keep 1 pod warm**: minReplicas: 1 (no cold starts)

---

### Resource Optimization

**frontend** (minimal, always-on):
```yaml
resources:
  requests: {cpu: 50m, memory: 50Mi}
  limits: {cpu: 100m, memory: 100Mi}
```

**api** (optimized for cold start):
```yaml
resources:
  requests: {cpu: 500m, memory: 512Mi}  # Fast startup
  limits: {cpu: 2000m, memory: 2Gi}     # Peak load
```

---

## Cost Analysis

### Before (Always-On 3 Replicas)

| Component | Pods | RAM | CPU | Uptime |
|:----------|:-----|:----|:----|:-------|
| Frontend+API | 3 | 1.5GB | 1.5 | 100% |

**total**: 1.5GB RAM, 1.5 CPU cores (24/7)

---

### After (Scale-to-Zero)

| Component | Pods | RAM | CPU | Uptime |
|:----------|:-----|:----|:----|:-------|
| Frontend | 1 | 50MB | 0.05 | 100% |
| API (idle) | 0 | 0MB | 0 | 0% |
| API (peak) | 10 | 5GB | 5 | 5-10% |

**average**: 250MB RAM, 0.3 CPU cores (80% idle)

**savings**: 85% resource reduction

---

## Rollback to Always-On

**if_needed**:

```bash
# Delete HTTPScaledObject (returns control to deployment)
kubectl delete httpscaledobject yt-transcript-api -n yt-transcript

# Scale API to 3 replicas manually
kubectl scale deployment yt-transcript-api -n yt-transcript --replicas=3

# Revert Cloudflare config to original
kubectl delete configmap cloudflared-config -n cloudflare-tunnel
kubectl apply -f k8s/cloudflare/configmap.yaml

# Restart cloudflared
kubectl rollout restart deployment/cloudflared -n cloudflare-tunnel

# Delete frontend deployment (optional)
kubectl delete -f k8s/frontend-deployment.yaml
```

---

## Best Practices

**do**:
- Monitor cold start times
- Tune cooldown based on traffic patterns
- Keep frontend always-on for instant UX
- Use minReplicas: 1 if cold starts are unacceptable

**don't**:
- Set cooldownPeriod too low (thrashing)
- Remove KEDA HTTP Add-on (lost requests during scale-up)
- Expect instant API responses during cold start
- Run production without monitoring

---

## Related Documentation

- [Architecture Design](./SCALE-TO-ZERO-ARCHITECTURE.md)
- [KEDA Docs](https://keda.sh/docs/latest/)
- [KEDA HTTP Add-on](https://github.com/kedacore/http-add-on)
- [Cloudflare Tunnel](../k8s/cloudflare/README.md)

---

## Support

**issues**: https://github.com/Ai-Whisperers/yt-transcript-headless/issues
**keda_slack**: https://kubernetes.slack.com/archives/CKZJ36A5D

---

**Version:** 1.0 · **Updated:** 2025-11-17 · **Status:** Production-Ready

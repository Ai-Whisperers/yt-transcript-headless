# Scale-to-Zero Architecture Design

**Doc-Type:** Architecture Design · Version 1.0 · Updated 2025-11-17 · AI Whisperers

On-premise scale-to-zero architecture using Kubernetes KEDA for cost-optimized serverless experience.

---

## Architecture Overview

**strategy** - Kubernetes-native scale-to-zero with KEDA HTTP Add-on
**frontend** - Always-on (static files, minimal resources)
**backend_api** - Scale to 0 when idle, auto-wake on requests
**cost** - $0 (all open-source, on-premise)

---

## Component Breakdown

### 1. Frontend Service (24/7)

**deployment**:
- Type: Separate deployment (nginx serving static files)
- Replicas: 1 (always-on)
- Resources: 50MB RAM, 50m CPU
- Purpose: Serve React UI instantly

**why_always_on**:
- Static files (no compute needed)
- Instant page load (no cold start)
- Minimal resource footprint
- Entry point for users

---

### 2. API Service (Scale-to-Zero)

**deployment**:
- Type: KEDA-managed deployment
- Replicas: 0-10 (auto-scaled)
- Scale to 0: After 60 seconds idle
- Scale up: On HTTP request (2-5 second cold start)
- Resources: 512MB-2GB RAM per pod

**why_scale_to_zero**:
- Transcript extraction is CPU/memory intensive
- Bursty workload (not continuous)
- Save resources when idle
- Auto-scale on demand

---

### 3. KEDA HTTP Add-on (Request Queue)

**component** - HTTP interceptor and scaler
**function**:
- Intercepts requests when API pods = 0
- Queues requests (30-60 seconds buffer)
- Triggers scale-up (0→1+ pods)
- Forwards queued requests when ready
- Monitors idle time for scale-down

**benefits**:
- No lost requests during scale-up
- Transparent to clients
- Automatic cold-start handling

---

### 4. Cloudflare Tunnel (Routing)

**ingress_rules**:
```yaml
ingress:
  # Frontend (always available)
  - hostname: transcript.yourdomain.com
    path: /
    service: http://yt-transcript-frontend.yt-transcript.svc.cluster.local:80

  # API (KEDA HTTP Add-on interceptor)
  - hostname: transcript.yourdomain.com
    path: /api
    service: http://keda-add-ons-http-interceptor-proxy.keda:8080
    originRequest:
      connectTimeout: 60s  # Allow time for cold start
```

**routing**:
- `/` → Frontend (instant)
- `/api` → KEDA interceptor → API (auto-wake)
- `/api-docs` → KEDA interceptor → API

---

## Request Flow

### Frontend Request (Always Fast)

```
User → Cloudflare Edge → Tunnel → Frontend Pod → Static Files
```

**latency** - 20-50ms (no cold start)

---

### API Request (Pods Running)

```
User → Cloudflare Edge → Tunnel → KEDA Interceptor → API Pod → Response
```

**latency** - 100-500ms (normal processing)

---

### API Request (Pods = 0, Cold Start)

```
User → Cloudflare Edge → Tunnel → KEDA Interceptor (queues request)
  ↓
KEDA scales API 0→1 (2-5 seconds)
  ↓
API Pod ready → Interceptor forwards request → Response
```

**latency** - 2-7 seconds (one-time cold start)
**subsequent_requests** - Normal latency (pods stay warm)

---

## Scaling Behavior

### Scale Up Triggers

**http_requests** - Any request to `/api` endpoints
**concurrency** - 10 requests per pod
**scale_up_time** - 2-5 seconds (pod startup)

**example**:
- 0 requests → 0 pods (idle)
- 1 request → Scale to 1 pod
- 50 requests → Scale to 5 pods (10 req/pod)
- 200 requests → Scale to 10 pods (max)

---

### Scale Down Triggers

**idle_time** - 60 seconds with no requests
**grace_period** - 30 seconds to finish in-flight requests
**cooldown** - 2 minutes before next scale-down

**example**:
- Last request at T+0
- Wait 60 seconds (T+60)
- Scale 3→1 pods (T+60)
- Wait 60 seconds (T+120)
- Scale 1→0 pods (T+120)

---

## Resource Allocation

### Frontend (Always-On)

| Resource | Request | Limit |
|:---------|:--------|:------|
| CPU | 50m | 100m |
| Memory | 50Mi | 100Mi |
| Pods | 1 | 1 |

**monthly_cost** - ~$0 (minimal resources)

---

### API (Auto-Scaled)

| Resource | Request | Limit | Per Pod |
|:---------|:--------|:------|:--------|
| CPU | 500m | 2000m | Yes |
| Memory | 512Mi | 2Gi | Yes |
| Pods | 0-10 | 10 max | N/A |

**idle_cost** - $0 (0 pods)
**peak_cost** - Same as before (10 pods max)
**average_cost** - 60-80% savings (pods idle most of time)

---

## KEDA Configuration

### HTTP Add-on Installation

```bash
# Install KEDA operator
helm repo add kedacore https://kedacore.github.io/charts
helm install keda kedacore/keda --namespace keda --create-namespace

# Install KEDA HTTP Add-on
helm install http-add-on kedacore/keda-add-ons-http \
  --namespace keda \
  --set interceptor.replicas=2
```

---

### ScaledObject Definition

```yaml
apiVersion: keda.sh/v1alpha1
kind: HTTPScaledObject
metadata:
  name: yt-transcript-api
  namespace: yt-transcript
spec:
  # Target deployment
  scaleTargetRef:
    name: yt-transcript-api
    kind: Deployment
    service: yt-transcript-api
    port: 3000

  # Scaling parameters
  replicas:
    min: 0  # Scale to zero
    max: 10

  # Target metrics
  targetPendingRequests: 10  # 10 requests per pod

  # Cooldown periods
  cooldownPeriod: 60  # 60 seconds idle before scale down
  scaledownPeriod: 120  # 2 minutes minimum between scale-downs
```

---

## Benefits Analysis

### Cost Savings

**before** (always-on 3 replicas):
- Idle: 3 pods × 512MB = 1.5GB RAM
- Peak: 10 pods × 512MB = 5GB RAM
- Average: ~3GB RAM (continuous)

**after** (scale-to-zero):
- Idle: 0 pods = 0GB RAM (+ frontend 50MB)
- Peak: 10 pods × 512MB = 5GB RAM
- Average: ~0.5GB RAM (20% uptime)

**savings** - 80-90% resource reduction during idle

---

### User Experience

**frontend**:
- ✅ Instant page load (no cold start)
- ✅ Always available
- ✅ No waiting for backend

**api** (first request after idle):
- ⚠️ 2-7 second delay (cold start)
- ✅ Subsequent requests fast
- ✅ Auto-scales under load

**api** (pods already warm):
- ✅ Normal performance
- ✅ No delays
- ✅ Horizontal scaling

---

### Trade-offs

**pros**:
- Massive resource savings when idle
- Automatic scaling on demand
- No manual intervention
- Zero cost when unused

**cons**:
- Cold start latency (2-7 seconds)
- Requires KEDA installation
- More complex than always-on

---

## Deployment Strategy

### Phase 1: Split Frontend/Backend

**create**:
- `k8s/frontend/` - Nginx deployment for static files
- `k8s/backend/` - API deployment (existing)

**separate** because:
- Different scaling strategies
- Different resource requirements
- Independent lifecycle

---

### Phase 2: Install KEDA

```bash
# Install KEDA core
helm install keda kedacore/keda \
  --namespace keda \
  --create-namespace

# Install HTTP Add-on
helm install http-add-on kedacore/keda-add-ons-http \
  --namespace keda
```

---

### Phase 3: Configure HTTPScaledObject

```bash
kubectl apply -f k8s/backend/keda-scaledobject.yaml
```

KEDA takes over scaling:
- Deployment replica count → 0
- KEDA manages scale-up/down
- HTTP interceptor queues requests

---

### Phase 4: Update Cloudflare Tunnel

```yaml
ingress:
  - hostname: transcript.yourdomain.com
    path: /
    service: http://yt-transcript-frontend:80

  - hostname: transcript.yourdomain.com
    path: /api
    service: http://keda-add-ons-http-interceptor-proxy.keda:8080
```

---

## Monitoring

### KEDA Metrics

```bash
# Check scaled object status
kubectl get httpscaledobject -n yt-transcript

# View current replicas
kubectl get hpa -n keda

# Check interceptor logs
kubectl logs -n keda -l app=keda-add-ons-http-interceptor
```

---

### Scaling Events

```bash
# Watch scaling events
kubectl get events -n yt-transcript --watch

# Monitor pod count
watch kubectl get pods -n yt-transcript
```

---

### Cold Start Metrics

**measure**:
- Time to first pod ready
- Queued request count
- P95 latency during scale-up

**target**:
- Cold start < 5 seconds
- Queue depth < 50 requests
- P95 latency < 8 seconds

---

## Alternative: Cloudflare Workers Hybrid

**if_budget_allows** ($5-20/month):

**use_cloudflare_workers** for:
- Request queuing at edge
- Response caching
- API rate limiting

**keep_kubernetes** for:
- Heavy compute (transcript extraction)
- On-premise data processing
- Cost control on compute

**architecture**:
```
User → Cloudflare Worker (queue/cache) → Tunnel → KEDA API
```

**benefits**:
- Instant response from cache
- Queue at edge (no cold start delay)
- Reduced on-premise load

**cost**:
- Workers: $5/month (10M requests)
- Queues: Included in Workers paid plan
- Still cheaper than always-on compute

---

## Recommendation

**implement_keda_first**:
- $0 cost (all open-source)
- On-premise control
- 80-90% resource savings

**evaluate_workers_later**:
- If cold starts are problematic
- If caching would help
- When budget available

---

## Next Steps

1. Split Dockerfile into frontend/backend
2. Create frontend deployment (nginx + static files)
3. Install KEDA to cluster
4. Create HTTPScaledObject for API
5. Update Cloudflare Tunnel routing
6. Test cold start behavior
7. Monitor and tune scaling parameters

---

**Status:** Design complete, ready for implementation
**Cost:** $0 (KEDA is open-source)
**Savings:** 80-90% resource reduction
**Trade-off:** 2-7 second cold start acceptable

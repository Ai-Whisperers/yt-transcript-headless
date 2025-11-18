# Cloudflare Tunnel Setup Guide

**Doc-Type:** Setup Guide · Version 1.0 · Updated 2025-11-17 · AI Whisperers

Complete guide to deploy Cloudflare Tunnel for secure on-premise Kubernetes ingress.

---

## Prerequisites

**required**:
- Cloudflare account (Free tier sufficient)
- Domain name added to Cloudflare
- kubectl access to cluster
- cloudflared CLI installed locally

**optional**:
- Cloudflare API token (for automation)

---

## Installation Steps

### Step 1: Install cloudflared CLI

**macos**:
```bash
brew install cloudflared
```

**linux**:
```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

**windows**:
```powershell
# Download from: https://github.com/cloudflare/cloudflared/releases
# Or use chocolatey:
choco install cloudflared
```

**verify**:
```bash
cloudflared --version
```

---

### Step 2: Authenticate with Cloudflare

```bash
# Login to Cloudflare
cloudflared tunnel login
```

This opens browser for authentication and saves credentials to `~/.cloudflared/cert.pem`.

---

### Step 3: Create Tunnel

```bash
# Create tunnel
cloudflared tunnel create yt-transcript-tunnel

# Output:
# Tunnel credentials written to: ~/.cloudflared/<tunnel-id>.json
# Save the tunnel ID and credentials file location
```

**important**: Save the tunnel ID and credentials file path.

---

### Step 4: Create Kubernetes Secret

```bash
# Create secret from credentials file
kubectl create secret generic cloudflared-credentials \
  --from-file=credentials.json=~/.cloudflared/<tunnel-id>.json \
  --namespace=cloudflare-tunnel
```

**verify**:
```bash
kubectl get secret cloudflared-credentials -n cloudflare-tunnel
```

---

### Step 5: Update ConfigMap

Edit `k8s/cloudflare/configmap.yaml`:

```yaml
tunnel: <TUNNEL_ID>  # Replace with your tunnel ID from Step 3

ingress:
  - hostname: transcript.yourdomain.com  # Replace with your domain
    service: http://yt-transcript-api.yt-transcript.svc.cluster.local:80
```

**apply**:
```bash
kubectl apply -f k8s/cloudflare/configmap.yaml
```

---

### Step 6: Deploy Cloudflare Tunnel

```bash
# Deploy all resources
kubectl apply -f k8s/cloudflare/namespace.yaml
kubectl apply -f k8s/cloudflare/rbac.yaml
kubectl apply -f k8s/cloudflare/configmap.yaml
kubectl apply -f k8s/cloudflare/deployment.yaml

# Wait for pods
kubectl rollout status deployment/cloudflared -n cloudflare-tunnel
```

**verify**:
```bash
kubectl get pods -n cloudflare-tunnel
# Expected: 2/2 Running
```

---

### Step 7: Configure DNS (Cloudflare Dashboard)

```bash
# Route tunnel (creates DNS record automatically)
cloudflared tunnel route dns yt-transcript-tunnel transcript.yourdomain.com
```

**alternative** - Manual DNS (Cloudflare Dashboard):
1. Go to DNS settings
2. Add CNAME record:
   - Name: `transcript`
   - Target: `<tunnel-id>.cfargotunnel.com`
   - Proxy: Enabled (orange cloud)

---

### Step 8: Deploy yt-transcript-api

```bash
# Deploy application (if not already deployed)
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml

# Create secret (development)
kubectl create secret generic yt-transcript-secret \
  --from-literal=CORS_ORIGIN="*" \
  --namespace=yt-transcript

# Deploy app
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Wait for deployment
kubectl rollout status deployment/yt-transcript-api -n yt-transcript
```

---

### Step 9: Test Connection

**internal_test** (from within cluster):
```bash
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://yt-transcript-api.yt-transcript.svc.cluster.local/api/health
```

**external_test** (via Cloudflare):
```bash
# Health check
curl https://transcript.yourdomain.com/api/health

# Extract transcript
curl -X POST https://transcript.yourdomain.com/api/transcribe \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "format": "json"}'
```

**browser**:
- Open: https://transcript.yourdomain.com
- Access Swagger UI: https://transcript.yourdomain.com/api-docs

---

## Verification Checklist

- [ ] cloudflared pods running (2/2)
- [ ] Tunnel shows "connected" in Cloudflare dashboard
- [ ] DNS CNAME record created
- [ ] HTTPS certificate auto-provisioned
- [ ] Health endpoint returns 200
- [ ] API endpoints functional
- [ ] No exposed ports (NodePort removed)

---

## Monitoring

**check_tunnel_status**:
```bash
# View tunnel logs
kubectl logs -n cloudflare-tunnel -l app=cloudflared -f

# Check tunnel health
kubectl get pods -n cloudflare-tunnel

# View metrics
kubectl port-forward -n cloudflare-tunnel svc/cloudflared-metrics 2000:2000
curl http://localhost:2000/metrics
```

**cloudflare_dashboard**:
1. Go to Zero Trust > Access > Tunnels
2. View tunnel status (should show "Healthy")
3. Check request metrics
4. Monitor errors and latency

---

## Troubleshooting

### Pods Not Starting

```bash
# Check pod events
kubectl describe pod -n cloudflare-tunnel -l app=cloudflared

# Common issues:
# 1. Secret not found - verify secret created in Step 4
# 2. ConfigMap not found - verify ConfigMap applied in Step 5
# 3. Image pull errors - check internet connectivity
```

### Tunnel Not Connecting

```bash
# Check logs
kubectl logs -n cloudflare-tunnel -l app=cloudflared

# Common errors:
# - "no such host": DNS misconfiguration
# - "authentication failed": incorrect credentials
# - "tunnel already registered": tunnel ID mismatch
```

### 502 Bad Gateway

**causes**:
- Service not running (check: `kubectl get pods -n yt-transcript`)
- Wrong service name in ConfigMap
- Service port mismatch (should be 80)

**fix**:
```bash
# Verify service exists
kubectl get svc yt-transcript-api -n yt-transcript

# Check service port
kubectl get svc yt-transcript-api -n yt-transcript -o yaml | grep port

# Restart cloudflared
kubectl rollout restart deployment/cloudflared -n cloudflare-tunnel
```

### 404 Not Found

**causes**:
- Hostname not in ingress rules
- Catch-all rule hit

**fix**:
```bash
# Check ConfigMap
kubectl get cm cloudflared-config -n cloudflare-tunnel -o yaml

# Verify hostname matches
# Update ConfigMap if needed
kubectl edit cm cloudflared-config -n cloudflare-tunnel

# Restart cloudflared to reload config
kubectl rollout restart deployment/cloudflared -n cloudflare-tunnel
```

---

## Security Configuration

### Enable WAF (Cloudflare Dashboard)

1. Go to Security > WAF
2. Enable Managed Rules:
   - OWASP Core Ruleset
   - Cloudflare Managed Ruleset
3. Set action: Challenge or Block

### Rate Limiting

1. Go to Security > WAF > Rate limiting rules
2. Create rule:
   - Name: API Rate Limit
   - When incoming requests match: `http.request.uri.path contains "/api/transcribe"`
   - Threshold: 10 requests per minute
   - Action: Block

### SSL/TLS Configuration

1. Go to SSL/TLS
2. Set mode: Full (strict) or Full
3. Edge Certificates: Auto (should already be provisioned)

---

## Scaling

**scale_cloudflared**:
```bash
# Scale to 3 replicas
kubectl scale deployment cloudflared -n cloudflare-tunnel --replicas=3

# Verify
kubectl get pods -n cloudflare-tunnel
```

**autoscaling** (optional):
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cloudflared
  namespace: cloudflare-tunnel
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cloudflared
  minReplicas: 2
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

## Rollback to NodePort

**if_needed**:
```bash
# Revert to NodePort service
kubectl apply -f k8s/service-nodeport-backup.yaml

# Delete Cloudflare resources (optional)
kubectl delete namespace cloudflare-tunnel

# Access via: http://localhost:30100
```

---

## Adding More Services

**example** - Add excel-parser:

1. Edit `k8s/cloudflare/configmap.yaml`:
```yaml
ingress:
  - hostname: transcript.yourdomain.com
    service: http://yt-transcript-api.yt-transcript.svc.cluster.local:80

  - hostname: excel.yourdomain.com  # Add this
    service: http://excel-parser-service.excel-parser.svc.cluster.local:80

  - service: http_status:404
```

2. Apply ConfigMap:
```bash
kubectl apply -f k8s/cloudflare/configmap.yaml
kubectl rollout restart deployment/cloudflared -n cloudflare-tunnel
```

3. Create DNS record:
```bash
cloudflared tunnel route dns yt-transcript-tunnel excel.yourdomain.com
```

---

## Maintenance

**update_cloudflared**:
```bash
# Update to latest image
kubectl set image deployment/cloudflared \
  cloudflared=cloudflare/cloudflared:latest \
  -n cloudflare-tunnel

# Or edit deployment
kubectl edit deployment cloudflared -n cloudflare-tunnel
```

**rotate_credentials**:
```bash
# Create new tunnel
cloudflared tunnel create yt-transcript-tunnel-v2

# Update secret
kubectl create secret generic cloudflared-credentials \
  --from-file=credentials.json=~/.cloudflared/<new-tunnel-id>.json \
  --namespace=cloudflare-tunnel \
  --dry-run=client -o yaml | kubectl apply -f -

# Update ConfigMap with new tunnel ID
kubectl edit cm cloudflared-config -n cloudflare-tunnel

# Restart deployment
kubectl rollout restart deployment/cloudflared -n cloudflare-tunnel

# Delete old tunnel (after verification)
cloudflared tunnel delete <old-tunnel-id>
```

---

## Cost Optimization

**free_tier** (current usage):
- Unlimited bandwidth ✅
- Unlimited requests ✅
- DDoS protection ✅
- SSL certificates ✅
- Basic WAF rules ✅

**when_to_upgrade** ($20/month Pro):
- Advanced WAF rules
- Image optimization
- Mobile optimization
- More Page Rules (3 included)

**current_recommendation**: Stay on Free tier (sufficient for production).

---

## Related Documentation

- [Integration Plan](../../docs/CLOUDFLARE-INTEGRATION-PLAN.md)
- [Architecture Comparison](../../docs/ARCHITECTURE-COMPARISON.md)
- [Executive Summary](../../docs/CLOUDFLARE-EXECUTIVE-SUMMARY.md)

---

## Support

**cloudflare_docs**: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
**community_forum**: https://community.cloudflare.com/
**project_issues**: https://github.com/Ai-Whisperers/yt-transcript-headless/issues

---

**Status:** Ready for deployment · **Estimated Time:** 30-60 minutes

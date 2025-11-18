# On-Premise Kubernetes Deployment Guide

**Doc-Type:** On-Premise Deployment Guide · Version 1.0 · Updated 2025-11-17 · AI Whisperers

Complete guide for deploying YouTube Transcript Extractor to on-premise Kubernetes cluster with persistent URL access.

---

## Architecture Overview

**deployment_model** - On-premise Kubernetes with Docker runtime
**persistence_strategy** - Stateless service (no PV/PVC required)
**url_strategy** - NodePort service with fixed port allocation
**port_allocation** - Aligned with `~/.claude/mcp/configs/ports.env`

---

## Current Cluster Status

**cluster_type** - Docker Desktop Kubernetes v1.34.1
**control_plane** - https://kubernetes.docker.internal:6443
**nodes** - 1 node (docker-desktop)
**dns** - CoreDNS running (2 replicas)

**existing_services**:
- excel-parser (NodePort 30800, 30815)

---

## Port Strategy Alignment

**port_configuration** - `~/.claude/mcp/configs/ports.env`

**allocated_port** - 30100 (API Services range: 30100-30199)
**container_port** - 3000 (application default)
**service_port** - 80 (standard HTTP)

**persistent_url**:
- Primary: `http://localhost:30100/api`
- Swagger UI: `http://localhost:30100/api-docs`
- Health: `http://localhost:30100/api/health`

---

## Prerequisites

### Required Components

**kubernetes_cluster** - v1.24+ (Docker Desktop or on-premise)
**kubectl** - v1.24+ configured and connected
**docker** - For building images
**bash** - For running deployment script (Git Bash on Windows)

### Optional Components

**metrics_server** - For HorizontalPodAutoscaler (HPA)
**nginx_ingress** - For domain-based routing (production)
**cert_manager** - For TLS certificates (production)

### Install Metrics Server (Optional)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# For Docker Desktop, patch to disable TLS verification
kubectl patch deployment metrics-server -n kube-system --type='json' \
  -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--kubelet-insecure-tls"}]'
```

---

## Quick Start Deployment

### Option 1: Automated Deployment Script

```bash
# Make script executable
chmod +x k8s/deploy-onpremise.sh

# Run deployment
./k8s/deploy-onpremise.sh
```

The script will:
1. Verify cluster access
2. Build Docker image
3. Create namespace
4. Create ConfigMap and Secret
5. Deploy application
6. Display access information

### Option 2: Manual Deployment

```bash
# 1. Build Docker image
docker build -t yt-transcript:latest .

# 2. Create namespace
kubectl apply -f k8s/namespace.yaml

# 3. Create configuration
kubectl apply -f k8s/configmap.yaml

# 4. Create secret (development)
kubectl create secret generic yt-transcript-secret \
  --from-literal=CORS_ORIGIN="*" \
  --namespace=yt-transcript

# 5. Deploy application
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# 6. Wait for deployment
kubectl rollout status deployment/yt-transcript-api -n yt-transcript

# 7. Verify
kubectl get pods -n yt-transcript
```

---

## Accessing the Service

### Persistent URL (NodePort)

**primary_endpoint** - `http://localhost:30100`

**api_endpoints**:
- `POST /api/transcribe` - Extract transcript
- `GET /api/health` - Health check
- `GET /api/formats` - Supported formats
- `GET /api-docs` - Swagger UI

### Testing the API

```bash
# Health check
curl http://localhost:30100/api/health

# Extract transcript (text format)
curl -X POST http://localhost:30100/api/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "format": "text"
  }'

# Extract transcript (JSON format)
curl -X POST http://localhost:30100/api/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "format": "json"
  }'
```

### Web Interface

Open browser: `http://localhost:30100`

The React frontend provides:
- Video URL input
- Format selection (text, json, srt, vtt)
- Real-time extraction status
- Copy/download results

---

## Service Architecture

### NodePort Service (Primary)

```yaml
type: NodePort
port: 80          # Service port
targetPort: 3000  # Container port
nodePort: 30100   # External access (fixed)
```

**use_case** - External access with persistent URL
**access** - `http://<node-ip>:30100`

### ClusterIP Service (Internal)

```yaml
type: ClusterIP
port: 80
targetPort: 3000
```

**use_case** - Cross-namespace communication
**access** - `http://yt-transcript-api-internal.yt-transcript.svc.cluster.local`

### Headless Service (Discovery)

```yaml
type: ClusterIP
clusterIP: None
```

**use_case** - Pod discovery for StatefulSet compatibility
**access** - `yt-transcript-api-headless.yt-transcript.svc.cluster.local`

---

## Configuration Management

### ConfigMap (k8s/configmap.yaml)

**non_sensitive_config**:
- NODE_ENV=production
- PORT=3000
- LOG_LEVEL=info
- RATE_LIMIT_MAX=10 (requests per minute)
- QUEUE_MAX_CONCURRENT=3 (parallel browser instances)
- ENABLE_STEALTH=true

### Secret (k8s/secret.yaml)

**sensitive_config**:
- CORS_ORIGIN (allowed origins)

**production_note** - Update CORS_ORIGIN with actual domain

### Update Configuration

```bash
# Edit ConfigMap
kubectl edit configmap yt-transcript-config -n yt-transcript

# Edit Secret
kubectl edit secret yt-transcript-secret -n yt-transcript

# Restart pods to apply changes
kubectl rollout restart deployment/yt-transcript-api -n yt-transcript
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

### Autoscaling (HPA)

**prerequisites** - Metrics Server installed

```bash
# Enable HPA
kubectl apply -f k8s/hpa.yaml

# Verify HPA status
kubectl get hpa -n yt-transcript

# Watch autoscaling
watch kubectl get hpa -n yt-transcript
```

**hpa_configuration**:
- Min replicas: 3
- Max replicas: 10
- CPU threshold: 70%
- Memory threshold: 80%

---

## Monitoring

### Pod Status

```bash
# List pods
kubectl get pods -n yt-transcript

# Detailed pod info
kubectl describe pod <pod-name> -n yt-transcript

# Resource usage
kubectl top pods -n yt-transcript
```

### Logs

```bash
# All pods (follow)
kubectl logs -n yt-transcript -l app=yt-transcript-api --tail=100 -f

# Specific pod
kubectl logs -n yt-transcript <pod-name> -f

# Previous pod instance (after restart)
kubectl logs -n yt-transcript <pod-name> --previous
```

### Service Status

```bash
# List services
kubectl get svc -n yt-transcript

# Detailed service info
kubectl describe svc yt-transcript-api -n yt-transcript

# Check endpoints
kubectl get endpoints -n yt-transcript
```

---

## Troubleshooting

### Pods Not Starting

**symptom** - Pods stuck in Pending/CrashLoopBackOff

```bash
# Check pod events
kubectl describe pod <pod-name> -n yt-transcript

# Check logs
kubectl logs <pod-name> -n yt-transcript

# Common issues:
# - Image not found: Verify Docker image exists
# - ConfigMap/Secret missing: kubectl get cm,secret -n yt-transcript
# - Resource limits: kubectl top nodes
```

### NodePort Not Accessible

**symptom** - Cannot access http://localhost:30100

```bash
# Verify service created
kubectl get svc yt-transcript-api -n yt-transcript

# Check NodePort assignment
kubectl get svc yt-transcript-api -n yt-transcript -o yaml | grep nodePort

# Verify pods are ready
kubectl get pods -n yt-transcript

# Test with port-forward (bypass NodePort)
kubectl port-forward -n yt-transcript svc/yt-transcript-api 8080:80
curl http://localhost:8080/api/health
```

### Browser Launch Failures

**symptom** - 500 errors with "Browser launch failed"

**solution** - Increase shared memory

Add to `k8s/deployment.yaml`:
```yaml
volumeMounts:
- name: dshm
  mountPath: /dev/shm

volumes:
- name: dshm
  emptyDir:
    medium: Memory
    sizeLimit: 1Gi
```

Apply changes:
```bash
kubectl apply -f k8s/deployment.yaml
```

### High Memory Usage

**symptom** - Pods restarted with OOMKilled

```bash
# Check memory usage
kubectl top pods -n yt-transcript

# Increase memory limits
kubectl set resources deployment yt-transcript-api \
  -n yt-transcript \
  --limits=memory=3Gi \
  --requests=memory=1Gi
```

---

## Production Hardening

### Security Checklist

- [ ] Update CORS_ORIGIN in secret to specific domains
- [ ] Enable network policies (restrict pod-to-pod communication)
- [ ] Configure pod security standards
- [ ] Scan Docker image for vulnerabilities
- [ ] Use dedicated namespace with resource quotas
- [ ] Enable audit logging
- [ ] Implement pod disruption budgets

### Network Policy Example

Create `k8s/network-policy.yaml`:
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
  - ports:
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

Apply:
```bash
kubectl apply -f k8s/network-policy.yaml
```

---

## Migration to Domain-Based Access

### Option 1: NGINX Ingress (Recommended)

**install_nginx_ingress**:
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/baremetal/deploy.yaml
```

**configure_ingress**:
```bash
# Update k8s/ingress.yaml with your domain
# Change: api.yourdomain.com -> your-actual-domain.com

kubectl apply -f k8s/ingress.yaml
```

**dns_configuration**:
```bash
# Get Ingress NodePort
kubectl get svc -n ingress-nginx

# Configure DNS A record:
# your-domain.com -> <cluster-ip>:<ingress-nodeport>
```

### Option 2: MetalLB (Bare Metal Load Balancer)

**use_case** - On-premise clusters without cloud load balancer

```bash
# Install MetalLB
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.13.12/config/manifests/metallb-native.yaml

# Configure IP address pool
# See: https://metallb.universe.tf/installation/
```

---

## Cleanup

### Remove Application

```bash
# Delete all resources
kubectl delete namespace yt-transcript
```

### Selective Cleanup

```bash
# Delete deployment and service
kubectl delete -f k8s/deployment.yaml
kubectl delete -f k8s/service.yaml

# Keep namespace and config
```

---

## Useful Commands Reference

```bash
# === Deployment ===
kubectl apply -f k8s/                          # Deploy all manifests
kubectl rollout status deployment/yt-transcript-api -n yt-transcript  # Watch rollout
kubectl rollout restart deployment/yt-transcript-api -n yt-transcript # Restart pods

# === Monitoring ===
kubectl get all -n yt-transcript               # All resources
kubectl top pods -n yt-transcript              # Resource usage
kubectl logs -n yt-transcript -l app=yt-transcript-api -f  # Stream logs

# === Scaling ===
kubectl scale deployment/yt-transcript-api -n yt-transcript --replicas=5  # Manual scale
kubectl get hpa -n yt-transcript               # Autoscaler status

# === Debugging ===
kubectl describe pod <pod-name> -n yt-transcript  # Pod details
kubectl exec -it <pod-name> -n yt-transcript -- sh  # Shell into pod
kubectl port-forward -n yt-transcript svc/yt-transcript-api 8080:80  # Local proxy

# === Configuration ===
kubectl edit configmap yt-transcript-config -n yt-transcript  # Edit config
kubectl edit secret yt-transcript-secret -n yt-transcript     # Edit secret
```

---

## Related Documentation

**project_docs**:
- [Main README](../README.md) - Project overview
- [K8s Deployment Guide](./README.md) - General Kubernetes guide
- [Architecture](../docs/ARCHITECTURE.md) - System design
- [API Documentation](../docs/API.md) - REST API reference

**cluster_template_docs**:
- [Port Strategy](~/.claude/mcp/PORT-STRATEGY.md) - Port allocation rules
- [Getting Started](~/.claude/mcp/GETTING-STARTED.md) - Cluster setup
- [MCP Architecture](~/.claude/mcp/ARCHITECTURE.md) - MCP server integration

---

## Support

**issues** - https://github.com/Ai-Whisperers/yt-transcript-headless/issues
**documentation** - https://github.com/Ai-Whisperers/yt-transcript-headless
**cluster_template** - https://github.com/Ai-Whisperers/cluster-template

---

**Version:** 1.0 · **Updated:** 2025-11-17 · **Deployment:** On-Premise · **Port:** 30100

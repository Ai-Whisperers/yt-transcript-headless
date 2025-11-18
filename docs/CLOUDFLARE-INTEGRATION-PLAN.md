# Cloudflare Tunnel Integration Plan

**Doc-Type:** Architecture Plan · Version 1.0 · Updated 2025-11-17 · AI Whisperers

Detailed plan to migrate from NodePort to Cloudflare Tunnel for production security while maintaining on-premise hosting.

---

## Architecture Overview

**current_state** - NodePort (30100) for external access
**target_state** - Cloudflare Tunnel + ClusterIP (no exposed ports)

**strategy**:
- Cloudflare Edge: Security, SSL/TLS, DDoS, WAF, CDN, DNS
- Cloudflare Tunnel: Secure outbound-only connection
- Kubernetes: ClusterIP services (internal only)
- On-Premise: Compute, storage, 24/7 runtime

---

## Service Inventory

**current_services**:

| Service | Type | Port | Protocol | Access |
|:--------|:-----|:-----|:---------|:-------|
| yt-transcript-api | Docker | 3000 | HTTP | localhost:3000 |
| excel-parser-java | NodePort | 30800 | HTTP | localhost:30800 |
| excel-parser-python | NodePort | 30815 | HTTP | localhost:30815 |

**target_services**:

| Service | Type | Internal | External | Tunnel |
|:--------|:-----|:---------|:---------|:-------|
| yt-transcript-api | ClusterIP | 80 | transcript.yourdomain.com | Yes |
| excel-parser | ClusterIP | 80 | excel.yourdomain.com | Yes |

---

## Implementation Phases

### Phase 1: Cloudflare Account Setup

**duration** - 30 minutes

**tasks**:
- Create/configure Cloudflare account
- Add domain to Cloudflare DNS
- Update nameservers at domain registrar
- Verify DNS propagation
- Create API token with Tunnel permissions

**deliverables**:
- Cloudflare account with verified domain
- API token (scope: Account.Cloudflare Tunnel:Edit)
- Zone ID and Account ID documented

---

### Phase 2: Cloudflared Deployment (Kubernetes)

**duration** - 1 hour

**components**:
- Namespace: cloudflare-tunnel
- Secret: tunnel-credentials (API token)
- ConfigMap: tunnel-config (ingress rules)
- Deployment: cloudflared (2 replicas)
- ServiceAccount + RBAC

**files_to_create**:
- k8s/cloudflare/namespace.yaml
- k8s/cloudflare/secret.yaml (template)
- k8s/cloudflare/configmap.yaml
- k8s/cloudflare/deployment.yaml
- k8s/cloudflare/rbac.yaml

**ingress_rules**:
```yaml
ingress:
  - hostname: transcript.yourdomain.com
    service: http://yt-transcript-api.yt-transcript.svc.cluster.local:80
  - hostname: excel.yourdomain.com
    service: http://excel-parser-service.excel-parser.svc.cluster.local:80
  - service: http_status:404
```

---

### Phase 3: Service Migration (yt-transcript-api)

**duration** - 30 minutes

**changes**:
- Update k8s/service.yaml: NodePort → ClusterIP
- Remove nodePort: 30100
- Keep port: 80, targetPort: 3000
- Deploy to Kubernetes (currently only in Docker)

**migration_steps**:
1. Stop Docker Compose: `docker-compose down`
2. Deploy to Kubernetes: `kubectl apply -f k8s/`
3. Verify pods: `kubectl get pods -n yt-transcript`
4. Test internal: `kubectl port-forward -n yt-transcript svc/yt-transcript-api 8080:80`

**rollback_plan** - Keep NodePort service as `-nodeport.yaml` backup

---

### Phase 4: DNS & Tunnel Configuration

**duration** - 30 minutes

**cloudflare_dns**:
- Create CNAME: transcript.yourdomain.com → tunnel-id.cfargotunnel.com
- Create CNAME: excel.yourdomain.com → tunnel-id.cfargotunnel.com
- Proxy status: Enabled (orange cloud)

**ssl_tls**:
- Mode: Full (strict) or Full
- Edge certificates: Auto-provisioned by Cloudflare
- Origin certificates: Not required (Tunnel is authenticated)

**security_rules**:
- WAF: Enable managed rules
- Rate limiting: 100 requests/minute per IP
- Bot protection: Enable challenge
- DDoS: Auto-enabled

---

### Phase 5: Testing & Validation

**duration** - 1 hour

**internal_tests**:
```bash
# Test ClusterIP service
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://yt-transcript-api.yt-transcript.svc.cluster.local/api/health

# Check tunnel status
kubectl logs -n cloudflare-tunnel -l app=cloudflared
```

**external_tests**:
```bash
# Health check via Cloudflare
curl https://transcript.yourdomain.com/api/health

# Extract transcript
curl -X POST https://transcript.yourdomain.com/api/transcribe \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "format": "json"}'

# Verify SSL
curl -vI https://transcript.yourdomain.com 2>&1 | grep -i "subject:"
```

**performance_tests**:
- Latency: < 100ms additional overhead
- Throughput: 1000+ requests/minute
- Tunnel health: 99.9% uptime

---

### Phase 6: Excel Parser Migration (Optional)

**duration** - 30 minutes

**scope** - Migrate existing excel-parser service

**changes**:
- Update excel-parser service: NodePort → ClusterIP
- Add to Cloudflare Tunnel ingress rules
- Remove NodePort 30800, 30815

**benefits**:
- Unified security posture
- No exposed ports
- Cloudflare protection for all services

---

## Configuration Files

### k8s/cloudflare/deployment.yaml

**image** - cloudflare/cloudflared:latest
**replicas** - 2 (high availability)
**args** - `["tunnel", "--config", "/etc/cloudflared/config.yaml", "run"]`

**resource_limits**:
- CPU: 100m request, 500m limit
- Memory: 128Mi request, 256Mi limit

**volumes**:
- config: ConfigMap (tunnel-config)
- credentials: Secret (tunnel-credentials)

---

### k8s/cloudflare/configmap.yaml

**tunnel_config**:
```yaml
tunnel: <tunnel-id>
credentials-file: /etc/cloudflared/creds.json
ingress:
  - hostname: transcript.yourdomain.com
    service: http://yt-transcript-api.yt-transcript.svc.cluster.local:80
  - service: http_status:404
```

**features**:
- HTTP/2 enabled
- No-TLS-verify: false (strict TLS)
- Retries: 5
- Keep-alive: 30s

---

### k8s/service.yaml (Updated)

**before**:
```yaml
type: NodePort
nodePort: 30100
```

**after**:
```yaml
type: ClusterIP
# No nodePort field
```

**impact** - No external access without Cloudflare Tunnel

---

## Security Enhancements

### Cloudflare WAF Rules

**managed_rulesets**:
- OWASP Core Ruleset
- Cloudflare Managed Ruleset
- Cloudflare Bot Management

**custom_rules**:
- Block non-GET/POST methods on /api-docs
- Rate limit /api/transcribe: 10 req/min per IP
- Challenge suspicious user agents
- Block countries (optional)

---

### Network Policies (Kubernetes)

**restrict_egress**:
```yaml
# Only allow cloudflared to reach services
policyTypes:
  - Ingress
ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: cloudflare-tunnel
```

**restrict_pod_communication**:
- yt-transcript-api: Allow from cloudflared only
- excel-parser: Allow from cloudflared only

---

### Zero Trust Access (Optional)

**cloudflare_access**:
- Require authentication for /api-docs
- Public access for /api/transcribe
- IP allowlist for admin endpoints
- Service tokens for API integrations

---

## Monitoring & Observability

### Cloudflare Analytics

**metrics**:
- Request count by endpoint
- Response status codes
- Geographic distribution
- Threat mitigation events
- Bandwidth usage

**alerts**:
- Error rate > 5%
- Response time > 1s (95th percentile)
- WAF block rate spike
- Tunnel disconnection

---

### Kubernetes Monitoring

**tunnel_health**:
```bash
# Check tunnel pods
kubectl get pods -n cloudflare-tunnel

# View tunnel logs
kubectl logs -n cloudflare-tunnel -l app=cloudflared -f

# Monitor connections
kubectl exec -n cloudflare-tunnel <pod> -- cloudflared tunnel info
```

**service_health**:
- Existing health checks remain unchanged
- Monitor via /api/health through tunnel

---

## Cost Analysis

**cloudflare_free_tier**:
- Unlimited bandwidth
- Unlimited requests
- DDoS protection
- SSL/TLS certificates
- Basic WAF rules
- 1 user Access seat

**cloudflare_pro** ($20/month):
- Advanced WAF
- Image optimization
- Mobile optimization
- 3 Page Rules

**on_premise_costs**:
- No change (already running)
- Additional: ~100MB RAM for cloudflared

---

## Rollback Plan

### Emergency Rollback (5 minutes)

```bash
# Revert to NodePort
kubectl apply -f k8s/service-nodeport-backup.yaml

# Access via: http://localhost:30100
```

### Graceful Rollback (15 minutes)

1. Update DNS TTL to 60s (1 hour before rollback)
2. Deploy NodePort service alongside ClusterIP
3. Update DNS to point to NodePort IP
4. Wait for DNS propagation
5. Delete Cloudflare Tunnel resources

---

## Migration Timeline

**total_duration** - 4-6 hours (including testing)

| Phase | Duration | Dependencies |
|:------|:---------|:-------------|
| Cloudflare Setup | 30 min | Domain access |
| Cloudflared Deploy | 1 hour | API token |
| Service Migration | 30 min | K8s access |
| DNS Configuration | 30 min | DNS propagation |
| Testing | 1 hour | All above |
| Excel Migration | 30 min | Optional |

**recommended_schedule**:
- Day 1: Phase 1-2 (setup + deployment)
- Day 2: Phase 3-5 (migration + testing)
- Day 3: Phase 6 (excel-parser migration)

---

## Success Criteria

**functional**:
- [x] Service accessible via https://transcript.yourdomain.com
- [x] SSL/TLS certificate auto-provisioned
- [x] No exposed ports on cluster
- [x] Health checks passing
- [x] API endpoints functional

**performance**:
- [x] Response time < 500ms (95th percentile)
- [x] Tunnel uptime > 99.9%
- [x] No packet loss
- [x] Concurrent connections: 100+

**security**:
- [x] WAF enabled and blocking threats
- [x] DDoS protection active
- [x] Rate limiting enforced
- [x] No direct IP access to services

---

## Future Enhancements

**phase_2**:
- Cloudflare Workers for edge computing
- Load balancing across multiple clusters
- Geo-routing for global distribution
- Cloudflare R2 for transcript caching

**phase_3**:
- Cloudflare Access for authentication
- Service Mesh integration (Istio)
- Multi-region tunnel deployment
- Advanced bot protection

---

## Documentation Updates Required

**files_to_update**:
- README.md: Update access URLs
- k8s/README.md: Add Cloudflare deployment section
- k8s/ONPREMISE-DEPLOYMENT.md: Add "with Cloudflare" variant
- docs/DEPLOYMENT.md: Update production deployment guide

**new_files**:
- k8s/cloudflare/README.md: Cloudflare Tunnel setup guide
- docs/CLOUDFLARE-SETUP.md: Step-by-step Cloudflare configuration
- docs/TROUBLESHOOTING-CLOUDFLARE.md: Common issues

---

## Next Steps

1. Review and approve this plan
2. Create Cloudflare account / verify domain access
3. Generate Cloudflare API token
4. Create Kubernetes manifests (Phase 2)
5. Test in development namespace first
6. Execute migration (Phase 3-5)

---

**Approved By:** ___________ · **Date:** ___________ · **Target Completion:** ___________

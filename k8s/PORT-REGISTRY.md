# Port Registry

**Doc-Type:** Port Allocation Registry · Version 1.0 · Updated 2025-11-17 · AI Whisperers

Port allocation registry for YouTube Transcript Extractor aligned with `~/.claude/mcp/configs/ports.env` strategy.

---

## Port Allocation Strategy

**source** - `~/.claude/mcp/configs/ports.env`
**range** - API Services: 30100-30199
**assigned** - 30100

---

## Registered Ports

| Port  | Type     | Service              | Protocol | Purpose                    | Status |
|:------|:---------|:---------------------|:---------|:---------------------------|:-------|
| 30100 | NodePort | yt-transcript-api    | TCP      | External API access        | Active |
| 3000  | Internal | Container port       | TCP      | Application server         | Active |
| 80    | Service  | ClusterIP port       | TCP      | Internal service           | Active |

---

## Port Ranges Reference

**api_services** - 30100-30199 (API Services)
**web_services** - 30000-30099 (Web Services)
**databases** - 30200-30299 (Database Services)
**message_queues** - 30300-30399 (Message Queue Services)
**monitoring** - 30400-30499 (Monitoring Services)
**development** - 30800-30899 (Development/Testing)
**custom** - 30900-31999 (Custom Applications)

---

## Access URLs

**primary** - `http://localhost:30100`
**api_base** - `http://localhost:30100/api`
**health** - `http://localhost:30100/api/health`
**swagger** - `http://localhost:30100/api-docs`

**internal** - `http://yt-transcript-api-internal.yt-transcript.svc.cluster.local`

---

## Conflict Resolution

**existing_allocations** (from cluster scan):
- 30800: excel-parser-service (port 8000)
- 30815: excel-parser-service (port 8815)

**no_conflicts** - Port 30100 is available

---

## Future Allocations

**reserved_for_expansion**:
- 30101-30110: Additional API instances or versions
- 30111-30115: Monitoring/metrics endpoints
- 30116-30120: Admin/management interfaces

---

## Change Log

| Date       | Port  | Action    | Reason                           |
|:-----------|:------|:----------|:---------------------------------|
| 2025-11-17 | 30100 | Assigned  | Initial deployment (API service) |

---

## Validation

```bash
# Check current port allocations
kubectl get svc --all-namespaces | grep NodePort

# Verify 30100 is listening
curl http://localhost:30100/api/health

# Check for conflicts
netstat -an | grep 30100
```

---

**Maintainer:** AI Whisperers · **Last Updated:** 2025-11-17

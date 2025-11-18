# Cloudflare Official Documentation

**Fetched:** 2025-11-17
**Source List:** `local/cloudflare-url.md`

This directory contains official Cloudflare documentation fetched for reference in the YouTube Transcript Extractor project.

---

## Documentation Files

### Fundamental Documentation

**cloudflare-tunnel.md** - Cloudflare Tunnel
- Secure on-premise connectivity without exposed ports
- Outbound-only connections via `cloudflared` daemon
- **Relevance**: Core infrastructure for production deployment

**cloudflare-workers.md** - Cloudflare Workers
- Serverless execution platform at Cloudflare Edge
- Queue support for asynchronous processing
- **Relevance**: Evaluated for scale-to-zero (not chosen, using KEDA instead)

**cloudflare-pages.md** - Cloudflare Pages
- Full-stack application deployment
- Git integration and direct upload
- **Relevance**: Potential frontend hosting alternative

**cloudflare-cli-tutorial.md** - CLI Tutorial
- `cloudflared` command-line tool usage
- Authentication and tunnel management
- **Relevance**: Required for tunnel setup and configuration

### Exploratory Documentation

**cloudflare-vectorize.md** - Vectorize
- Vector database for AI-powered applications
- Embeddings storage and semantic search
- **Relevance**: Future enhancement for transcript search

---

## Current Implementation

**Using**:
- Cloudflare Tunnel (on-premise → edge security)
- Free tier (unlimited bandwidth, DDoS, WAF, SSL)

**Not using** (evaluated but not chosen):
- Workers (serverless compute) - Requires paid plan, off-premise
- Pages (frontend hosting) - Current: nginx on K8s
- Vectorize (vector DB) - Out of current scope

**Decision rationale**: See `SCALE-TO-ZERO-REPORT.md` for full analysis

---

## Architecture Decision

**Chosen approach**:
- Cloudflare Tunnel: Edge security and ingress
- Kubernetes KEDA: On-premise scale-to-zero
- nginx: Frontend serving (always-on)

**Why not Cloudflare Workers**:
- Maintains on-premise hosting strategy
- $0 cost (KEDA is open-source)
- Full control over scaling logic
- Acceptable cold start for use case (2-7s)

---

## Documentation Updates

These files are fetched documentation and should be updated periodically:

```bash
# Re-fetch documentation (if URLs change)
# Update local/cloudflare-url.md with new URLs
# Run fetch process again
```

**Last fetched**: 2025-11-17

---

## Related Project Documentation

**Implementation**:
- `k8s/cloudflare/` - Tunnel deployment manifests
- `k8s/cloudflare/README.md` - Setup guide
- `CLOUDFLARE-IMPLEMENTATION-REPORT.md` - Full implementation

**Scale-to-Zero**:
- `docs/SCALE-TO-ZERO-ARCHITECTURE.md` - Architecture design
- `docs/SCALE-TO-ZERO-SETUP.md` - Deployment guide
- `SCALE-TO-ZERO-REPORT.md` - Implementation report

---

## External Links

**Official Cloudflare Docs**:
- https://developers.cloudflare.com/
- https://developers.cloudflare.com/cloudflare-one/
- https://developers.cloudflare.com/workers/

**Source URL List**: `local/cloudflare-url.md`

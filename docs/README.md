# Documentation Index
**Doc-Type:** Documentation Index · Version 1.0.0 · Updated 2025-11-19 · AI Whisperers

## Purpose

This directory contains all project documentation organized by topic. Start here to navigate the documentation based on your role or needs.

---

## Quick Navigation

### 🚀 Getting Started
- [Main README](../README.md) - Project overview and quick start
- [Project Structure](STRUCTURE.md) - Understanding the codebase organization
- [Local Development](../local-dev/README.md) - Development environment setup

### 🏗️ Architecture & Design
- [Architecture](ARCHITECTURE.md) - System architecture and design patterns
- [Architecture Comparison](ARCHITECTURE-COMPARISON.md) - Evaluation of different architectural approaches
- [API Design](API.md) - RESTful API specification and endpoints

### 🐳 Deployment
- [Deployment Guide](DEPLOYMENT.md) - Multi-platform deployment instructions
- [Docker Maintenance](DOCKER-MAINTENANCE.md) - Docker operations and best practices
- [Kubernetes On-Premise](../k8s/ONPREMISE-DEPLOYMENT.md) - On-premise Kubernetes deployment
- [Kubernetes Port Registry](../k8s/PORT-REGISTRY.md) - NodePort allocation strategy

### ☁️ Cloud Platform Integration
- [Cloudflare Executive Summary](CLOUDFLARE-EXECUTIVE-SUMMARY.md) - High-level overview
- [Cloudflare Integration Plan](CLOUDFLARE-INTEGRATION-PLAN.md) - Implementation roadmap
- [Scale-to-Zero Architecture](SCALE-TO-ZERO-ARCHITECTURE.md) - Serverless design patterns
- [Scale-to-Zero Setup](SCALE-TO-ZERO-SETUP.md) - Implementation guide

#### Cloudflare Specific
- [Cloudflare Overview](cloudflare/README.md) - Index of Cloudflare documentation
- [Cloudflare Workers](cloudflare/cloudflare-workers.md) - Workers deployment
- [Cloudflare Pages](cloudflare/cloudflare-pages.md) - Frontend hosting
- [Cloudflare Tunnel](cloudflare/cloudflare-tunnel.md) - Secure ingress
- [Cloudflare Vectorize](cloudflare/cloudflare-vectorize.md) - Vector database
- [Cloudflare CLI Tutorial](cloudflare/cloudflare-cli-tutorial.md) - CLI usage guide

### 🤖 MCP Protocol
- [MCP Quick Start](mcp/MCP-QUICKSTART.md) - Getting started with MCP integration
- [MCP Toolkit](mcp/MCP-TOOLKIT.md) - Available tools and configuration

### 🧪 Testing & Quality
- [Test Failures Analysis](TEST-FAILURES-ANALYSIS.md) - Known issues and resolutions
- [Stealth Test Report](../api/tests/reports/stealth-test-interim-2025-11-16.md) - Browser stealth validation

### 📈 Improvements & Roadmap
- [Improvements Summary](IMPROVEMENTS-SUMMARY.md) - Recent enhancements and future plans

### 🔮 Future Features
- [Future Features](future/) - Planned features and experimental ideas

---

## Documentation by Role

### For Developers

**First-time setup:**
1. [Main README](../README.md) - Understand the project
2. [Project Structure](STRUCTURE.md) - Learn the codebase organization
3. [Local Development](../local-dev/README.md) - Set up development environment
4. [Architecture](ARCHITECTURE.md) - Understand design patterns

**Daily development:**
- [API Design](API.md) - API endpoints and request/response formats
- [Docker Maintenance](DOCKER-MAINTENANCE.md) - Docker operations
- [Test Failures Analysis](TEST-FAILURES-ANALYSIS.md) - Troubleshooting tests

### For DevOps Engineers

**Deployment:**
1. [Deployment Guide](DEPLOYMENT.md) - Overview of deployment options
2. [Docker Maintenance](DOCKER-MAINTENANCE.md) - Container operations
3. [Kubernetes On-Premise](../k8s/ONPREMISE-DEPLOYMENT.md) - K8s deployment

**Cloud integration:**
- [Cloudflare Integration Plan](CLOUDFLARE-INTEGRATION-PLAN.md) - Cloudflare setup
- [Scale-to-Zero Architecture](SCALE-TO-ZERO-ARCHITECTURE.md) - Serverless patterns
- [Scale-to-Zero Setup](SCALE-TO-ZERO-SETUP.md) - Implementation steps

### For Architects

**System design:**
- [Architecture](ARCHITECTURE.md) - Current architecture
- [Architecture Comparison](ARCHITECTURE-COMPARISON.md) - Alternative approaches
- [Scale-to-Zero Architecture](SCALE-TO-ZERO-ARCHITECTURE.md) - Serverless design

**Strategic planning:**
- [Cloudflare Executive Summary](CLOUDFLARE-EXECUTIVE-SUMMARY.md) - High-level overview
- [Improvements Summary](IMPROVEMENTS-SUMMARY.md) - Evolution and roadmap

### For AI/MCP Integration

**MCP setup:**
1. [MCP Quick Start](mcp/MCP-QUICKSTART.md) - Get started quickly
2. [MCP Toolkit](mcp/MCP-TOOLKIT.md) - Available tools and usage

---

## Documentation Structure

```
docs/
├── README.md                            # This file - documentation index
├── STRUCTURE.md                         # Project structure reference
│
├── Architecture & Design/
│   ├── ARCHITECTURE.md                  # System architecture
│   ├── ARCHITECTURE-COMPARISON.md       # Alternative approaches
│   └── API.md                           # API specification
│
├── Deployment/
│   ├── DEPLOYMENT.md                    # Deployment guide
│   ├── DOCKER-MAINTENANCE.md            # Docker operations
│   └── ../k8s/                          # Kubernetes manifests (adjacent)
│
├── Cloud Platform Integration/
│   ├── CLOUDFLARE-EXECUTIVE-SUMMARY.md  # Executive overview
│   ├── CLOUDFLARE-INTEGRATION-PLAN.md   # Implementation plan
│   ├── SCALE-TO-ZERO-ARCHITECTURE.md    # Serverless design
│   ├── SCALE-TO-ZERO-SETUP.md           # Setup guide
│   └── cloudflare/                      # Cloudflare-specific docs
│       ├── README.md
│       ├── cloudflare-workers.md
│       ├── cloudflare-pages.md
│       ├── cloudflare-tunnel.md
│       ├── cloudflare-vectorize.md
│       └── cloudflare-cli-tutorial.md
│
├── MCP Protocol/
│   └── mcp/
│       ├── MCP-QUICKSTART.md            # Quick start guide
│       └── MCP-TOOLKIT.md               # Tools reference
│
├── Testing & Quality/
│   └── TEST-FAILURES-ANALYSIS.md        # Test troubleshooting
│
├── Improvements/
│   └── IMPROVEMENTS-SUMMARY.md          # Recent changes
│
└── Future/
    └── future/                          # Planned features
```

---

## Documentation Standards

### Format
All documentation follows the dual-layer pattern:
- **Human-readable header** - Metadata and overview
- **Structured body** - Toon format with clear hierarchies

### Metadata Line
```
Doc-Type: [Type] · Version [X.Y.Z] · Updated [YYYY-MM-DD] · [Author]
```

### Hierarchy Limit
Maximum 3 levels for cognitive optimization:
```
# Level 1
## Level 2
### Level 3 (deepest allowed)
```

### Neuroscience-Optimized Chunking
- 4-7 items per section (working memory capacity)
- Clear visual separation between sections
- Progressive disclosure (overview → details)

---

## Contributing to Documentation

When adding or updating documentation:

1. **Choose the right location:**
   - Architecture → `ARCHITECTURE*.md`
   - Deployment → `DEPLOYMENT.md`, `DOCKER-MAINTENANCE.md`
   - Cloud → `cloudflare/`, `SCALE-TO-ZERO*.md`
   - MCP → `mcp/`

2. **Follow standards:**
   - Include metadata line
   - Use dual-layer format (human header + Toon body)
   - Limit hierarchy to 3 levels
   - Chunk content in 4-7 item groups

3. **Update this index:**
   - Add new documents to relevant sections
   - Update navigation paths
   - Keep cross-references current

4. **Cross-reference properly:**
   - Use relative paths from docs/ directory
   - Example: `[Main README](../README.md)`
   - Example: `[API Design](API.md)` (same directory)

---

## External Documentation

### Project Standards
- [Project Standards](../.claude/CLAUDE.md) - Coding standards and architecture principles

### API Source Documentation
- [API README](../api/README.md) - Backend documentation
- [API Source](../api/src/) - Inline code documentation

### Web Source Documentation
- [Web README](../web/README.md) - Frontend documentation
- [Web Source](../web/src/) - React component documentation

### Development Bootstrap
- [Local Development README](../local-dev/README.md) - Development environment

### Kubernetes
- [Kubernetes README](../k8s/README.md) - K8s manifests overview
- [On-Premise Deployment](../k8s/ONPREMISE-DEPLOYMENT.md) - K8s deployment guide
- [Port Registry](../k8s/PORT-REGISTRY.md) - Port allocation

---

## Quick Reference

| Topic | Primary Document | Related Documents |
|-------|-----------------|-------------------|
| Project Overview | [Main README](../README.md) | [Structure](STRUCTURE.md) |
| Architecture | [ARCHITECTURE.md](ARCHITECTURE.md) | [API.md](API.md), [Comparison](ARCHITECTURE-COMPARISON.md) |
| Local Development | [local-dev/README.md](../local-dev/README.md) | [Structure](STRUCTURE.md) |
| Docker Deployment | [DEPLOYMENT.md](DEPLOYMENT.md) | [Docker Maintenance](DOCKER-MAINTENANCE.md) |
| Kubernetes | [k8s/ONPREMISE-DEPLOYMENT.md](../k8s/ONPREMISE-DEPLOYMENT.md) | [Port Registry](../k8s/PORT-REGISTRY.md) |
| Cloudflare | [Cloudflare Integration](CLOUDFLARE-INTEGRATION-PLAN.md) | [Executive Summary](CLOUDFLARE-EXECUTIVE-SUMMARY.md) |
| Serverless | [Scale-to-Zero Architecture](SCALE-TO-ZERO-ARCHITECTURE.md) | [Setup Guide](SCALE-TO-ZERO-SETUP.md) |
| MCP Protocol | [MCP Quick Start](mcp/MCP-QUICKSTART.md) | [MCP Toolkit](mcp/MCP-TOOLKIT.md) |
| Testing | [Test Failures Analysis](TEST-FAILURES-ANALYSIS.md) | [Stealth Test Report](../api/tests/reports/stealth-test-interim-2025-11-16.md) |

---

## Documentation Changelog

| Date | Change | Files Affected |
|------|--------|---------------|
| 2025-11-19 | Reorganized documentation structure, moved files to docs/, created index | All docs |
| 2025-11-17 | Added Cloudflare and scale-to-zero documentation | cloudflare/*, SCALE-TO-ZERO*.md |
| 2025-11-16 | Added architecture comparison and improvements summary | ARCHITECTURE-COMPARISON.md, IMPROVEMENTS-SUMMARY.md |
| 2025-11-15 | Added MCP protocol documentation | mcp/MCP-*.md |
| 2025-11-14 | Initial documentation structure | ARCHITECTURE.md, API.md, DEPLOYMENT.md |

---

## Getting Help

- **Issues:** https://github.com/Ai-Whisperers/yt-transcript-headless/issues
- **Discussions:** https://github.com/Ai-Whisperers/yt-transcript-headless/discussions
- **Slack:** #yt-transcript (internal)

---

**Last Updated:** 2025-11-19
**Maintainer:** AI Whisperers
**Purpose:** Central index for all project documentation

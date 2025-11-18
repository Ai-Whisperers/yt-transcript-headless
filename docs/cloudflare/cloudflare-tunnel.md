# Cloudflare Tunnel Documentation

**Source:** https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/
**Fetched:** 2025-11-17
**Category:** Fundamental

---

## Overview

Cloudflare Tunnel enables secure connectivity to your infrastructure without requiring publicly routable IP addresses. The service employs a lightweight daemon called `cloudflared` that establishes outbound-only connections to Cloudflare's network infrastructure.

### Key Capabilities

The solution supports multiple protocol types including:
- HTTP web servers
- SSH servers
- Remote desktops
- Other protocol-based services

This architecture prevents attacks that would normally circumvent Cloudflare's security by ensuring all traffic routes through the platform.

## How It Works

The daemon creates persistent tunnel objects that route traffic to associated DNS records. You can operate multiple `cloudflared` processes simultaneously within a single tunnel, with each connector establishing links to the nearest Cloudflare data center.

## Security Model: Outbound-Only Connections

The platform leverages a directional connection approach where `cloudflared` initiates outbound traffic through your firewall toward Cloudflare's global network. Once established, bidirectional communication becomes possible.

The implementation exploits a standard firewall behavior: most systems permit outbound traffic by default. This allows you to:
- Restrict inbound access entirely
- Allow only specific outbound connections to Cloudflare
- Ensure all origin traffic flows exclusively through the tunnel

## Getting Started

Documentation provides pathways for:
- Creating tunnels via the Cloudflare dashboard or API
- Understanding `cloudflared` daemon functionality
- Learning foundational terminology
- Resolving issues through troubleshooting guides and error documentation

---

## Use Cases for This Project

**yt-transcript-headless implementation**:
- Secure on-premise Kubernetes cluster access
- No exposed ports (outbound-only)
- DDoS protection at Cloudflare Edge
- SSL/TLS auto-provisioning
- Scale-to-zero architecture support

**configuration** - See `k8s/cloudflare/` for deployment manifests

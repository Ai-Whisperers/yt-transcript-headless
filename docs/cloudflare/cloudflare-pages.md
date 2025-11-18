# Cloudflare Pages Documentation

**Source:** https://developers.cloudflare.com/pages/
**Fetched:** 2025-11-17
**Category:** Fundamental

---

## What is Cloudflare Pages?

Cloudflare Pages enables developers to "Create full-stack applications that are instantly deployed to the Cloudflare global network." This service is "Available on all plans" and provides a streamlined deployment experience.

## Deployment Methods

The platform supports three primary approaches for getting your project live:

1. **Git Integration** - Connect your repository provider for automated deployments
2. **Direct Upload** - Push prebuilt assets straight to Pages
3. **C3** - Deploy using the command-line interface

## Core Features

### Pages Functions
Deploy server-side logic without maintaining dedicated infrastructure. This capability enables dynamic functionality within your full-stack applications.

### Rollbacks
Instantly revert to any previous production deployment, providing safety nets for problematic releases.

### Redirects
Configure URL routing and forwarding rules for your project.

## Important Limits

The Free plan restricts users to "500 deploys per month," making planning important for active development teams.

## Framework Support

Pages supports popular frameworks including React, Hugo, and Next.js through dedicated framework guides.

## Related Cloudflare Services

- **Workers** - Serverless execution environment
- **R2** - Object storage without egress fees
- **D1** - Native serverless database
- **Zaraz** - Third-party tool management

## Community & Updates

Connect via the Developer Discord community or follow @CloudflareDev on X for announcements.

---

## Relevance to This Project

**Potential use for frontend**:
- Deploy React frontend to Cloudflare Pages
- Git integration for automatic deployment
- Global CDN distribution

**Current approach**:
- Frontend served from Kubernetes (nginx)
- Bundled with backend in same deployment

**Trade-offs**:
- Pages: Separate frontend deployment, Cloudflare CDN
- K8s: Single deployment, on-premise control

**Future consideration**: Deploy frontend to Pages, keep API on-premise with Tunnel

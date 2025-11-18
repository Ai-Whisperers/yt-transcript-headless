# Cloudflare Workers Documentation

**Source:** https://developers.cloudflare.com/workers/
**Fetched:** 2025-11-17
**Category:** Fundamental

---

## What is Cloudflare Workers?

Cloudflare Workers is a "serverless platform for building, deploying, and scaling apps across Cloudflare's global network with a single command — no infrastructure to manage, no complex configuration."

## Key Capabilities

With Cloudflare Workers, developers can:

- Achieve rapid performance with dependable uptime across worldwide locations
- Construct complete applications leveraging popular frameworks like React, Vue, Svelte, Next.js, Astro, and React Router
- Write code in JavaScript, TypeScript, Python, Rust, and additional languages
- Obtain detailed monitoring through integrated observability tools
- Begin with complimentary access and scale using "flexible pricing, affordable at any scale"

## Primary Use Cases

**Frontend Hosting**
Deploy static content to Cloudflare's content delivery network for optimized rendering performance.

**Backend Development**
Develop REST APIs and establish connections to databases with Smart Placement technology for reduced latency.

**AI Capabilities**
Execute machine learning models, produce images, and perform similar tasks via Workers AI.

**Asynchronous Operations**
Implement scheduled tasks, establish persistent workflows, and utilize message queue systems.

**Performance Analytics**
Track application metrics, troubleshoot problems, and review request patterns.

## Getting Started

- Access templates through the dashboard
- Deploy using the Wrangler command-line interface

## Integration Services

Workers integrates with storage solutions (Durable Objects, D1, KV, Queues, Hyperdrive), compute resources (AI, Workflows, Vectorize, R2, Browser Rendering), and media services (Cache, Images).

---

## Relevance to This Project

**Considered for scale-to-zero**:
- Serverless execution at edge
- Queues for request buffering
- **Not chosen**: Requires paid plan, moves compute off-premise

**Decision**: Use Kubernetes KEDA instead for on-premise scale-to-zero

**Potential future use**:
- Edge caching for API responses
- Request queuing at edge (reduce cold start impact)
- Workers as proxy to on-premise KEDA backend

**cost** - Free tier: 100,000 requests/day, Paid: $5/month for 10M requests

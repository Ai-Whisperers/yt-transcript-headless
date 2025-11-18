# Cloudflare CLI Tutorial

**Source:** https://developers.cloudflare.com/cloudflare-one/tutorials/cli/
**Fetched:** 2025-11-17
**Category:** Fundamental (CLI)
**Duration:** 30 minutes

---

## Overview

Cloudflare's `cloudflared` command-line tool enables interaction with APIs and endpoints protected by Cloudflare Access. This tool is designed for end users accessing protected applications via the CLI, not for service-to-service configurations.

---

## Authentication Setup

### Initial Installation

First, [install `cloudflared`](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/) on your system.

### Generate an Access Token

To begin, authenticate with a protected application:

```sh
cloudflared access login https://example.com
```

This command launches a browser window displaying the standard Access login interface. If the browser doesn't open automatically, a unique URL appears in your terminal that you can use manually.

**Process:**
1. Select your configured identity provider
2. Complete the login flow
3. The token transfers securely to `cloudflared` and stores locally
4. Token validity matches your administrator-configured session duration

---

## Accessing Protected APIs

Once authenticated, you can interact with protected endpoints using several approaches.

### Direct API Access

Use the wrapped `curl` functionality:

```sh
cloudflared access curl http://example.com
```

The tool automatically injects your token into requests as a query parameter.

---

## Available Commands

| Command | Purpose | Syntax |
|---------|---------|--------|
| `login` | Initiates authentication flow | `cloudflared access login http://example.com` |
| `curl` | Wraps curl with automatic token injection | `cloudflared access curl http://example.com` |
| `token` | Retrieves scoped token for manual use | `cloudflared access token -app=http://example.com` |

---

## Environment Variable Configuration

For scripts requiring repeated access, store your token as an environment variable:

```sh
export TOKEN=$(cloudflared access token -app=http://example.com)
```

Verify the export worked:

```sh
echo $TOKEN
```

Use the token in authenticated requests:

```sh
curl -H "cf-access-token: $TOKEN" https://example.com/rest/api/2/item/foo-123
```

This approach simplifies token management across multiple CLI commands and scripts.

---

## Relevance to This Project

**Tunnel Management**:
- Create tunnels: `cloudflared tunnel create <name>`
- Route DNS: `cloudflared tunnel route dns <tunnel> <hostname>`
- Delete tunnels: `cloudflared tunnel delete <tunnel-id>`

**Authentication**:
- Login: `cloudflared tunnel login`
- Credentials stored in `~/.cloudflared/`

**Common Commands Used**:
```bash
# Create tunnel
cloudflared tunnel create yt-transcript-tunnel

# Route DNS
cloudflared tunnel route dns yt-transcript-tunnel transcript.yourdomain.com

# List tunnels
cloudflared tunnel list

# Get tunnel info
cloudflared tunnel info <tunnel-id>
```

**Setup Guide**: See `k8s/cloudflare/README.md` for complete tunnel setup procedure

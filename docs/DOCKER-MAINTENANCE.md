# Docker Build Artifacts & Maintenance Guide

## Overview

This document explains what files/data persist between Docker rebuilds and how to maintain a clean development environment.

## What Persists (SHOULD NOT be committed to git)

### 1. Local Build Artifacts

**Location:** `api/dist/`, `web/dist/`
**Status:** ✅ Already ignored by .gitignore (`dist/`)
**Size:** ~1.2 MB combined
**Purpose:** TypeScript compilation output, frontend bundles
**Cleanup:** `npm run clean` in respective directories

### 2. Frontend Build in Backend (Development Only)

**Location:** `api/public/`
**Status:** ✅ Now ignored by .gitignore
**Size:** ~745 KB
**Purpose:** Frontend build artifacts copied during local testing
**Cleanup:** Automatically excluded from Docker builds via .dockerignore
**Note:** This directory is created when running the backend locally after building the frontend

### 3. Runtime Logs

**Location:** `api/logs/`, `web/logs/`
**Status:** ✅ Now ignored by .gitignore
**Size:** Varies (typically < 1 MB)
**Purpose:** Application runtime logs (combined.log, error.log)
**Cleanup:** Safe to delete anytime, recreated on next app start

### 4. Node Modules

**Location:** `api/node_modules/`, `web/node_modules/`
**Status:** ✅ Already ignored by .gitignore
**Size:** Varies (500+ MB combined)
**Purpose:** NPM dependencies
**Cleanup:** Automatically excluded from Docker builds via .dockerignore

## Docker-Specific Persistence

### Build Cache

**Location:** Docker's internal storage
**Current Size:** 13.44 GB (as of last check)
**Purpose:** Layer caching for faster rebuilds
**Status:** ⚠️ Can accumulate over time

**Cleanup Commands:**
```bash
# View current usage
docker system df

# Clean build cache only (safe)
docker builder prune

# Clean everything unused (more aggressive)
docker system prune -a

# Use our cleanup scripts
bash scripts/docker-cleanup.sh        # Linux/Mac
scripts\docker-cleanup.bat            # Windows
```

### Dangling Images

**What:** Intermediate images from builds that are no longer tagged
**Status:** ⚠️ Currently 3 dangling images
**Cleanup:**
```bash
docker image prune -f
```

### Stopped Containers

**What:** Containers that have been stopped but not removed
**Cleanup:**
```bash
docker container prune -f
```

## What SHOULD Be Committed

### Source Code
- `api/src/`
- `web/src/`
- `*.ts`, `*.tsx` files

### Configuration
- `package.json`, `package-lock.json`
- `tsconfig.json`, `vite.config.ts`
- `.env.example` (NOT `.env`)
- `Dockerfile`, `.dockerignore`

### Documentation
- `README.md`, `*.md` files in `local/`
- `CLAUDE.md` project standards

### Tests
- `api/tests/`, `web/tests/`

## Maintenance Schedule

### Daily (During Active Development)
- Review `api/logs/` size if debugging
- No action needed (logs auto-rotate)

### Weekly
- Run Docker cleanup script if building frequently
- Check `docker system df` output

### Monthly
- Deep clean: `docker system prune -a --volumes`
- Review `.gitignore` for new patterns

## Automated Cleanup

### .dockerignore Protection

Our `.dockerignore` prevents these from entering Docker builds:
```
node_modules/
dist/
tests/
*.log
logs/
*.md
.git/
```

This ensures Docker images stay lean (3.08 GB instead of 5+ GB).

### .gitignore Protection

Updated `.gitignore` prevents these from being committed:
```
api/public/          # Frontend build artifacts
api/logs/            # Runtime logs
web/logs/            # Frontend logs
dist/                # Build outputs
node_modules/        # Dependencies
*.log                # Log files
```

## Verification Commands

### Check Git Status (should be clean)
```bash
git status
```

Expected output: `nothing to commit, working tree clean`

### Check Untracked Files
```bash
git ls-files --others --exclude-standard
```

Should NOT show: `api/public/`, `*/logs/`, `*.log`

### Check Docker Disk Usage
```bash
docker system df
```

Monitor `Build Cache` size - clean if > 20 GB

### Find Temporary Files
```bash
# Linux/Mac
find . -name "*.tmp" -o -name "*.temp" | grep -v node_modules

# Windows PowerShell
Get-ChildItem -Recurse -Include *.tmp,*.temp | Where-Object {$_.FullName -notmatch "node_modules"}
```

Should return: Empty (no temp files)

## Troubleshooting

### "api/public/ shows up in git status"

**Problem:** Frontend build artifacts in backend directory
**Solution:**
```bash
rm -rf api/public
git rm --cached -r api/public  # If already committed
```

### "Logs directory keeps appearing"

**Problem:** Application creates logs/ during runtime
**Solution:** Normal behavior - logs/ is gitignored, files won't be committed

### "Docker build is slow after cleanup"

**Problem:** Build cache was removed
**Solution:** Expected on first build after cleanup - subsequent builds will be fast due to layer caching

### "Out of disk space"

**Problem:** Docker build cache accumulation
**Solution:**
```bash
docker system df              # Check usage
docker builder prune -a       # Clean build cache
docker system prune -a        # Clean everything (more aggressive)
```

## CI/CD Considerations

In production/CI environments:
- No local build artifacts exist (build happens in Docker)
- No logs persist (ephemeral containers)
- Build cache managed by CI system
- No need for manual cleanup

## Best Practices

1. **Never commit build artifacts** - Always in .gitignore
2. **Use Docker cleanup scripts** - Weekly during active development
3. **Monitor disk usage** - Keep build cache < 20 GB
4. **Clean before major refactors** - Start with fresh state
5. **Test .dockerignore changes** - Verify image size doesn't increase

## Quick Reference

```bash
# Full cleanup (run weekly)
bash scripts/docker-cleanup.sh

# Check what's ignored
git status --ignored

# View Docker resource usage
docker system df

# Remove specific project artifacts
rm -rf api/dist api/logs api/public web/dist web/logs

# Rebuild from scratch
docker build --no-cache -t yt-transcript:latest .
```

---

**Last Updated:** 2025-11-17
**Maintained By:** AI Whisperers
**Related:** See `.gitignore`, `.dockerignore`, `scripts/docker-cleanup.*`

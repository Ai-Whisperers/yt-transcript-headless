# Caching System

**Doc-Type:** Future Feature · Version 0.1.0 · Updated 2025-11-14 · AI Whisperers

## Overview

Implement caching layer to reduce extraction time and YouTube requests.

## Cache Layers

### L1: Memory Cache
- In-process LRU cache
- 100MB default size
- 5-minute TTL
- Hot data storage

### L2: Redis Cache
- Distributed cache
- 1GB allocation
- 24-hour TTL
- Shared across instances

### L3: Database Cache
- PostgreSQL storage
- Permanent storage
- Version tracking
- Search capability

## Cache Key Strategy

```typescript
interface CacheKey {
  videoId: string;
  format: TranscriptFormat;
  version: string;
  language?: string;
}

// Key format: yt:v1:{videoId}:{format}:{hash}
```

## API Integration

### Cache Headers
```http
GET /api/transcribe
Cache-Control: max-age=3600
ETag: "abc123"
X-Cache: HIT
```

### Force Refresh
```json
{
  "url": "https://youtube.com/watch?v=ID",
  "format": "json",
  "cache": {
    "bypass": true,
    "ttl": 7200
  }
}
```

## Implementation

### Cache Service
```typescript
class CacheService {
  async get(key: string): Promise<TranscriptData | null>
  async set(key: string, data: TranscriptData, ttl?: number): Promise<void>
  async invalidate(pattern: string): Promise<number>
  async stats(): Promise<CacheStats>
}
```

### Invalidation Strategy
- Time-based expiration
- LRU eviction
- Manual invalidation
- Pattern-based clearing

## Storage Estimation

| Cache Level | Size | Items | TTL |
|------------|------|-------|-----|
| Memory | 100MB | ~1000 | 5 min |
| Redis | 1GB | ~10000 | 24 hrs |
| Database | 10GB | ~100000 | 30 days |

## Monitoring

### Metrics
- Cache hit ratio
- Eviction rate
- Memory usage
- Response time improvement

### Admin Endpoints
```http
GET /api/admin/cache/stats
DELETE /api/admin/cache/{pattern}
POST /api/admin/cache/warm
```

## Configuration

```env
CACHE_ENABLED=true
CACHE_TYPE=redis
REDIS_URL=redis://localhost:6379
CACHE_TTL_SECONDS=3600
CACHE_MAX_SIZE_MB=100
```
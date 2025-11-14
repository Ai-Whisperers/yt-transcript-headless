# Analytics & Monitoring

**Doc-Type:** Future Feature · Version 0.1.0 · Updated 2025-11-14 · AI Whisperers

## Overview

Comprehensive analytics system for usage patterns, performance metrics, and error tracking.

## Metrics Collection

### Performance Metrics
- Request latency
- Extraction duration
- Success rate
- Error rate by type
- Browser resource usage

### Usage Analytics
- Total requests per day
- Popular video categories
- User patterns
- Peak usage times
- Geographic distribution

## Dashboard Components

### Real-time Metrics
```typescript
interface RealtimeMetrics {
  activeExtractions: number;
  requestsPerMinute: number;
  averageLatency: number;
  errorRate: number;
  queueDepth: number;
}
```

### Historical Data
- Daily/weekly/monthly aggregations
- Trend analysis
- Comparative metrics
- Forecasting

## API Endpoints

### Metrics Endpoint
```http
GET /api/analytics/metrics
```

**Response:**
```json
{
  "period": "last_24h",
  "requests": {
    "total": 5234,
    "successful": 5100,
    "failed": 134
  },
  "performance": {
    "avgLatency": 3.2,
    "p95Latency": 8.5,
    "p99Latency": 15.2
  },
  "topErrors": [
    {
      "code": "NO_TRANSCRIPT",
      "count": 89
    }
  ]
}
```

### Health Score
```http
GET /api/analytics/health
```

**Response:**
```json
{
  "score": 95,
  "status": "healthy",
  "components": {
    "api": "operational",
    "browser": "operational",
    "database": "operational"
  }
}
```

## Integration Points

### Prometheus Metrics
```typescript
// Metrics export format
transcript_requests_total{status="success"} 5100
transcript_requests_total{status="failure"} 134
transcript_extraction_duration_seconds{quantile="0.95"} 8.5
```

### Grafana Dashboard
- Request rate graphs
- Error distribution
- Latency histograms
- Resource utilization

### Error Tracking
```typescript
interface ErrorEvent {
  timestamp: Date;
  errorCode: string;
  message: string;
  stack?: string;
  context: {
    url: string;
    userId?: string;
    sessionId: string;
  };
}
```

## Data Storage

### Time-series Database
```sql
CREATE TABLE metrics (
  time TIMESTAMPTZ NOT NULL,
  metric_name TEXT,
  value DOUBLE PRECISION,
  tags JSONB
);

SELECT create_hypertable('metrics', 'time');
```

### Aggregation Tables
```sql
CREATE MATERIALIZED VIEW daily_stats AS
SELECT
  date_trunc('day', time) as day,
  COUNT(*) as total_requests,
  AVG(value) as avg_latency,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95
FROM metrics
GROUP BY day;
```

## Alerting Rules

### Critical Alerts
- Error rate > 10%
- P95 latency > 30s
- Browser crashes > 5/min
- Queue depth > 1000

### Warning Alerts
- Error rate > 5%
- P95 latency > 15s
- Memory usage > 80%
- Disk usage > 80%

## Configuration

```env
METRICS_ENABLED=true
METRICS_PORT=9090
PROMETHEUS_PUSHGATEWAY=http://localhost:9091
GRAFANA_URL=http://localhost:3000
ERROR_TRACKING_DSN=https://sentry.io/dsn
```
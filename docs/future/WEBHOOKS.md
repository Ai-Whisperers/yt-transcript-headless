# Webhook Integration

**Doc-Type:** Future Feature · Version 0.1.0 · Updated 2025-11-14 · AI Whisperers

## Overview

Webhook system for asynchronous transcript delivery and event notifications.

## Webhook Registration

### Create Webhook
```http
POST /api/webhooks
```

```json
{
  "url": "https://example.com/webhook",
  "events": ["transcript.completed", "transcript.failed"],
  "secret": "webhook_secret_key",
  "active": true
}
```

### Response
```json
{
  "id": "webhook_123",
  "url": "https://example.com/webhook",
  "events": ["transcript.completed", "transcript.failed"],
  "created": "2025-11-14T12:00:00Z",
  "status": "active"
}
```

## Event Types

| Event | Description | Payload |
|-------|-------------|---------|
| transcript.started | Extraction began | Job metadata |
| transcript.completed | Successful extraction | Full transcript |
| transcript.failed | Extraction failed | Error details |
| batch.completed | Batch processing done | Batch results |
| quota.exceeded | Usage limit reached | Usage stats |

## Webhook Payload

### Success Event
```json
{
  "event": "transcript.completed",
  "timestamp": "2025-11-14T12:00:00Z",
  "data": {
    "jobId": "job_123",
    "videoUrl": "https://youtube.com/watch?v=ID",
    "transcript": [...],
    "format": "json",
    "duration": 3.5
  }
}
```

### Failure Event
```json
{
  "event": "transcript.failed",
  "timestamp": "2025-11-14T12:00:00Z",
  "data": {
    "jobId": "job_123",
    "videoUrl": "https://youtube.com/watch?v=ID",
    "error": {
      "code": "NO_TRANSCRIPT",
      "message": "Video has no available transcript"
    }
  }
}
```

## Security

### Signature Verification
```typescript
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(JSON.stringify(payload))
  .digest('hex');

headers['X-Webhook-Signature'] = signature;
```

### Verification Example
```typescript
function verifyWebhook(payload: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

## Retry Logic

### Retry Configuration
- Max attempts: 3
- Backoff strategy: Exponential
- Initial delay: 1 second
- Max delay: 30 seconds

### Failed Delivery Handling
```typescript
interface RetryPolicy {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}
```

## Management Endpoints

### List Webhooks
```http
GET /api/webhooks
```

### Update Webhook
```http
PUT /api/webhooks/{id}
```

### Delete Webhook
```http
DELETE /api/webhooks/{id}
```

### Test Webhook
```http
POST /api/webhooks/{id}/test
```

## Database Schema

```sql
CREATE TABLE webhooks (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  url VARCHAR(255),
  events TEXT[],
  secret VARCHAR(255),
  active BOOLEAN,
  created_at TIMESTAMP
);

CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY,
  webhook_id UUID REFERENCES webhooks(id),
  event VARCHAR(50),
  payload JSONB,
  status VARCHAR(20),
  attempts INTEGER,
  delivered_at TIMESTAMP
);
```

## Configuration

```env
WEBHOOK_ENABLED=true
WEBHOOK_MAX_RETRIES=3
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_SIGNATURE_HEADER=X-Webhook-Signature
```
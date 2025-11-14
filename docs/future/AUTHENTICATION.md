# Authentication & Authorization

**Doc-Type:** Future Feature · Version 0.1.0 · Updated 2025-11-14 · AI Whisperers

## Overview

API key and JWT-based authentication system with usage tracking.

## Authentication Methods

### API Key Authentication
```http
GET /api/transcribe
X-API-Key: sk_live_abc123xyz789
```

### JWT Authentication
```http
GET /api/transcribe
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

## User Management

### Registration
```http
POST /api/auth/register
```

```json
{
  "email": "user@example.com",
  "password": "securePassword",
  "organization": "Company Name"
}
```

### Login
```http
POST /api/auth/login
```

```json
{
  "email": "user@example.com",
  "password": "securePassword"
}
```

## API Key Management

### Generate Key
```http
POST /api/keys/generate
```

**Response:**
```json
{
  "key": "sk_live_abc123xyz789",
  "created": "2025-11-14T12:00:00Z",
  "permissions": ["read", "write"],
  "rateLimit": 100
}
```

## Permission Levels

| Level | Description | Rate Limit | Features |
|-------|-------------|------------|----------|
| Free | Basic access | 10/hour | Single URL |
| Pro | Professional | 100/hour | Batch, Priority |
| Enterprise | Full access | Unlimited | All features |

## Usage Tracking

### Usage Endpoint
```http
GET /api/usage
```

**Response:**
```json
{
  "period": "2025-11",
  "requests": 1523,
  "transcripts": 1200,
  "errors": 23,
  "remaining": 8477
}
```

## Database Schema

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  created_at TIMESTAMP,
  tier VARCHAR(20)
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  key_hash VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  permissions JSONB,
  rate_limit INTEGER,
  last_used TIMESTAMP
);

CREATE TABLE usage_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  timestamp TIMESTAMP,
  endpoint VARCHAR(255),
  status_code INTEGER,
  response_time_ms INTEGER
);
```

## Security Implementation

### Password Requirements
- Minimum 12 characters
- Bcrypt hashing with salt rounds: 10
- Password reset via email

### Token Security
- JWT expiration: 24 hours
- Refresh token: 7 days
- Secure httpOnly cookies
- CSRF protection

### Rate Limiting
```typescript
interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyGenerator: (req: Request) => string;
  handler: (req: Request, res: Response) => void;
}
```

## Configuration

```env
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=10
API_KEY_PREFIX=sk_live_
ENABLE_AUTH=true
```
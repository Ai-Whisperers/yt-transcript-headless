# SDK & Client Libraries

**Doc-Type:** Future Feature · Version 0.1.0 · Updated 2025-11-14 · AI Whisperers

## Overview

Official SDK libraries for popular programming languages.

## Supported Languages

### JavaScript/TypeScript
```typescript
import { TranscriptClient } from '@ai-whisperers/yt-transcript';

const client = new TranscriptClient({
  apiKey: 'sk_live_abc123',
  baseUrl: 'https://api.example.com'
});

const transcript = await client.extract({
  url: 'https://youtube.com/watch?v=ID',
  format: 'json'
});
```

### Python
```python
from yt_transcript import TranscriptClient

client = TranscriptClient(
    api_key='sk_live_abc123',
    base_url='https://api.example.com'
)

transcript = client.extract(
    url='https://youtube.com/watch?v=ID',
    format='json'
)
```

### Go
```go
import "github.com/ai-whisperers/yt-transcript-go"

client := yttranscript.NewClient(
    yttranscript.WithAPIKey("sk_live_abc123"),
)

transcript, err := client.Extract(ctx, &yttranscript.Request{
    URL: "https://youtube.com/watch?v=ID",
    Format: "json",
})
```

## SDK Features

### Core Methods
```typescript
interface TranscriptClient {
  extract(options: ExtractOptions): Promise<Transcript>
  extractBatch(urls: string[]): Promise<BatchResult>
  getFormats(): Promise<Format[]>
  checkHealth(): Promise<HealthStatus>
}
```

### Retry Logic
```typescript
const client = new TranscriptClient({
  apiKey: 'key',
  retryOptions: {
    maxRetries: 3,
    retryDelay: 1000,
    retryOn: [429, 502, 503]
  }
});
```

### Streaming Support
```typescript
const stream = client.extractStream({
  url: 'https://youtube.com/watch?v=ID'
});

stream.on('segment', (segment) => {
  console.log(segment.text);
});
```

## CLI Tool

### Installation
```bash
npm install -g @ai-whisperers/yt-transcript-cli
```

### Usage
```bash
# Single URL
yt-transcript extract https://youtube.com/watch?v=ID

# Batch processing
yt-transcript batch urls.txt --output results.json

# With options
yt-transcript extract URL --format srt --output video.srt
```

### Configuration File
```yaml
# .yt-transcript.yml
api_key: sk_live_abc123
base_url: https://api.example.com
default_format: json
cache_enabled: true
```

## Package Distribution

### NPM Package
```json
{
  "name": "@ai-whisperers/yt-transcript",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./client": "./dist/client.js"
  }
}
```

### PyPI Package
```python
# setup.py
setup(
    name='yt-transcript-extractor',
    version='1.0.0',
    packages=['yt_transcript'],
    install_requires=[
        'requests>=2.28.0',
        'typing-extensions>=4.0.0'
    ]
)
```

## Documentation

### API Reference
- Method signatures
- Parameter descriptions
- Return types
- Error codes
- Examples

### Guides
- Quick start
- Authentication
- Error handling
- Best practices
- Migration guide

## Testing

### Mock Client
```typescript
import { MockTranscriptClient } from '@ai-whisperers/yt-transcript/testing';

const client = new MockTranscriptClient();
client.mockExtract({ transcript: [...] });
```

### Integration Tests
```typescript
describe('TranscriptClient', () => {
  it('extracts transcript', async () => {
    const result = await client.extract({
      url: 'https://youtube.com/watch?v=test'
    });
    expect(result.transcript).toHaveLength(10);
  });
});
```

## Versioning

### Semantic Versioning
- Major: Breaking changes
- Minor: New features
- Patch: Bug fixes

### Deprecation Policy
- 6-month deprecation notice
- Migration guides
- Compatibility layer
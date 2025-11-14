# YouTube Headless Transcript Extractor

**Doc-Type:** Main Documentation · Version 1.0.0 · Updated 2025-11-14 · AI Whisperers

A headless YouTube transcript extraction service built with Playwright, providing reliable transcript extraction without UI rendering.

## Overview

This project provides a robust solution for extracting YouTube video transcripts using headless browser automation. It implements stealth techniques and human-like behavior patterns to reliably extract transcripts from YouTube's embedded transcript feature.

### Key Features

- **Headless Operation:** Runs without UI rendering for optimal performance
- **Stealth Mode:** Implements anti-detection measures for reliable extraction
- **Microservice Architecture:** Stateless API design ready for Kubernetes deployment
- **Multi-Format Output:** Supports JSON, SRT, and plain text formats
- **Minimal UI:** Simple Vite dashboard for easy interaction
- **Docker Ready:** Containerized for easy deployment across platforms

## Architecture

The project follows hexagonal architecture principles with clear separation of concerns:

```
PROJECT/
├── api/                    # Headless transcript microservice
│   ├── src/
│   │   ├── application/    # Use cases (transcribeVideo)
│   │   ├── domain/         # Models (TranscriptSegment)
│   │   └── infrastructure/ # Playwright engine + REST endpoints
│   └── Dockerfile
│
└── web/                    # Minimal Vite dashboard
    ├── components/
    ├── pages/
    └── services/           # API client
```

## Quick Start

### Prerequisites

- Node.js 18+
- Docker Desktop (for containerization)
- Chromium browser (installed via Playwright)

### Installation

```bash
# Clone the repository
git clone https://github.com/Ai-Whisperers/yt-transcript-headless
cd yt-transcript-headless

# Install API dependencies
cd api
npm install
npx playwright install chromium

# Install web dependencies
cd ../web
npm install
```

### Running Locally

#### API Service

```bash
cd api
npm run dev
# API runs on http://localhost:3000
```

#### Web Dashboard

```bash
cd web
npm run dev
# Dashboard runs on http://localhost:5173
```

### Docker Deployment

```bash
# Build API container
cd api
docker build -t yt-transcript-api .

# Run container
docker run -p 3000:3000 yt-transcript-api
```

## API Documentation

### Endpoint

```
POST /api/transcribe
Content-Type: application/json
```

### Request Body

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "format": "json" // Options: "json", "srt", "text"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "transcript": [
      {
        "time": "0:00",
        "text": "Hello, welcome to the video..."
      }
    ],
    "format": "json",
    "videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
    "extractedAt": "2025-11-14T12:00:00Z"
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "message": "Failed to extract transcript",
    "code": "EXTRACTION_FAILED"
  }
}
```

## Technical Implementation

### Stealth Techniques

The service implements several anti-detection measures:

- Custom user agent strings
- Realistic viewport settings
- Randomized delays between actions
- Navigator webdriver flag removal
- Plugin and language spoofing
- Resource blocking for faster execution

### Extraction Flow

1. **Launch Browser:** Initialize headless Chromium with stealth configuration
2. **Navigate:** Load YouTube video page with optimized settings
3. **Expand Description:** Click "Show more" if needed
4. **Open Transcript:** Locate and click transcript button with fallback logic
5. **Extract Data:** Parse transcript segments with timestamps
6. **Format Output:** Convert to requested format (JSON/SRT/Text)
7. **Clean Up:** Close browser context and return results

## Deployment

### Kubernetes

The service is designed for Kubernetes deployment with horizontal scaling capabilities:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: yt-transcript-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: yt-transcript-api
  template:
    metadata:
      labels:
        app: yt-transcript-api
    spec:
      containers:
      - name: api
        image: yt-transcript-api:latest
        ports:
        - containerPort: 3000
```

### Environment Variables

```env
PORT=3000
NODE_ENV=production
MAX_CONCURRENT_BROWSERS=5
TIMEOUT_MS=30000
ENABLE_STEALTH=true
```

## Development

### Testing

```bash
# Unit tests
npm run test:unit

# E2E tests
npm run test:e2e

# All tests
npm test
```

### Code Style

The project follows SOLID principles and clean architecture patterns:

- Single Responsibility Principle in domain models
- Dependency Injection for testability
- Interface segregation for flexibility
- Clear separation between layers

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or suggestions, please open an issue on the [GitHub repository](https://github.com/Ai-Whisperers/yt-transcript-headless/issues).

## Acknowledgments

- Playwright team for the excellent browser automation framework
- Open source community for stealth techniques and best practices

---

**Note:** This tool is for educational and legitimate use cases only. Please respect YouTube's Terms of Service and content creators' rights when using this service.
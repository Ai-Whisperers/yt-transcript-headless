# YouTube Transcript Extractor MCP Toolkit
Doc-Type: Technical Documentation · Version 1.0 · Updated 2025-11-15 · AI Whisperers

## Purpose

MCP toolkit enabling Claude to test, debug, and enhance the YouTube transcript extraction application in real-time.

---

## Architecture Overview

### Dual Integration Modes

**Standalone MCP Server**
- Direct stdio communication with Claude Desktop/Code
- Optimal for development and debugging
- Runs independently of Express API

**Express API Integration**
- HTTP endpoint at `/api/mcp`
- Enables MCP calls via REST
- Suitable for web-based MCP clients

---

## Available Tools

### 1. extract_transcript
Extract YouTube video transcript with format options.

**Parameters:**
- `url` (string, required): YouTube video URL
- `format` (string, optional): Output format (json|srt|text), default: json

**Example:**
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "format": "json"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "segments": [
      {
        "time": "0:00",
        "text": "Never gonna give you up"
      }
    ]
  }
}
```

---

### 2. validate_url
Validate YouTube URL format without extraction.

**Parameters:**
- `url` (string, required): URL to validate

**Response:**
```json
{
  "success": true,
  "valid": true,
  "url": "https://youtube.com/watch?v=...",
  "message": "Valid YouTube URL"
}
```

---

### 3. batch_extract
Extract transcripts from multiple videos concurrently.

**Parameters:**
- `urls` (array, required): Array of YouTube URLs
- `format` (string, optional): Output format, default: json

**Response:**
```json
{
  "success": true,
  "total": 3,
  "successful": 2,
  "failed": 1,
  "results": [
    {
      "url": "...",
      "status": "fulfilled",
      "data": { "segments": [...] }
    }
  ]
}
```

---

### 4. get_formats
List supported output formats with use cases.

**Response:**
```json
{
  "success": true,
  "formats": [
    {
      "format": "json",
      "description": "Structured JSON with timestamp and text",
      "useCase": "Programmatic processing, ML training"
    }
  ]
}
```

---

### 5. browser_status
Check headless browser initialization status.

**Response:**
```json
{
  "success": true,
  "browser": {
    "initialized": true,
    "type": "Chromium (Playwright)",
    "status": "ready",
    "features": ["Stealth mode enabled", "Resource blocking"]
  }
}
```

---

### 6. get_logs
Retrieve recent application logs.

**Response:**
```json
{
  "success": true,
  "message": "Logs are streamed to console",
  "logLevel": "info",
  "logFormat": "JSON structured logging via Winston"
}
```

---

## Installation & Setup

### 1. Build the MCP Server

```bash
cd api
npm run build
```

### 2. Configure Claude Desktop

**Production (Built):**
Copy contents of `mcp-config.json` to your Claude Desktop config:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Development (Hot Reload):**
Use `mcp-config.dev.json` for automatic TypeScript recompilation.

### 3. Verify Installation

Restart Claude Desktop. The MCP server should appear in available tools.

---

## Usage Examples

### Claude Desktop/Code

Once configured, simply ask Claude:
```
"Extract the transcript from https://youtube.com/watch?v=xyz"
```

Claude will automatically use the `extract_transcript` tool.

---

### Express API Integration

**List Tools:**
```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'
```

**Call Tool:**
```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "extract_transcript",
      "arguments": {
        "url": "https://youtube.com/watch?v=xyz",
        "format": "json"
      }
    }
  }'
```

---

## Development Workflow

### Testing MCP Tools

```bash
# Start standalone MCP server for testing
npm run mcp

# Or start Express API with MCP endpoint
npm run dev
```

### Adding New Tools

1. Add tool definition in `getTools()` method
2. Implement handler in `mcp-server.ts`
3. Update Express integration in `express-mcp-handler.ts`
4. Document tool in this file

---

## Security Considerations

### Sandboxing
- MCP server runs with same permissions as Node.js process
- Browser automation isolated in headless Chromium
- No file system access beyond application scope

### Rate Limiting
- Express API has rate limiting enabled
- Standalone MCP server relies on client throttling
- Consider implementing per-tool rate limits for production

### Input Validation
- All inputs validated via Zod schemas
- URL validation prevents non-YouTube domains
- Format enums prevent injection attacks

---

## Troubleshooting

### MCP Server Not Appearing in Claude

**Check:**
1. Config file path is correct
2. `npm run build` completed successfully
3. Node.js is in system PATH
4. Working directory (`cwd`) exists and is correct

**Verify:**
```bash
# Test MCP server manually
npm run mcp
# Should start without errors and wait for stdio input
```

### Browser Initialization Fails

**Solutions:**
1. Run `npx playwright install chromium`
2. Check system has required dependencies
3. Review logs for Playwright errors
4. Use `browser_status` tool to verify state

### Tool Execution Errors

**Debug:**
1. Check Claude Desktop logs
2. Use `get_logs` tool for application logs
3. Verify input parameters match schema
4. Test via Express API for detailed errors

---

## File Structure

```
api/
├── src/
│   ├── mcp/
│   │   ├── mcp-server.ts           # Standalone MCP server
│   │   └── express-mcp-handler.ts  # Express integration
│   ├── application/
│   │   └── TranscribeVideoUseCase.ts
│   ├── infrastructure/
│   │   ├── routes.ts               # Express routes with /mcp endpoint
│   │   └── ...
│   └── domain/
│       └── ...
├── mcp-config.json                 # Production config
├── mcp-config.dev.json             # Development config
└── MCP-TOOLKIT.md                  # This file
```

---

## Performance Considerations

### Concurrent Requests
- `batch_extract` uses `Promise.allSettled` for parallelism
- Each extraction initializes separate browser context
- Memory scales linearly with concurrent requests

### Caching Strategy
- No built-in caching (stateless design)
- Consider external cache (Redis) for frequently requested videos
- Browser instance singleton reduces initialization overhead

---

## Future Enhancements

### Planned Tools
- `analyze_sentiment`: NLP sentiment analysis on transcripts
- `translate_transcript`: Multi-language translation
- `summarize_video`: AI-powered content summarization
- `search_content`: Full-text search across cached transcripts

### Integration Improvements
- WebSocket support for streaming extraction progress
- Persistent caching layer
- Multi-browser support (Firefox, WebKit)
- Playlist batch extraction

---

## Contributing

When adding features to the MCP toolkit:

1. Follow hexagonal architecture patterns
2. Maintain separation between domain/application/infrastructure
3. Add comprehensive tool descriptions
4. Update this documentation
5. Test both standalone and Express modes

---

## License

MIT License - AI Whisperers

---

## Changelog

| Date       | Version | Description                    |
|:-----------|:--------|:-------------------------------|
| 2025-11-15 | v1.0.0  | Initial MCP toolkit release   |

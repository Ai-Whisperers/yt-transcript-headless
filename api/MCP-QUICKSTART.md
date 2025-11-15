# MCP Quick Start Guide
Doc-Type: Quick Reference · Version 1.0 · Updated 2025-11-15 · AI Whisperers

## 5-Minute Setup

### Prerequisites
- Node.js 18+ installed
- Claude Desktop installed
- Project dependencies installed (`npm install`)

---

## Option 1: Standalone MCP Server (Recommended for Claude Desktop)

### Step 1: Build the Project
```bash
cd api
npm run build
```

### Step 2: Configure Claude Desktop

**Windows:**
Open `%APPDATA%\Claude\claude_desktop_config.json`

**macOS:**
Open `~/Library/Application Support/Claude/claude_desktop_config.json`

**Linux:**
Open `~/.config/Claude/claude_desktop_config.json`

Add this configuration:
```json
{
  "mcpServers": {
    "youtube-transcript-extractor": {
      "command": "node",
      "args": [
        "dist/mcp/mcp-server.js"
      ],
      "cwd": "FULL_PATH_TO_PROJECT/api",
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Replace `FULL_PATH_TO_PROJECT`** with your actual path:
- Windows: `C:\\Users\\YourName\\Desktop\\AI WHISPERERS\\yt-transcript-headless\\simple-yt-transcript-extractor`
- macOS/Linux: `/Users/YourName/Desktop/AI WHISPERERS/yt-transcript-headless/simple-yt-transcript-extractor`

### Step 3: Restart Claude Desktop

### Step 4: Test
Ask Claude:
```
"Extract the transcript from https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

Claude will automatically use the MCP tool to extract the transcript.

---

## Option 2: Development Mode (Hot Reload)

For development with automatic TypeScript recompilation:

### Step 1: Update Claude Desktop Config
Use `npm run mcp` instead of the built version:

```json
{
  "mcpServers": {
    "youtube-transcript-extractor": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "FULL_PATH_TO_PROJECT/api",
      "env": {
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

### Step 2: Restart Claude Desktop

Changes to `.ts` files will be reflected immediately.

---

## Option 3: Express API Integration

Run the Express API with MCP endpoint:

```bash
cd api
npm run dev
```

### Test MCP via HTTP:
```bash
# List available tools
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'

# Extract transcript
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

## Available Tools

### extract_transcript
Extract YouTube transcript with format options (json, srt, text).

### validate_url
Validate YouTube URL format.

### batch_extract
Extract multiple transcripts concurrently.

### get_formats
List supported output formats.

### browser_status
Check headless browser status.

### get_logs
Retrieve application logs.

---

## Troubleshooting

### "Tool not found" in Claude Desktop
1. Check config file path is correct
2. Verify `cwd` points to the `api` folder
3. Restart Claude Desktop after config changes

### Browser fails to launch
```bash
npx playwright install chromium
```

### TypeScript compilation errors
```bash
npm run build
```

Check console for specific errors.

---

## Next Steps

See `MCP-TOOLKIT.md` for:
- Detailed tool documentation
- Security considerations
- Adding custom tools
- Performance optimization

---

## Support

Report issues: [GitHub Issues](https://github.com/your-org/yt-transcript-extractor/issues)

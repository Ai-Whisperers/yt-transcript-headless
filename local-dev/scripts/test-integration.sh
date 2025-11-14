#!/bin/bash
# Bootstrap script: Run integration tests
# This script starts all services and runs integration tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DEV_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$LOCAL_DEV_DIR")"

echo "Running Integration Tests"
echo "========================="
echo ""

# Check if services are already running
API_RUNNING=$(curl -s http://localhost:3000/api/health 2>/dev/null | grep -c "healthy" || echo "0")

if [ "$API_RUNNING" -eq "0" ]; then
    echo "Starting API service..."
    cd "$PROJECT_ROOT/api"
    npm run dev &
    API_PID=$!

    echo "Waiting for API to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:3000/api/health >/dev/null 2>&1; then
            echo "API is ready!"
            break
        fi
        sleep 1
    done
else
    echo "API service already running"
    API_PID=""
fi

# Run integration test
echo ""
echo "Running integration test with sample YouTube video..."
cd "$PROJECT_ROOT"

node - <<'EOF'
const http = require('http');

const data = JSON.stringify({
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  format: 'json'
});

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/transcribe',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('Testing transcript extraction...');

const req = http.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    try {
      const result = JSON.parse(responseData);

      if (result.success) {
        console.log('\n✓ Integration test PASSED');
        console.log(`  - Extracted ${result.data.transcript.length} segments`);
        console.log(`  - Format: ${result.data.format}`);
        console.log(`  - Video: ${result.data.videoUrl}`);
        process.exit(0);
      } else {
        console.log('\n✗ Integration test FAILED');
        console.log('  Error:', result.error.message);
        process.exit(1);
      }
    } catch (error) {
      console.log('\n✗ Integration test FAILED');
      console.log('  Parse error:', error.message);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.log('\n✗ Integration test FAILED');
  console.log('  Request error:', error.message);
  process.exit(1);
});

req.write(data);
req.end();

setTimeout(() => {
  console.log('\n✗ Integration test TIMEOUT');
  process.exit(1);
}, 120000);
EOF

TEST_EXIT_CODE=$?

# Cleanup: stop API if we started it
if [ -n "$API_PID" ]; then
    echo ""
    echo "Stopping API service..."
    kill $API_PID 2>/dev/null || true
fi

exit $TEST_EXIT_CODE

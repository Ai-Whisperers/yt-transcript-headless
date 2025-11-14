#!/bin/bash
# Bootstrap script: Start all services natively (without Docker)
# This script runs source code from ../api and ../web folders

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "Starting YouTube Transcript Extractor (Native Development)"
echo "==========================================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "$PROJECT_ROOT/api/node_modules" ]; then
    echo "Installing API dependencies..."
    cd "$PROJECT_ROOT/api"
    npm install
fi

if [ ! -d "$PROJECT_ROOT/web/node_modules" ]; then
    echo "Installing Web dependencies..."
    cd "$PROJECT_ROOT/web"
    npm install
fi

# Start API in background
echo "Starting API server..."
cd "$PROJECT_ROOT/api"
npm run dev &
API_PID=$!

# Wait for API to start
sleep 3

# Start Web server
echo "Starting Web server..."
cd "$PROJECT_ROOT/web"
npm run dev &
WEB_PID=$!

echo ""
echo "Services started:"
echo "  API: http://localhost:3000 (PID: $API_PID)"
echo "  Web: http://localhost:5173 (PID: $WEB_PID)"
echo ""
echo "Press Ctrl+C to stop all services"

# Trap exit signal to kill background processes
trap "kill $API_PID $WEB_PID 2>/dev/null; exit" INT TERM

# Wait for processes
wait

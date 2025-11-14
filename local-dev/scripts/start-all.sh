#!/bin/bash
# Bootstrap script: Start all services using Docker Compose
# This script runs source code from ../api and ../web folders

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DEV_DIR="$(dirname "$SCRIPT_DIR")"

echo "Starting YouTube Transcript Extractor (Local Development)"
echo "=========================================================="

# Check if .env files exist
if [ ! -f "$LOCAL_DEV_DIR/.env.api" ]; then
    echo "Warning: .env.api not found. Copying from template..."
    cp "$LOCAL_DEV_DIR/.env.api.template" "$LOCAL_DEV_DIR/.env.api"
fi

if [ ! -f "$LOCAL_DEV_DIR/.env.web" ]; then
    echo "Warning: .env.web not found. Copying from template..."
    cp "$LOCAL_DEV_DIR/.env.web.template" "$LOCAL_DEV_DIR/.env.web"
fi

# Start services with Docker Compose
echo "Starting services..."
cd "$LOCAL_DEV_DIR"
docker-compose -f docker-compose.dev.yml up --build

echo "Services stopped."

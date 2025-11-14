#!/bin/bash
# Bootstrap script: Stop all Docker services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DEV_DIR="$(dirname "$SCRIPT_DIR")"

echo "Stopping all services..."
cd "$LOCAL_DEV_DIR"
docker-compose -f docker-compose.dev.yml down

echo "Services stopped successfully."

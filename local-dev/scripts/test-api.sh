#!/bin/bash
# Bootstrap script: Run API tests
# This script runs tests from ../api/tests folder

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "Running API Tests"
echo "================="
echo ""

# Check if dependencies are installed
if [ ! -d "$PROJECT_ROOT/api/node_modules" ]; then
    echo "Installing API dependencies..."
    cd "$PROJECT_ROOT/api"
    npm install
fi

# Run tests
cd "$PROJECT_ROOT/api"

# Check if test type is specified
TEST_TYPE="${1:-all}"

case $TEST_TYPE in
  unit)
    echo "Running unit tests..."
    npm run test:unit
    ;;
  e2e)
    echo "Running E2E tests..."
    npm run test:e2e
    ;;
  all)
    echo "Running all tests..."
    npm test
    ;;
  *)
    echo "Unknown test type: $TEST_TYPE"
    echo "Usage: $0 [unit|e2e|all]"
    exit 1
    ;;
esac

echo ""
echo "Tests completed successfully!"

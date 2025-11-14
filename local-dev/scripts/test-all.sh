#!/bin/bash
# Bootstrap script: Run all tests (unit, E2E, and integration)
# This script orchestrates the complete test suite

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Running Complete Test Suite"
echo "==========================="
echo ""

# Track failures
FAILED_TESTS=()

# Run unit tests
echo "Step 1/3: Unit Tests"
echo "--------------------"
if ! "$SCRIPT_DIR/test-api.sh" unit; then
    FAILED_TESTS+=("Unit Tests")
fi
echo ""

# Run E2E tests
echo "Step 2/3: E2E Tests"
echo "-------------------"
if ! "$SCRIPT_DIR/test-api.sh" e2e; then
    FAILED_TESTS+=("E2E Tests")
fi
echo ""

# Run integration tests
echo "Step 3/3: Integration Tests"
echo "---------------------------"
if ! "$SCRIPT_DIR/test-integration.sh"; then
    FAILED_TESTS+=("Integration Tests")
fi
echo ""

# Summary
echo "================================"
echo "Test Suite Summary"
echo "================================"

if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
    echo "✓ All tests PASSED!"
    exit 0
else
    echo "✗ Some tests FAILED:"
    for test in "${FAILED_TESTS[@]}"; do
        echo "  - $test"
    done
    exit 1
fi

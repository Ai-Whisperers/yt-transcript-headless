#!/bin/bash
# Docker Cleanup Script
# Prevents build cache and temporary data accumulation
# Run periodically to maintain clean Docker environment

set -e

echo "🧹 Docker Cleanup Script"
echo "========================"
echo ""

# Show current disk usage
echo "📊 Current Docker disk usage:"
docker system df
echo ""

# Prompt for cleanup
read -p "Proceed with cleanup? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cleanup cancelled"
    exit 0
fi

echo ""
echo "🗑️  Removing stopped containers..."
docker container prune -f

echo ""
echo "🗑️  Removing dangling images..."
docker image prune -f

echo ""
echo "🗑️  Removing unused build cache..."
docker builder prune -f

echo ""
echo "🗑️  Removing unused volumes..."
docker volume prune -f

echo ""
echo "🗑️  Removing unused networks..."
docker network prune -f

echo ""
echo "📊 Disk usage after cleanup:"
docker system df

echo ""
echo "✅ Cleanup complete!"

#!/bin/bash

# World Cup Prediction System - E2E Test Runner
# This script runs the complete Playwright E2E test suite

set -e

echo "========================================="
echo "  E2E Test Suite - Playwright"
echo "========================================="
echo ""

# Check if infrastructure is running
echo "📦 Checking infrastructure services..."
if ! docker ps | grep -q worldcup-redis-dev; then
    echo "❌ Infrastructure not running. Starting services..."
    docker-compose -f docker-compose.infra.yml up -d
    echo "⏳ Waiting for services to be ready..."
    sleep 10
else
    echo "✅ Infrastructure is running"
fi

# Check if app is running
echo ""
echo "🚀 Checking application status..."
if ! curl -s http://localhost:3000/prediction/teams > /dev/null 2>&1; then
    echo "❌ Application not responding on port 3000"
    echo "   Please start the application with:"
    echo "   SMS_SANDBOX=true npm run start:dev"
    exit 1
else
    echo "✅ Application is responding"
fi

# Start worker process for prediction processing
echo ""
echo "⚙️  Starting worker process..."
WORKER_MODE=true npm run start:worker > /tmp/worker-e2e.log 2>&1 &
WORKER_PID=$!
echo "✅ Worker started (PID: $WORKER_PID)"

# Cleanup function to stop worker on exit
cleanup() {
    echo ""
    echo "🛑 Stopping worker process..."
    kill $WORKER_PID 2>/dev/null || true
    wait $WORKER_PID 2>/dev/null || true
    echo "✅ Worker stopped"
}
trap cleanup EXIT INT TERM

# Clear Redis and old sessions for clean test run
echo ""
echo "🧹 Clearing Redis cache and old sessions..."
if ! docker exec worldcup-redis-dev redis-cli FLUSHDB > /dev/null 2>&1; then
    echo "❌ Failed to clear Redis. Is the container running?"
    exit 1
fi

# Clear old sessions from database to improve auth guard performance
docker exec worldcup-postgres-dev psql -U postgres -d worldcup_predictions -c \
  "DELETE FROM sessions WHERE expires_at < NOW() OR created_at < NOW() - INTERVAL '1 hour';" > /dev/null 2>&1

echo "✅ Redis cleared, old sessions removed"

# Wait for worker to be ready
sleep 3

# Run tests
echo ""
echo "🧪 Running Playwright tests..."
echo "========================================="
SMS_SANDBOX=true npx playwright test --workers=1

# Show results
echo ""
echo "========================================="
echo "📊 Test Results"
echo "========================================="
echo ""
echo "View detailed report at:"
echo "  npx playwright show-report"
echo ""
echo "✅ E2E tests complete!"


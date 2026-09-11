#!/bin/bash
# Starts NeoViz — backend + frontend — with one command.
# Usage:  ./start.sh
# Stop everything with Ctrl+C.

set -e
cd "$(dirname "$0")"

export JWT_SECRET="neoviz_local_dev_secret"

echo "Starting backend..."
(cd backend && node index.js) &
BACKEND_PID=$!

# Stop the backend automatically when this script exits (Ctrl+C, or frontend closing).
cleanup() {
  echo ""
  echo "Stopping backend..."
  kill "$BACKEND_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

# Give the backend a moment to come up before starting the frontend.
sleep 2

echo "Starting frontend..."
cd frontend
npm start

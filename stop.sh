#!/usr/bin/env bash
if [ -f /tmp/deep-skim-serve.pid ]; then
  kill "$(cat /tmp/deep-skim-serve.pid)" 2>/dev/null || true
  rm -f /tmp/deep-skim-serve.pid
fi
lsof -ti :8080 | xargs kill 2>/dev/null || true
echo "Deep-Skim server stopped."

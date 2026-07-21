#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if lsof -ti :8080 >/dev/null 2>&1; then
  echo "Already running at http://localhost:8080"
  open "http://localhost:8080" 2>/dev/null || true
  exit 0
fi
nohup python3 -m http.server 8080 > /tmp/deep-skim-serve.log 2>&1 &
echo $! > /tmp/deep-skim-serve.pid
sleep 0.4
open "http://localhost:8080" 2>/dev/null || true
echo "Deep-Skim → http://localhost:8080  (pid $(cat /tmp/deep-skim-serve.pid))"

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8080}"
URL="http://127.0.0.1:${PORT}/"

if [[ "${SKIP_GIT_PULL:-0}" != "1" ]]; then
  SUITE_PULL="$(cd "$(dirname "$0")/../otterly-suite" 2>/dev/null && pwd)/git-pull.sh"
  if [[ -f "$SUITE_PULL" ]]; then
    # shellcheck disable=SC1090
    source "$SUITE_PULL"
    otterly_git_pull "."
  fi
fi

if curl -sS -o /dev/null --max-time 1 "$URL" 2>/dev/null; then
  if [[ "${OTTERLY_GIT_UPDATED:-0}" == "1" ]]; then
    echo "New GitHub commit — restarting Deep-Skim."
    lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
    sleep 0.3
  else
    echo "Already running at $URL"
    open "$URL" 2>/dev/null || true
    exit 0
  fi
fi

if lsof -tiTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  lsof -tiTCP:"${PORT}" -sTCP:LISTEN | xargs kill 2>/dev/null || true
  sleep 0.3
fi

export PORT PYTHONUNBUFFERED=1
nohup python3 -u serve.py > /tmp/deep-skim-serve.log 2>&1 &
echo $! > /tmp/deep-skim-serve.pid
sleep 0.4
open "$URL" 2>/dev/null || true
echo "Deep-Skim → $URL  (pid $(cat /tmp/deep-skim-serve.pid))"

#!/bin/sh
# `wrangler login` that opens the OAuth page in Microsoft Edge instead of the system default browser.
# Wrangler has no browser setting; --browser=false prints the URL, and `open -a` hands it to Edge.
set -e
cd "$(dirname "$0")/../worker"
LOG="$(mktemp)"
npx wrangler login --browser=false >"$LOG" 2>&1 &
PID=$!
for _ in $(seq 1 30); do
  URL="$(grep -o 'https://dash.cloudflare.com/oauth2/auth[^ ]*' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || { cat "$LOG"; exit 1; }
open -a "Microsoft Edge" "$URL"
echo "Approve access in Edge; waiting for wrangler…"
wait $PID

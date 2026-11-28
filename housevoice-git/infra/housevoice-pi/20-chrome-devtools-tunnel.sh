#!/usr/bin/env bash
# Keep the HouseVoice Pi Chrome DevTools tunnel available for the sandboxed MCP.
set -euo pipefail
umask 077

manager=/data/chrome-devtools-mcp/opencode-browser-tunnel
log=/data/chrome-devtools-mcp/browser-tunnel.log
key=/data/housevoice-ssh/housevoice_pi_ed25519
known_hosts=/data/housevoice-ssh/known_hosts
endpoint=http://127.0.0.1:9223/json/version

for path in "$manager" "$key" "$known_hosts"; do
  if [ ! -f "$path" ] || [ -L "$path" ]; then
    echo "Required tunnel file is missing or unsafe: $path" >&2
    exit 1
  fi
done

if [ "$(stat -c '%u:%g:%a' "$key")" != "0:0:600" ] || \
   [ "$(stat -c '%u:%g:%a' "$known_hosts")" != "0:0:600" ]; then
  echo "SSH key and known_hosts must remain root:root mode 600" >&2
  exit 1
fi

if curl -fsS --connect-timeout 1 --max-time 2 "$endpoint" >/dev/null 2>&1; then
  echo "Chrome DevTools tunnel is already ready on 127.0.0.1:9223"
  exit 0
fi

install -m 600 -o root -g root /dev/null "$log"
setsid "$manager" >>"$log" 2>&1 </dev/null &
manager_pid=$!

for _ in $(seq 1 30); do
  if curl -fsS --connect-timeout 1 --max-time 2 "$endpoint" >/dev/null 2>&1; then
    echo "Chrome DevTools tunnel is ready on 127.0.0.1:9223"
    exit 0
  fi
  sleep 1
done

if kill -0 "$manager_pid" 2>/dev/null; then
  echo "Chrome DevTools tunnel manager is running; downstream CDP is not ready"
  exit 0
fi

echo "Chrome DevTools tunnel did not become ready; see $log" >&2
exit 1

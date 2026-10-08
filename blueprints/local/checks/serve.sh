# Sourced, not run: builds, then starts the built server on a spare port with the default settings and
# waits for /api/health. Sets `port` and `log`; the EXIT trap stops only what it started.
yarn build >/dev/null
# process.stdout.write, not console.log: with FORCE_COLOR set, console.log colours a number, and the
# escape codes would become part of the port.
port=$(node -e 'const s = require("node:net").createServer().listen(0, "127.0.0.1", () => { process.stdout.write(String(s.address().port)); s.close(); })')
log=$(mktemp)
env -u HOST PORT="$port" yarn start >"$log" 2>&1 &
started=$!
listener=""
stop() {
  # Only what this check started: the yarn process and the server it found listening, by pid.
  [ -z "$listener" ] || kill "$listener" 2>/dev/null || true
  kill "$started" 2>/dev/null || true
  rm -f "$log"
}
trap stop EXIT INT TERM
tries=0
until curl -fsS --max-time 2 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -lt 60 ] || { echo "the server did not answer /api/health on port $port" >&2; cat "$log" >&2; exit 1; }
  sleep 0.5
done
listener=$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)

# Sourced, not run: builds, then starts the app on this computer with `yarn start --port <port>` (wrangler dev) and waits
# for /api/health. Sets `port`. wrangler dev runs as a tree of processes (yarn, wrangler, workerd, esbuild) and a parent
# left behind restarts its workerd, so the EXIT trap stops the whole tree this check started, and nothing else.
yarn build >/dev/null
# process.stdout.write, not console.log: with FORCE_COLOR set, console.log colours a number.
port=$(node -e 'const s = require("node:net").createServer().listen(0, "127.0.0.1", () => { process.stdout.write(String(s.address().port)); s.close(); })')
log=$(mktemp)
yarn -s start --port "$port" >"$log" 2>&1 &
started=$!
stop_tree() {
  for child in $(pgrep -P "$1" 2>/dev/null); do stop_tree "$child"; done
  kill "$1" 2>/dev/null || true
}
stop() {
  stop_tree "$started"
  rm -f "$log"
}
trap stop EXIT INT TERM
tries=0
until curl -fsS --max-time 2 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -lt 120 ] || { echo "the app did not answer /api/health on port $port (yarn start --port $port)" >&2; cat "$log" >&2; exit 1; }
  sleep 0.5
done

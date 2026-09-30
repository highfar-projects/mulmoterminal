# Sourced, not run: starts the app on this computer with `yarn start --port <port>` (the local stack, a local build, and
# wrangler dev serving it) and waits for the page. Sets `port` and `api` (the local stack's URL). wrangler dev runs as a
# tree of processes, and a parent left behind restarts its workerd, so the EXIT trap stops the whole tree this check
# started, and nothing else. The local stack is left running: the next step needs it.
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
until curl -fsS --max-time 2 "http://127.0.0.1:$port/" 2>/dev/null | grep -q 'id="app"'; do
  tries=$((tries + 1))
  [ "$tries" -lt 240 ] || { echo "the app did not serve its page on port $port (yarn start --port $port)" >&2; cat "$log" >&2; exit 1; }
  sleep 0.5
done
api=$(yarn -s supabase status -o json 2>/dev/null | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>process.stdout.write(JSON.parse(s).API_URL))')

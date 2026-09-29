#!/bin/sh
# The security review is proven by the running app, not by the review's word: the built server is sent
# the requests an attack would send (a rebound Host, a cross-site state change, a malformed body) and
# must refuse them, its responses carry the headers a browser needs, its dependencies have no known
# high-severity hole, and the review's own report and tests are in place.
set -eu
sh "$(dirname "$0")/security-report.sh"
[ -f test/security.test.ts ] || { echo "missing test/security.test.ts" >&2; exit 1; }
yarn test >/dev/null || { echo "yarn test fails" >&2; yarn test >&2 || true; exit 1; }
# Read from the summary, not the exit code: an audit that could not reach the registry must not pass.
yarn audit --groups dependencies --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{
  const summary = s.split("\n").filter(Boolean).map((line) => JSON.parse(line)).find((entry) => entry.type === "auditSummary");
  if (!summary) { console.error("yarn audit did not report a summary (is the registry reachable?)"); process.exit(1); }
  const { high = 0, critical = 0 } = summary.data.vulnerabilities;
  if (high + critical > 0) { console.error(`yarn audit: ${high} high and ${critical} critical vulnerabilities in dependencies; run yarn audit --groups dependencies`); process.exit(1); }
})'

. "$(dirname "$0")/serve.sh"
base="http://127.0.0.1:$port"
status() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$@"; }
fail() { echo "$1" >&2; exit 1; }

# DNS rebinding: an attacker's name resolved to 127.0.0.1 reaches this server with the attacker's Host.
for path in /api/health /; do
  code=$(status -H "Host: rebind.example:$port" "$base$path")
  case "$code" in 400 | 403 | 421) ;; *) fail "GET $path with Host: rebind.example answered $code; a Host outside the allow-list must be refused (421), or any web page can read and write this API through DNS rebinding" ;; esac
done
for host in "localhost:$port" "127.0.0.1:$port"; do
  code=$(status -H "Host: $host" "$base/api/health")
  [ "$code" = 200 ] || fail "GET /api/health with Host: $host answered $code; the allow-list must keep this computer's own names"
done

# A state change sent from another site's page.
code=$(status -X POST -H "Origin: https://attacker.example" -H "Content-Type: application/json" -d '{}' "$base/api/blueprint-security-probe")
[ "$code" = 403 ] || fail "POST /api/… from Origin https://attacker.example answered $code; a state change from another origin must be refused with 403 before routing and sign-in"

headers=$(curl -s -D - -o /dev/null --max-time 5 "$base/")
has() { printf '%s' "$headers" | tr -d '\r' | grep -qiE "$1"; }
has '^x-content-type-options: *nosniff' || fail "/ is served without X-Content-Type-Options: nosniff"
has '^content-security-policy:' || fail "/ is served without a Content-Security-Policy"
has "^content-security-policy:.*frame-ancestors|^x-frame-options: *(deny|sameorigin)" || fail "/ can be framed by another site (no frame-ancestors in the CSP, no X-Frame-Options)"
! has '^x-powered-by:' || fail "responses carry X-Powered-By; turn it off (app.disable(\"x-powered-by\"))"

# A malformed body must be answered without the server's insides.
body=$(curl -s --max-time 5 -X POST -H "Origin: $base" -H "Content-Type: application/json" --data '{"broken' "$base/api/blueprint-security-probe")
if printf '%s' "$body" | grep -qE 'node_modules|at [^ ]+ \(|SyntaxError: '; then
  fail "a malformed JSON body is answered with a stack trace or the parser's error: $(printf '%s' "$body" | head -c 300)"
fi

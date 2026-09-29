#!/bin/sh
# The security review is proven by the running Worker, not by the review's word: the app started with wrangler dev is
# sent the requests an attack would send (a cross-site state change, a malformed body) and must refuse them, its pages
# and its API carry the headers a browser needs, its secrets stay out of any repository, its dependencies have no known
# high-severity hole, and the review's own report and tests are in place.
set -eu
sh "$(dirname "$0")/security-report.sh"
[ -f test/security.test.ts ] || { echo "missing test/security.test.ts" >&2; exit 1; }
# Local secrets live in .dev.vars (or .env); the folder becomes a repository whenever its person adds git.
for secrets in .dev.vars .env; do
  if [ -f "$secrets" ] && ! grep -qxE "/?$(printf '%s' "$secrets" | sed 's/\./\\./g')(\\*)?" .gitignore 2>/dev/null; then
    echo "$secrets exists and .gitignore does not ignore it; add a line $secrets to .gitignore" >&2
    exit 1
  fi
done
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

# A state change sent from another site's page.
code=$(status -X POST -H "Origin: https://attacker.example" -H "Content-Type: application/json" -d '{}' "$base/api/blueprint-security-probe")
[ "$code" = 403 ] || fail "POST /api/… from Origin https://attacker.example answered $code; a state change from another origin must be refused with 403 before routing and sign-in"

# The page is served as a static asset, which does not go through the Worker: its headers come from public/_headers.
for target in / /api/health; do
  headers=$(curl -s -D - -o /dev/null --max-time 5 "$base$target" | tr -d '\r')
  has() { printf '%s' "$headers" | grep -qiE "$1"; }
  has '^x-content-type-options: *nosniff' || fail "$target is served without X-Content-Type-Options: nosniff"
  has '^content-security-policy:' || fail "$target is served without a Content-Security-Policy"
  has "^content-security-policy:.*frame-ancestors|^x-frame-options: *(deny|sameorigin)" || fail "$target can be framed by another site (no frame-ancestors in the CSP, no X-Frame-Options)"
  ! has '^x-powered-by:' || fail "$target carries X-Powered-By"
done

# A malformed body is refused at the entry, before routing — a Worker reads JSON per route, so a check against a path no
# route handles proves nothing unless the body is read once, up front — and is answered without the Worker's insides.
response=$(curl -s --max-time 5 -w '\n%{http_code}' -X POST -H "Origin: $base" -H "Content-Type: application/json" --data '{"broken' "$base/api/blueprint-security-probe")
code=$(printf '%s' "$response" | tail -n 1)
body=$(printf '%s' "$response" | sed '$d')
[ "$code" = 400 ] || fail "a malformed JSON body to /api/… answered $code; it must be refused with 400 where the Worker reads JSON bodies, before routing"
if printf '%s' "$body" | grep -qE 'node_modules|at [^ ]+ \(|SyntaxError: |src/worker/'; then
  fail "a malformed JSON body is answered with a stack trace or the parser's error: $(printf '%s' "$body" | head -c 300)"
fi

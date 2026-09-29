#!/bin/sh
# The security review is proven by the running stack, not by the review's word: Supabase's own security linter finds
# nothing, every table in public is tried by a signed-out visitor and by a signed-in user who owns nothing and lets
# through only what .blueprint/public-access.json allows, the served page carries the headers a browser needs and no key
# that must stay on the server, secrets stay out of any repository, dependencies have no known high-severity hole, and
# the review's own report and tests are in place.
set -eu
here="$(dirname "$0")"
sh "$here/security-report.sh"
[ -f test/security.test.ts ] || { echo "missing test/security.test.ts" >&2; exit 1; }
# Local settings live in .env files; the folder becomes a repository whenever its person adds git.
ignored() {
  name=$(printf '%s' "$1" | sed 's/\./\\./g')
  grep -qxE "/?$name(\\*)?|/?\\.env\\*|\\*\\.local" .gitignore 2>/dev/null
}
for secrets in .env .env.local .env.development.local .env.production.local supabase/.env; do
  if [ -f "$secrets" ] && ! ignored "$secrets"; then
    echo "$secrets exists and .gitignore does not ignore it; add a line $secrets to .gitignore" >&2
    exit 1
  fi
done
# Read from the summary, not the exit code: an audit that could not reach the registry must not pass.
yarn audit --groups dependencies --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{
  const summary = s.split("\n").filter(Boolean).map((line) => JSON.parse(line)).find((entry) => entry.type === "auditSummary");
  if (!summary) { console.error("yarn audit did not report a summary (is the registry reachable?)"); process.exit(1); }
  const { high = 0, critical = 0 } = summary.data.vulnerabilities;
  if (high + critical > 0) { console.error(`yarn audit: ${high} high and ${critical} critical vulnerabilities in dependencies; run yarn audit --groups dependencies`); process.exit(1); }
})'

. "$here/local-stack.sh"
node --no-warnings "$here/advisors.mjs" --local
node --no-warnings "$here/security-probe.mjs"
# The probe's writes that were allowed stay in the database; the tests start again from the migrations and the seed.
. "$here/local-stack.sh"
yarn test >/dev/null || { echo "yarn test fails" >&2; yarn test >&2 || true; exit 1; }

. "$here/serve.sh"
fail() { echo "$1" >&2; exit 1; }
headers=$(curl -s -D - -o /dev/null --max-time 5 "http://127.0.0.1:$port/" | tr -d '\r')
has() { printf '%s' "$headers" | grep -qiE "$1"; }
has '^x-content-type-options: *nosniff' || fail "/ is served without X-Content-Type-Options: nosniff"
has '^content-security-policy:' || fail "/ is served without a Content-Security-Policy"
has "^content-security-policy:.*frame-ancestors|^x-frame-options: *(deny|sameorigin)" || fail "/ can be framed by another site (no frame-ancestors in the CSP, no X-Frame-Options)"
! has '^x-powered-by:' || fail "/ carries X-Powered-By"
# The build, and every .env file: a secret key under a name Vite does not expose never reaches dist/, but it would reach
# a repository.
set -- dist
for env in .env* supabase/.env*; do [ -f "$env" ] && set -- "$@" "$env"; done
node --no-warnings "$here/client-secrets.mjs" "$@"

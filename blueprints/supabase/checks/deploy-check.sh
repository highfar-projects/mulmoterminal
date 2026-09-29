#!/bin/sh
# The published page serves the build this deploy made (the deploy writes a fresh id to .blueprint/build-id and ships it
# as /blueprint-build.txt), talks to the production Supabase named in .blueprint/supabase-url and to no other, is allowed
# by its Content-Security-Policy to reach that one only, carries no key that must stay on the server, and renders. The production database has every migration applied and passes
# Supabase's security linter.
set -eu
here="$(dirname "$0")"
[ -s .blueprint/deploy-url ] || { echo "missing .blueprint/deploy-url; the deploy step writes the URL it published to" >&2; exit 1; }
url=$(tr -d ' \n\r' < .blueprint/deploy-url)
url=${url%/}
case "$url" in https://*) ;; *) echo ".blueprint/deploy-url is not an https URL: $url" >&2; exit 1 ;; esac
[ -s .blueprint/supabase-url ] || { echo "missing .blueprint/supabase-url; the deploy step writes the production Supabase URL" >&2; exit 1; }
supabase=$(tr -d ' \n\r' < .blueprint/supabase-url)
supabase=${supabase%/}
case "$supabase" in https://*) ;; *) echo ".blueprint/supabase-url is not an https URL: $supabase" >&2; exit 1 ;; esac
[ -s .blueprint/build-id ] || { echo "missing .blueprint/build-id; the deploy step writes it before deploying" >&2; exit 1; }
expected=$(cat .blueprint/build-id)
served=$(curl -fsS --max-time 20 "$url/blueprint-build.txt")
[ "$served" = "$expected" ] || { echo "$url serves build $served, this deploy made $expected" >&2; exit 1; }
node --no-warnings "$here/client-secrets.mjs" "$url/" "$supabase"
sh "$here/page-renders.sh" "$url/"

# Production itself, through the person's supabase login and the project this folder is linked to.
node --no-warnings "$here/migrations-applied.mjs"
node --no-warnings "$here/advisors.mjs" --linked

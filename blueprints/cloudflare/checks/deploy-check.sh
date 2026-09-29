#!/bin/sh
# The published Worker serves the build this deploy made: the deploy writes a fresh id to .blueprint/build-id and ships
# the same id as /blueprint-build.txt, and records the URL it published to in .blueprint/deploy-url. The published app
# answers /api/health, sends the security headers, and its page renders.
set -eu
[ -s .blueprint/deploy-url ] || { echo "missing .blueprint/deploy-url; the deploy step writes the URL it published to" >&2; exit 1; }
url=$(tr -d ' \n\r' < .blueprint/deploy-url)
url=${url%/}
case "$url" in https://*) ;; *) echo ".blueprint/deploy-url is not an https URL: $url" >&2; exit 1 ;; esac
[ -s .blueprint/build-id ] || { echo "missing .blueprint/build-id; the deploy step writes it before deploying" >&2; exit 1; }
expected=$(cat .blueprint/build-id)
served=$(curl -fsS --max-time 20 "$url/blueprint-build.txt")
[ "$served" = "$expected" ] || { echo "$url serves build $served, this deploy made $expected" >&2; exit 1; }
curl -fsS --max-time 20 "$url/api/health" | grep -q '"ok":true' || { echo "$url/api/health does not answer {\"ok\":true}" >&2; exit 1; }
curl -s -D - -o /dev/null --max-time 20 "$url/" | tr -d '\r' | grep -qi '^content-security-policy:' || { echo "$url/ is published without a Content-Security-Policy" >&2; exit 1; }
sh "$(dirname "$0")/page-renders.sh" "$url/"

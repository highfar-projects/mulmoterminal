#!/bin/sh
# The security review is proven by what ships, not by the review's word: the rules refuse what the
# review's emulator tests say they refuse, the rules end in deny-all, Hosting sends the headers a browser
# needs, no service account key is in the project, the dependencies have no known high-severity hole,
# the review's own report is in place, and dev runs what the review left — so production, which ships
# what dev ran, gets the fixes, and a header that breaks the page shows up here, on dev.
set -eu
here="$(dirname "$0")"
sh "$here/security-report.sh"
grep -qE 'allow +read, *write: *if +false' firestore.rules || { echo "firestore.rules does not end in a deny-all (allow read, write: if false)" >&2; exit 1; }
node -e 'const fs=require("node:fs");
  const hosting=[JSON.parse(fs.readFileSync("firebase.json","utf8")).hosting].flat().filter(Boolean);
  if (hosting.length===0) { console.error("firebase.json has no hosting section"); process.exit(1); }
  for (const site of hosting) {
    const all=(site.headers??[]).filter((h)=>h.source==="**").flatMap((h)=>h.headers??[]);
    const value=(key)=>all.find((h)=>h.key.toLowerCase()===key)?.value??"";
    const missing=[];
    if (!/nosniff/i.test(value("x-content-type-options"))) missing.push("X-Content-Type-Options: nosniff");
    if (!value("content-security-policy")) missing.push("Content-Security-Policy");
    if (!/frame-ancestors/i.test(value("content-security-policy")) && !/deny|sameorigin/i.test(value("x-frame-options"))) missing.push("frame-ancestors or X-Frame-Options");
    if (missing.length) { console.error("firebase.json hosting headers for ** lack: "+missing.join(", ")); process.exit(1); }
  }'
keys=$(grep -rlE '"private_key"|-----BEGIN [A-Z ]*PRIVATE KEY-----' . --exclude-dir=node_modules --exclude-dir=.firebase --exclude-dir=dist 2>/dev/null || true)
[ -z "$keys" ] || { printf 'a private key is in the project; move it out and revoke it:\n%s\n' "$keys" >&2; exit 1; }
audit() {
  # Read from the summary, not the exit code: an audit that could not reach the registry must not pass.
  (cd "$1" && yarn audit --groups dependencies --json 2>/dev/null) | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{
    const summary = s.split("\n").filter(Boolean).map((line) => JSON.parse(line)).find((entry) => entry.type === "auditSummary");
    if (!summary) { console.error(process.argv[1] + ": yarn audit did not report a summary (is the registry reachable?)"); process.exit(1); }
    const { high = 0, critical = 0 } = summary.data.vulnerabilities;
    if (high + critical > 0) { console.error(`${process.argv[1]}: yarn audit finds ${high} high and ${critical} critical vulnerabilities in dependencies`); process.exit(1); }
  })' "$1"
}
audit .
if [ -f functions/package.json ]; then
  [ -f functions/yarn.lock ] || { echo "functions/ has no yarn.lock; install its dependencies with yarn so they can be audited" >&2; exit 1; }
  audit functions
fi
sh "$here/emulator-test.sh" security
[ .blueprint/build-id -nt .blueprint/security-review.md ] || { echo "dev was not deployed after the review; deploy it to dev again so production ships what dev runs" >&2; exit 1; }
sh "$here/deploy-check.sh" dev

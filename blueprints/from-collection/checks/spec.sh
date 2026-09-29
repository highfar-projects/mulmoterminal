#!/bin/sh
# The spec carries the whole source over: every field, view, action and ingest of every copied collection is named in it
# by a token that says which collection it belongs to — `books.title`, `books.views.board`, `books.actions.tidy`,
# `books.ingest` — so nothing is dropped without a person seeing it go. A bare key is not enough: two collections
# share keys (`id`, `name`), and one of them would vouch for the other.
set -eu
[ -s .blueprint/source/source.json ] || { echo "missing .blueprint/source/source.json; the build was started without a collection" >&2; exit 1; }
node -e '
const fs = require("node:fs");
const spec = fs.readFileSync(".blueprint/spec.md", "utf8");
const source = JSON.parse(fs.readFileSync(".blueprint/source/source.json", "utf8"));
const missing = source.collections.flatMap((slug) => {
  const schema = JSON.parse(fs.readFileSync(`.blueprint/source/collections/${slug}/schema.json`, "utf8"));
  const tokens = [
    ...Object.keys(schema.fields ?? {}).map((key) => `${slug}.${key}`),
    ...(schema.views ?? []).map((view) => `${slug}.views.${view.id}`),
    ...[...(schema.actions ?? []), ...(schema.collectionActions ?? [])].map((action) => `${slug}.actions.${action.id}`),
    ...(schema.ingest ? [`${slug}.ingest`] : []),
  ];
  return tokens.filter((token) => !spec.includes("`" + token + "`"));
});
// The declaration of a shared app is carried over too: each part of app.json is named in the spec, so none of the access it
// granted or refused is lost on the way to rules the new app enforces.
const appManifest = ".blueprint/source/app.json";
const appTokens = () => {
  if (source.from !== "app" || !fs.existsSync(appManifest)) return [];
  const app = JSON.parse(fs.readFileSync(appManifest, "utf8"));
  return [
    ...(Object.keys(app.members ?? {}).length > 0 ? ["app.members"] : []),
    ...Object.keys(app.collections ?? {}).map((cid) => `app.collections.${cid}`),
    ...Object.keys(app.public?.submit ?? {}).map((cid) => `app.public.submit.${cid}`),
    ...(app.public?.view ? ["app.public.view"] : []),
    ...(app.views ?? []).map((view) => `app.views.${view.id}`),
  ];
};
missing.push(...appTokens().filter((token) => !spec.includes("`" + token + "`")));
if (missing.length > 0) {
  console.error("the spec does not cover the source yet (name each in backquotes, as `collection.key` or `app.…`):\n" + missing.join("\n"));
  process.exit(1);
}
'
# What is decided for each action and ingest is its own record, checked the same way by the actions step.
node --no-warnings "$(dirname "$0")/decisions.mjs"

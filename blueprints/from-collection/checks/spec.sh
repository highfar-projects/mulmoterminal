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
// Every action and ingest of the source gets exactly one decision the next step can act on, and a mutate is always built.
const actionProblems = () => {
  const wanted = source.collections.flatMap((slug) => {
    const schema = JSON.parse(fs.readFileSync(`.blueprint/source/collections/${slug}/schema.json`, "utf8"));
    return [
      ...[...(schema.actions ?? []), ...(schema.collectionActions ?? [])].map((action) => ({ name: `${slug}.actions.${action.id}`, kind: action.kind })),
      ...(schema.ingest ? [{ name: `${slug}.ingest`, kind: schema.ingest.kind }] : []),
    ];
  });
  if (wanted.length === 0) return [];
  const file = ".blueprint/actions.json";
  if (!fs.existsSync(file)) return [`${file} is missing; it records how each of the ${wanted.length} actions and ingests is handled`];
  const entries = JSON.parse(fs.readFileSync(file, "utf8")).actions ?? [];
  const byName = new Map();
  entries.forEach((entry) => byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry]));
  const known = new Set(wanted.map((item) => item.name));
  return [
    ...wanted.flatMap(({ name, kind }) => {
      const found = byName.get(name) ?? [];
      if (found.length !== 1) return [`${file}: ${name} has ${found.length} entries, it needs one`];
      const decision = found[0].decision;
      if (!["feature", "manual", "drop"].includes(decision)) return [`${file}: ${name} has decision ${JSON.stringify(decision)}; it is feature, manual or drop`];
      return kind === "mutate" && decision !== "feature" ? [`${file}: ${name} is a mutate, which is always built (feature)`] : [];
    }),
    ...entries.filter((entry) => !known.has(entry.name)).map((entry) => `${file}: ${entry.name} is not an action or ingest of the source`),
  ];
};
missing.push(...actionProblems());
if (missing.length > 0) {
  console.error("the spec does not cover the source yet (name each in backquotes, as `collection.key` or `app.…`):\n" + missing.join("\n"));
  process.exit(1);
}
'

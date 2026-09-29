#!/bin/sh
# The spec carries the whole source over: every field, view and action of every copied collection is named in it by
# its key in backquotes (`key`), so nothing the collection did is dropped without a person seeing it go. The quotes
# are required because a bare short key (`id`, `name`) would be found inside any other word.
set -eu
[ -s .blueprint/source/source.json ] || { echo "missing .blueprint/source/source.json; the build was started without a collection" >&2; exit 1; }
node -e '
const fs = require("node:fs");
const spec = fs.readFileSync(".blueprint/spec.md", "utf8");
const source = JSON.parse(fs.readFileSync(".blueprint/source/source.json", "utf8"));
const missing = source.collections.flatMap((slug) => {
  const schema = JSON.parse(fs.readFileSync(`.blueprint/source/collections/${slug}/schema.json`, "utf8"));
  const names = [
    ...Object.keys(schema.fields ?? {}).map((key) => ["field", key]),
    ...(schema.views ?? []).map((view) => ["view", view.id]),
    ...[...(schema.actions ?? []), ...(schema.collectionActions ?? [])].map((action) => ["action", action.id]),
  ];
  return names.filter(([, name]) => !spec.includes("`" + name + "`")).map(([kind, name]) => `${slug}: ${kind} ${name}`);
});
if (missing.length > 0) {
  console.error("the spec does not carry these over from the source (name each by its key in backquotes, `key`):\n" + missing.join("\n"));
  process.exit(1);
}
'

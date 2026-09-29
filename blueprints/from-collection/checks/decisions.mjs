// What was decided for the source's actions and ingests, held against the source: every action (`actions`,
// `collectionActions`) and ingest has exactly one entry in .blueprint/actions.json, under its own name and kind, with a
// decision the actions step can act on — and a mutate is always built. A source with neither needs no file. Both the
// spec check and the actions check run this, so a build that reaches the actions step without a spec check behind it
// is held to the same record. Prints each problem, and exits 1 when there is any.
import { existsSync, readFileSync } from "node:fs";

const SOURCE = ".blueprint/source";
const FILE = ".blueprint/actions.json";
const DECISIONS = new Set(["feature", "manual", "drop"]);

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

// What the source has to be decided on: each action and ingest, by the name the spec uses, with the kind it was.
function wanted() {
  return readJson(`${SOURCE}/source.json`).collections.flatMap((slug) => {
    const schema = readJson(`${SOURCE}/collections/${slug}/schema.json`);
    return [
      ...[...(schema.actions ?? []), ...(schema.collectionActions ?? [])].map((action) => ({ name: `${slug}.actions.${action.id}`, kind: action.kind })),
      ...(schema.ingest ? [{ name: `${slug}.ingest`, kind: schema.ingest.kind }] : []),
    ];
  });
}

// The recorded entries, or null when the file is not JSON with an "actions" list.
function recorded() {
  try {
    const parsed = readJson(FILE);
    return Array.isArray(parsed?.actions) ? parsed.actions : null;
  } catch {
    return null;
  }
}

function entryProblems({ name, kind }, found) {
  if (found.length !== 1) return [`${FILE}: ${name} has ${found.length} entries, it needs one`];
  const [entry] = found;
  if (entry.kind !== kind) return [`${FILE}: ${name} is recorded as kind ${JSON.stringify(entry.kind)}; the source has it as ${JSON.stringify(kind)}`];
  if (!DECISIONS.has(entry.decision)) return [`${FILE}: ${name} has decision ${JSON.stringify(entry.decision)}; it is feature, manual or drop`];
  return kind === "mutate" && entry.decision !== "feature" ? [`${FILE}: ${name} is a mutate, which is always built (feature)`] : [];
}

function problems() {
  const items = wanted();
  if (items.length === 0) return [];
  if (!existsSync(FILE)) return [`${FILE} is missing; it records how each of the ${items.length} actions and ingests is handled`];
  const entries = recorded();
  if (entries === null) return [`${FILE} is not JSON with an "actions" list`];
  const known = new Set(items.map((item) => item.name));
  return [
    ...items.flatMap((item) =>
      entryProblems(
        item,
        entries.filter((entry) => entry?.name === item.name),
      ),
    ),
    ...entries.filter((entry) => !known.has(entry?.name)).map((entry) => `${FILE}: ${JSON.stringify(entry?.name)} is not an action or ingest of the source`),
  ];
}

const found = problems();
if (found.length > 0) {
  console.error(found.join("\n"));
  process.exit(1);
}

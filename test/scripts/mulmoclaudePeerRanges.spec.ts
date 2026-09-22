// @vitest-environment node
// Which `@mulmoclaude/core` each bundled plugin actually runs against.
//
// Every bundled plugin declares core as a PEER and none nests its own copy, so all of them import
// the single core MulmoTerminal installs. That is what makes every one of them breakable from
// HERE: a peer range is a declaration and yarn only warns, so a host that pins a core older than
// a plugin expects installs cleanly and fails late — the plugin keeps importing what it imported,
// and what breaks is the symbol core moved or re-typed, an empty control or an unformatted value
// in the pane rather than an install error. The stamped-`datetime` lock is the live example: it
// needs `isCanonicalServerTime`, which core added in the version the floor below names, and
// holding collection-plugin behind that left the pane drawing the field as an empty
// `datetime-local` — saving it then wrote over a value the rules refuse to see move.
//
// A plugin that declares core as a DEPENDENCY instead gets a nested copy and is insulated from
// our pin, which is a different regime this file's premise does not cover. `resolvedCoreFor`
// still reads that case, and the nesting check is what reports one appearing.
//
// So this reads what is INSTALLED rather than what package.json asks for: a range resolves to one
// version, and that version is the one that runs.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface Manifest {
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

// Read by path rather than by resolution: these packages ship an `exports` map with no
// `./package.json` entry, so `require.resolve` cannot reach the very file that says what they are.
const manifestAt = (dir: string): Manifest => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Manifest;

const pluginDir = (pkg: string): string => join(root, "node_modules", pkg);

/** Every bundled plugin, taken from OUR OWN manifest rather than typed out here.
 *
 *  A hand-kept list is the failure this file would otherwise have: a plugin added to
 *  `package.json` and not to the list is bundled, ships, and is never checked — the guard passes
 *  by not looking. `package.json` is where "bundled" is actually decided, so it is what is read.
 *
 *  It is the DEPENDENCIES that are read, not the directory: a plugin pulled in transitively by
 *  another package is not one of ours to keep compatible. */
const PLUGINS: string[] = Object.keys(manifestAt(root).dependencies ?? {})
  .filter((name) => /^@mulmoclaude\/.*-plugin$/u.test(name))
  .sort();

/** Plugins that name no core at all, in either list.
 *
 *  Recorded rather than skipped, because "declares nothing" and "is not checked" look identical
 *  from a predicate that filters. An entry here says someone looked and the plugin genuinely does
 *  not use core; a plugin that DROPS its declaration therefore fails until it is either fixed or
 *  added here on purpose. */
const NO_CORE: Record<string, string> = {
  "@mulmoclaude/form-plugin": "the form card is self-contained; it names core in neither list",
  "@mulmoclaude/x-plugin": "no peer dependencies at all",
};

/** The core a plugin actually imports: its own nested copy when it has one, otherwise ours. */
function resolvedCoreFor(pkg: string): { version: string; nested: boolean } | null {
  const nested = join(pluginDir(pkg), "node_modules", "@mulmoclaude", "core");
  if (existsSync(nested)) return { version: manifestAt(nested).version, nested: true };
  const top = join(root, "node_modules", "@mulmoclaude", "core");
  if (!existsSync(top)) return null;
  return { version: manifestAt(top).version, nested: false };
}

const declaredCoreOf = (pkg: string): string | undefined => {
  const manifest = manifestAt(pluginDir(pkg));
  return manifest.dependencies?.["@mulmoclaude/core"] ?? manifest.peerDependencies?.["@mulmoclaude/core"];
};

/** The leading `X.Y.Z` of a version as numbers, so a prerelease tail is ignored. */
function parseTriple(version: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(version);
  return match === null ? null : match.slice(1).map(Number);
}

/** `^X.Y.Z` against a concrete version. Written out rather than pulled from `semver`, which this
 *  repo does not declare — and every range in play is a caret, so the whole of semver would be
 *  answering one question. Anything else is refused rather than guessed at. */
function satisfiesCaret(version: string, range: string): boolean {
  const wanted = /^\^(\d+)\.(\d+)\.(\d+)$/u.exec(range);
  if (wanted === null) return false;
  const got = parseTriple(version);
  if (got === null) return false;
  const [wMajor, wMinor, wPatch] = wanted.slice(1).map(Number);
  const [gMajor, gMinor, gPatch] = got;
  if (gMajor !== wMajor) return false;
  if (gMinor !== wMinor) return gMinor > wMinor;
  return gPatch >= wPatch;
}

/** A concrete version against a MINIMUM, across majors.
 *
 *  Kept apart from `satisfiesCaret` because they answer different questions: a declared peer
 *  range is bound to one major, and a floor is not — a core several majors on still carries a
 *  symbol added long before it. Reading a floor with caret semantics passes only while core
 *  happens to sit on the floor's major, then goes red on the next major for no reason. */
function atLeast(version: string, floor: string): boolean {
  const got = parseTriple(version);
  const want = parseTriple(floor);
  if (got === null || want === null) return false;
  const firstDifference = got.findIndex((part, index) => part !== want[index]);
  return firstDifference === -1 || got[firstDifference] > want[firstDifference];
}

describe("the core each bundled plugin runs against", () => {
  it("has plugins to check, and reads them from what we actually bundle", () => {
    // Guards the reading itself: a manifest key that changed shape, or a filter that stopped
    // matching, would empty this list and every check below would pass on nothing.
    expect(PLUGINS.length).toBeGreaterThan(5);
    expect(PLUGINS).toContain("@mulmoclaude/collection-plugin");
  });

  it("every plugin either names a core or is recorded as naming none", () => {
    const silent = PLUGINS.filter((pkg) => declaredCoreOf(pkg) === undefined);
    // Both directions: a plugin that newly drops its declaration has to be looked at, and a
    // recorded one that starts declaring again has to lose its entry.
    expect([...silent].sort()).toEqual(Object.keys(NO_CORE).sort());
  });

  it("resolves a core that satisfies what it declares", () => {
    for (const pkg of PLUGINS) {
      const declared = declaredCoreOf(pkg);
      if (declared === undefined) continue; // covered by the test above
      const resolved = resolvedCoreFor(pkg);
      expect(resolved, `${pkg} declares core ${declared} and resolves none`).not.toBeNull();
      expect(satisfiesCaret(resolved?.version ?? "", declared), `${pkg} declares core ${declared} but runs ${resolved?.version}`).toBe(true);
    }
  });

  it("runs every plugin on OUR core, nesting none of its own", () => {
    // What makes all of them breakable by the core MulmoTerminal pins. A plugin that starts
    // declaring core as a dependency gets its own copy and leaves that regime, so its appearance
    // here has to be looked at rather than absorbed.
    const nesting = PLUGINS.filter((pkg) => resolvedCoreFor(pkg)?.nested !== false);
    expect(nesting).toEqual([]);
  });

  it("pins a core new enough for collection-plugin's stamped datetime", () => {
    // A floor, not a range: the symbol survives into later majors, so this must not go red the
    // next time core's major moves.
    expect(atLeast(resolvedCoreFor("@mulmoclaude/collection-plugin")?.version ?? "", "4.2.0")).toBe(true);

    // The version, not the behaviour: the behaviour is the package's own test. What this pins is
    // that MulmoTerminal is not holding it behind that fix.
    expect(atLeast(manifestAt(pluginDir("@mulmoclaude/collection-plugin")).version, "4.2.0")).toBe(true);
  });

  it("reads a floor across majors, where a caret range refuses one", () => {
    expect(atLeast("4.2.0", "4.2.0")).toBe(true);
    expect(atLeast("4.2.1", "4.2.0")).toBe(true);
    expect(atLeast("5.0.0", "4.2.0")).toBe(true);
    expect(atLeast("4.1.9", "4.2.0")).toBe(false);
    expect(atLeast("3.9.9", "4.2.0")).toBe(false);
    expect(atLeast("", "4.2.0")).toBe(false);
    // The difference the two helpers hold, and the reason the floor stopped using the caret.
    expect(satisfiesCaret("5.0.0", "^4.2.0")).toBe(false);
  });

  it("only recognises a caret range", () => {
    expect(satisfiesCaret("4.2.0", "^4.2.0")).toBe(true);
    expect(satisfiesCaret("4.2.1", "^4.2.0")).toBe(true);
    expect(satisfiesCaret("4.3.0", "^4.2.0")).toBe(true);
    expect(satisfiesCaret("4.1.9", "^4.2.0")).toBe(false);
    expect(satisfiesCaret("4.2.0", "^3.0.0")).toBe(false);
    expect(satisfiesCaret("3.9.9", "^4.0.0")).toBe(false);
    expect(satisfiesCaret("4.2.0", ">=4.0.0")).toBe(false);
  });
});

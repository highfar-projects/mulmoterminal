// @vitest-environment node
// The feature list (`docs/guide/{en,ja}/feature-list.md`, #2818) is kept up to date at every release,
// and says which release it is current as of. A page that falls behind does not look stale — it reads
// as a complete list of a product that has moved on — so the release that forgets it is stopped here,
// the same way `docs/facts.json`'s version is.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LANGUAGES = ["en", "ja"] as const;
// Each item names the release it arrived in as `(v8.1.0)`; other numbers on the page (a Node floor)
// are not release versions and are not read.
const RELEASE_RE = /\bv(\d+\.\d+\.\d+)/g;

const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");

function packageVersion(): string {
  const manifest: unknown = JSON.parse(read("package.json"));
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest) || typeof manifest.version !== "string") {
    throw new Error("package.json has no string `version`");
  }
  return manifest.version;
}

/** The `as_of:` line of the page's front matter, or null when there is none. */
function asOfVersion(page: string): string | null {
  const frontMatter = /^---\n([\s\S]*?)\n---/.exec(page)?.[1] ?? "";
  return /^as_of:\s*"?(\d+\.\d+\.\d+)"?\s*$/m.exec(frontMatter)?.[1] ?? null;
}

const asNumbers = (version: string): number[] => version.split(".").map(Number);

/** Whether `a` is a later release than `b`. */
function isLater(a: string, b: string): boolean {
  const [x, y] = [asNumbers(a), asNumbers(b)];
  const at = x.findIndex((part, index) => part !== y[index]);
  return at !== -1 && (x[at] ?? 0) > (y[at] ?? 0);
}

describe("the feature list is current", () => {
  const version = packageVersion();

  it.each(LANGUAGES)("%s names the version being shipped as its as_of", (language) => {
    // Failing here means the release commit bumped package.json and left the feature list behind:
    // add the release's features and move `as_of` (CLAUDE.md, Publishing a release).
    expect(asOfVersion(read("docs", "guide", language, "feature-list.md")), `docs/guide/${language}/feature-list.md`).toBe(version);
  });

  it.each(LANGUAGES)("%s names no release later than the one being shipped", (language) => {
    const later = [...read("docs", "guide", language, "feature-list.md").matchAll(RELEASE_RE)].flatMap(([, named]) =>
      named && isLater(named, version) ? [named] : [],
    );
    expect(later).toEqual([]);
  });
});

describe("asOfVersion", () => {
  it.each([
    ["---\ntitle: x\nas_of: 8.1.0\n---\nbody", "8.1.0"],
    ['---\nas_of: "8.1.0"\n---\n', "8.1.0"],
    ["---\ntitle: x\n---\nas_of: 8.1.0", null],
    ["no front matter", null],
  ])("%j -> %j", (page, version) => {
    expect(asOfVersion(page)).toBe(version);
  });
});

describe("isLater", () => {
  it.each([
    ["8.1.0", "8.0.0", true],
    ["8.0.10", "8.0.9", true],
    ["10.0.0", "9.9.9", true],
    ["8.1.0", "8.1.0", false],
    ["7.9.9", "8.0.0", false],
  ])("%s after %s -> %s", (a, b, later) => {
    expect(isLater(a, b)).toBe(later);
  });
});

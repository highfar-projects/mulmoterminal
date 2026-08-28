// @vitest-environment node
// Every bundled skill's frontmatter has to survive being read as YAML.
//
// It is a `---` block of `key: value` lines, and an unquoted YAML scalar **cannot contain a colon
// followed by a space** — that sequence is the mapping separator. So a description reading
// "...read-only: it lists every action..." is a parse error, not a long sentence, and the skill's
// description is what the harness matches a user's request against.
//
// Nothing caught it. `lint`, `typecheck`, `build` and the entire suite never open a SKILL.md, so a
// broken description ships green. In #1892 an edit to `mulmoterminal-keys` broke it and survived
// FOURTEEN commits of two-reviewer scrutiny; sweeping afterwards found `mulmoterminal-config` and
// `mulmoterminal-dirs` had been broken on main before any of that.
//
// This asserts the ONE rule that broke, not "it parses as YAML": no yaml parser is a declared
// dependency here (`js-yaml` and `yaml` are both transitive only), and adding one to police a
// docs-shaped file would be a lockfile change for a check this narrow. If these files ever grow
// nested structure, swap this for a real parser and declare it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUNDLED_SKILL_NAMES } from "../../../common/bundledSkills.js";

const SKILLS_DIR = join(import.meta.dirname, "..", "..", "..", "server", "skills");

interface Frontmatter {
  lines: string[];
  fields: Map<string, string>;
}

const frontmatterOf = (skill: string): Frontmatter => {
  const text = readFileSync(join(SKILLS_DIR, skill, "SKILL.md"), "utf8");
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match?.[1]) throw new Error(`${skill}/SKILL.md has no --- frontmatter block`);
  const lines = match[1].split("\n").filter((line) => line.trim() !== "");
  const fields = new Map<string, string>();
  lines.forEach((line) => {
    const at = line.indexOf(": ");
    if (at > 0) fields.set(line.slice(0, at), line.slice(at + 2));
  });
  return { lines, fields };
};

/** An unquoted scalar carrying `": "` reads as a nested mapping and fails to parse. A value the
 *  author quoted is free to contain anything. */
const breaksTheScalar = (value: string): boolean => {
  const quoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
  return !quoted && value.includes(": ");
};

describe.each(BUNDLED_SKILL_NAMES)("%s frontmatter", (skill) => {
  it("has no unquoted colon-space in any value", () => {
    const { fields } = frontmatterOf(skill);
    const broken = [...fields].filter(([, value]) => breaksTheScalar(value)).map(([key]) => key);

    expect(broken).toEqual([]);
  });

  // `name` disagreeing with the directory is the same silent class: everything passes and the
  // skill is not found by the slug that ships it.
  it("declares a name matching its directory, and a non-empty description", () => {
    const { fields } = frontmatterOf(skill);

    expect(fields.get("name")).toBe(skill);
    expect((fields.get("description") ?? "").length).toBeGreaterThan(0);
  });

  // Every line has to be a field. A continuation line would be a different YAML shape than the one
  // the check above assumes, and the assumption should fail loudly rather than skip the line.
  it("is one field per line", () => {
    const { lines, fields } = frontmatterOf(skill);

    expect(fields.size).toBe(lines.length);
  });
});

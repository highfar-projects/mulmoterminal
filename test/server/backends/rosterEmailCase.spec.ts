// @vitest-environment node
//
// The roster is keyed by an address the rules compare EXACTLY (`email() in a.members`, and rules
// have no `lower()`). Firebase puts a lower-cased address in the token, so a key with capitals
// grants nothing — and nothing fails: the deploy succeeds, the file reads correctly to a human,
// and the person invited is refused everything with no error naming them.
import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseAuthoredApp } from "@mulmoclaude/core/collection/server";
import { declarationProblems } from "../../../server/backends/sharedApp/context.js";
import { inviteToSharedApp } from "../../../server/backends/sharedApp/declare.js";

const appWith = (members: Record<string, Record<string, string>>) => {
  const parsed = parseAuthoredApp(JSON.stringify({ aid: "a1", members }));
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.app;
};

const owner = { email: "o@e.com", uid: "u1" };

const caseProblems = (members: Record<string, Record<string, string>>, handle: { email: string; uid: string } | null = owner) =>
  declarationProblems(appWith(members), [], handle).filter((problem) => problem.includes("lower case"));

describe("declarationProblems: roster address case", () => {
  it("says so when an invited address the rules will never match is on the roster", () => {
    const problems = caseProblems({ "o@e.com": { "*": "owner" }, "Foo@Example.com": { survey: "participant" } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Foo@Example.com");
    expect(problems[0]).toContain("foo@example.com");
  });

  it("is quiet about a roster written in lower case", () => {
    expect(caseProblems({ "o@e.com": { "*": "owner" }, "foo@example.com": { survey: "participant" } })).toEqual([]);
  });

  // The signed-in address IS what the rules compare against, so a provider that hands over
  // capitals is right and the check would be wrong.
  it("exempts the address this session is signed in with, whatever its case", () => {
    expect(caseProblems({ "Owner@Example.com": { "*": "owner" } }, { email: "Owner@Example.com", uid: "u1" })).toEqual([]);
  });
});

describe("inviteToSharedApp", () => {
  it("writes the address in lower case, so the rules can match it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "roster-case-"));
    await writeFile(path.join(root, "app.json"), JSON.stringify({ aid: "a1", members: { "o@e.com": { "*": "owner" } } }, null, 2));

    const result = await inviteToSharedApp(root, "Foo@Example.com", "participant", "survey");

    expect(result.ok).toBe(true);
    const written = JSON.parse(await readFile(path.join(root, "app.json"), "utf-8")) as { members: Record<string, unknown> };
    expect(Object.keys(written.members)).toEqual(["o@e.com", "foo@example.com"]);
  });
});

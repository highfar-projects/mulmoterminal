// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readCapped, readSkillsShSkill, searchSkillsSh, type FetchText } from "../../../../server/backends/skills/skillsSh";

const answering = (body: unknown): FetchText & { mock: { calls: unknown[][] } } => vi.fn(async () => (typeof body === "string" ? body : JSON.stringify(body)));

const hit = (source: string, skillId: string, installs: number) => ({ id: `${source}/${skillId}`, source, skillId, name: skillId, installs });

describe("searchSkillsSh", () => {
  it("asks skills.sh's search for the query and keeps its order, which is by relevance", async () => {
    const fetchImpl = answering({ skills: [hit("a/b", "close-match", 3), hit("x/y", "popular", 900)], count: 2 });
    const skills = await searchSkillsSh("p d&f", fetchImpl);
    expect(skills).toEqual([
      { source: "a/b", skillId: "close-match", name: "close-match", installs: 3 },
      { source: "x/y", skillId: "popular", name: "popular", installs: 900 },
    ]);
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://skills.sh/api/search");
    expect(url.searchParams.get("q")).toBe("p d&f");
    expect(url.searchParams.get("limit")).toBe("50");
  });

  it("drops a hit whose repository or skill name could not go safely into a URL", async () => {
    const skills = await searchSkillsSh("x", answering({ skills: [hit("a/../b", "x", 1), hit("a/b", "../x", 1), hit("a/b", "ok", 1)] }));
    expect(skills?.map((skill) => skill.skillId)).toEqual(["ok"]);
  });

  it("keeps no more hits than it asked for, whatever skills.sh sends", async () => {
    const many = Array.from({ length: 80 }, (_, index) => hit("a/b", `s${String(index)}`, 1));
    expect(await searchSkillsSh("x", answering({ skills: many }))).toHaveLength(50);
  });

  it("strips control characters from a name", async () => {
    const skills = await searchSkillsSh("x", answering({ skills: [{ ...hit("a/b", "ok", 1), name: "ok\u0007\u001b[31m" }] }));
    expect(skills?.[0]?.name).toBe("ok[31m");
  });

  it.each([
    ["a non-2xx answer", null],
    ["text that is not JSON", "<html>"],
    ["JSON of another shape", { results: [] }],
    ["a hit missing a field", { skills: [{ source: "a/b", skillId: "x", name: "x" }] }],
  ])("is null for %s", async (_label, body) => {
    const fetchImpl: FetchText = body === null ? async () => null : answering(body);
    expect(await searchSkillsSh("x", fetchImpl)).toBeNull();
  });

  it("is null when the fetch throws (a timeout, a refused connection)", async () => {
    expect(
      await searchSkillsSh("x", async () => {
        throw new Error("aborted");
      }),
    ).toBeNull();
  });

  it("does not parse an answer past the size bound", async () => {
    expect(await searchSkillsSh("x", answering(`{"skills":[]}${" ".repeat(9 * 1024 * 1024)}`))).toBeNull();
  });
});

describe("readSkillsShSkill", () => {
  const snapshot = {
    hash: "h",
    files: [
      { path: "scripts/run.py", contents: "print(1)" },
      { path: "SKILL.md", contents: "---\nname: pdf\n---\nRead PDFs." },
      { path: "reference.md", contents: "ref" },
    ],
  };

  it("asks for the snapshot of that skill and returns its SKILL.md and every file, by path", async () => {
    const fetchImpl = answering(snapshot);
    const doc = await readSkillsShSkill("anthropics/skills", "pdf", fetchImpl);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://skills.sh/api/download/anthropics/skills/pdf");
    expect(doc).toEqual({
      markdown: "---\nname: pdf\n---\nRead PDFs.",
      files: [
        { path: "reference.md", bytes: 3 },
        { path: "scripts/run.py", bytes: 8 },
        { path: "SKILL.md", bytes: 28 },
      ],
    });
  });

  it("does not ask for a name that is not safe in a URL", async () => {
    const fetchImpl = answering(snapshot);
    expect(await readSkillsShSkill("a/..", "pdf", fetchImpl)).toBeNull();
    expect(await readSkillsShSkill("a/b", "../pdf", fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("is null when the snapshot has no SKILL.md at its top", async () => {
    expect(await readSkillsShSkill("a/b", "x", answering({ files: [{ path: "sub/SKILL.md", contents: "x" }] }))).toBeNull();
  });

  it("is null when the SKILL.md is past the size bound", async () => {
    expect(await readSkillsShSkill("a/b", "x", answering({ files: [{ path: "SKILL.md", contents: "x".repeat(1024 * 1024 + 1) }] }))).toBeNull();
  });

  it("is null for a snapshot with more files than a skill has", async () => {
    const files = [{ path: "SKILL.md", contents: "x" }, ...Array.from({ length: 500 }, (_, index) => ({ path: `f${String(index)}.md`, contents: "" }))];
    expect(await readSkillsShSkill("a/b", "x", answering({ files }))).toBeNull();
    expect(await readSkillsShSkill("a/b", "x", answering({ files: files.slice(0, 500) }))).not.toBeNull();
  });

  it("is null when skills.sh has no such skill", async () => {
    expect(await readSkillsShSkill("a/b", "x", async () => null)).toBeNull();
  });
});

// The cap is on what is READ, not on what was read: an oversized answer is dropped while it arrives.
describe("readCapped", () => {
  function streamed(chunks: readonly string[], init: ResponseInit = {}) {
    const encoder = new TextEncoder();
    const state = { pulls: 0, cancelled: false };
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[state.pulls];
        state.pulls += 1;
        if (chunk === undefined) controller.close();
        else controller.enqueue(encoder.encode(chunk));
      },
      cancel() {
        state.cancelled = true;
      },
    });
    return { response: new Response(body, init), state };
  }

  it("returns a body within the bound, a character split across chunks included", async () => {
    const bytes = new TextEncoder().encode("あい");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2));
        controller.enqueue(bytes.slice(2));
        controller.close();
      },
    });
    expect(await readCapped(new Response(body), 10)).toBe("あい");
  });

  it("stops reading, and cancels, the moment the bound is passed", async () => {
    const { response, state } = streamed(["12345", "67890", "abcde", "fghij", "klmno"]);
    expect(await readCapped(response, 8)).toBeNull();
    expect(state.cancelled).toBe(true);
    expect(state.pulls).toBeLessThan(4);
  });

  it("refuses from the declared length without reading", async () => {
    const { response, state } = streamed(["x"], { headers: { "content-length": "999" } });
    expect(await readCapped(response, 8)).toBeNull();
    expect(state.pulls).toBeLessThanOrEqual(1);
    expect(state.cancelled).toBe(true);
  });

  it("is null for a status that is not 2xx", async () => {
    expect(await readCapped(new Response("{}", { status: 404 }), 8)).toBeNull();
  });

  it("reads a body of exactly the bound", async () => {
    expect(await readCapped(new Response("12345678"), 8)).toBe("12345678");
  });
});

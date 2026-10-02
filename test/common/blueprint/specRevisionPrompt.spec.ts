// The prompt for a session that revises what a person reads at a review gate: an app build's spec, or a document
// build's files.
import { describe, it, expect } from "vitest";
import { specRevisionPrompt } from "../../../common/blueprint/specRevisionPrompt";

const base = { chat: [], message: "集合は 9 時です", packDirs: { base: "/packs/docs", usecase: "/packs/write" }, replyPath: ".blueprint/reply-s2.md" };

describe("specRevisionPrompt", () => {
  it("revises the files a document gate names, moves an answer out of the open questions, and keeps their format", () => {
    const prompt = specRevisionPrompt({ ...base, reads: [".blueprint/brief.md", "STYLE.md"] });
    expect(prompt).toContain("The person has just read: .blueprint/brief.md, STYLE.md.");
    expect(prompt).toContain("1. Change .blueprint/brief.md, STYLE.md — the files the next step reads — to reflect it.");
    expect(prompt).toContain("remove the question");
    expect(prompt).toContain("so the step that wrote it still accepts it");
    expect(prompt).not.toContain("is a view");
    expect(prompt).toContain("Do not touch the documents themselves");
    expect(prompt).toContain(".blueprint/reply-s2.md");
    expect(prompt).not.toContain(".blueprint/spec.md");
  });

  it("changes the records behind views, and tells the session to leave the views alone", () => {
    const prompt = specRevisionPrompt({ ...base, reads: [".blueprint/polish.txt", "STYLE.md"], revises: [".blueprint/polish.json", "STYLE.md"] });
    expect(prompt).toContain("1. Change .blueprint/polish.json, STYLE.md — the files the next step reads");
    expect(prompt).toContain(".blueprint/polish.txt is a view drawn from those files: do not edit it.");
    const two = specRevisionPrompt({ ...base, reads: [".blueprint/a.txt", ".blueprint/b.txt"], revises: [".blueprint/a.json"] });
    expect(two).toContain(".blueprint/a.txt, .blueprint/b.txt are views drawn from those files: do not edit them.");
  });

  it("revises the spec when the gate names nothing to read", () => {
    [specRevisionPrompt(base), specRevisionPrompt({ ...base, reads: [] })].forEach((prompt) => {
      expect(prompt).toContain("The spec is .blueprint/spec.md");
      expect(prompt).not.toContain("The person has just read");
    });
  });

  it("tells a document session the person's language and the conversation so far", () => {
    const prompt = specRevisionPrompt({
      ...base,
      reads: [".blueprint/brief.md"],
      language: "en",
      chat: [{ role: "person", text: "先の話", atMs: 1 }],
    });
    expect(prompt).toContain("The user reads English.");
    expect(prompt).toContain("User: 先の話");
  });
});

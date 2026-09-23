// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  ROW_PROMPT_MAX_CHARS,
  ROW_TITLE_MAX_CHARS,
  diskTitle,
  locationTitle,
  oneLine,
  rowPrompt,
  type DiskTitleTiers,
} from "../../../../server/backends/remoteHost/phoneRowText.js";

const NO_TIERS: DiskTitleTiers = {
  cleared: false,
  livePrompt: undefined,
  diskAiTitle: null,
  agentTitle: null,
  diskLastPrompt: null,
  firstUserMsg: null,
};

describe("oneLine", () => {
  it("collapses newlines, tabs and runs of spaces", () => {
    expect(oneLine("  fix\n\tthe   parser \r\n", 50)).toBe("fix the parser");
  });

  it("turns control characters into spaces", () => {
    expect(oneLine(`a${String.fromCharCode(0x1b)}[31mb`, 50)).toBe("a [31mb");
  });

  it("answers empty for null, undefined, empty and whitespace-only input", () => {
    [null, undefined, "", "   ", "\n\t"].forEach((text) => expect(oneLine(text, 50)).toBe(""));
  });

  it("keeps text at exactly the limit whole", () => {
    expect(oneLine("abcde", 5)).toBe("abcde");
  });

  it("caps longer text at the limit, mark included", () => {
    const capped = oneLine("abcdef", 5);
    expect(capped).toBe("abcd…");
    expect([...capped]).toHaveLength(5);
  });

  // By code point, so a limit means the same for Japanese and no surrogate pair is split.
  it("counts code points rather than UTF-16 units", () => {
    expect(oneLine("日本語のタイトル", 4)).toBe("日本語…");
    const astral = "𠮷".repeat(10);
    const capped = oneLine(astral, 4);
    expect([...capped]).toEqual(["𠮷", "𠮷", "𠮷", "…"]);
  });
});

describe("diskTitle", () => {
  it("answers empty when there is nothing", () => {
    expect(diskTitle(NO_TIERS)).toBe("");
  });

  it("puts generated titles before any prompt", () => {
    const tiers = { ...NO_TIERS, diskAiTitle: "Fix copy mode", livePrompt: "ok", diskLastPrompt: "please", firstUserMsg: "hello" };
    expect(diskTitle(tiers)).toBe("Fix copy mode");
    expect(diskTitle({ ...tiers, diskAiTitle: null, agentTitle: "Codex summary" })).toBe("Codex summary");
  });

  it("falls through the prompts in order: live, on-disk last, first message", () => {
    const tiers = { ...NO_TIERS, livePrompt: "live", diskLastPrompt: "last", firstUserMsg: "first" };
    expect(diskTitle(tiers)).toBe("live");
    expect(diskTitle({ ...tiers, livePrompt: undefined })).toBe("last");
    expect(diskTitle({ ...tiers, livePrompt: undefined, diskLastPrompt: null })).toBe("first");
  });

  // An empty or whitespace-only tier means "keep looking", never "show blank".
  it("skips empty and whitespace-only tiers", () => {
    expect(diskTitle({ ...NO_TIERS, diskAiTitle: "  \n", livePrompt: "", firstUserMsg: "first" })).toBe("first");
  });

  // #1085: the transcript of a cleared session is the conversation the user ended.
  it("reads nothing off disk for a cleared session", () => {
    const tiers = { ...NO_TIERS, cleared: true, diskAiTitle: "old", agentTitle: "old", diskLastPrompt: "old", firstUserMsg: "old" };
    expect(diskTitle(tiers)).toBe("");
    expect(diskTitle({ ...tiers, livePrompt: "the new task" })).toBe("the new task");
  });

  it("flattens a pasted multi-line prompt and caps it", () => {
    const title = diskTitle({ ...NO_TIERS, livePrompt: `line one\nline two\n${"x".repeat(500)}` });
    expect(title.startsWith("line one line two x")).toBe(true);
    expect([...title]).toHaveLength(ROW_TITLE_MAX_CHARS);
  });
});

describe("locationTitle", () => {
  it("names the project directory and the agent", () => {
    expect(locationTitle("/Users/me/ss/llm/mulmoterminal", "codex")).toBe("mulmoterminal · codex");
  });

  it("ignores a trailing separator", () => {
    expect(locationTitle("/work/repo/", "claude")).toBe("repo · claude");
  });

  it("drops whichever half is unknown", () => {
    expect(locationTitle("/work/repo", null)).toBe("repo");
    expect(locationTitle("", "claude")).toBe("claude");
    expect(locationTitle("", null)).toBe("");
  });

  it("answers empty for the filesystem root with no agent", () => {
    expect(locationTitle("/", null)).toBe("");
  });
});

describe("rowPrompt", () => {
  it("answers the prompt as one line", () => {
    expect(rowPrompt("run\nthe tests", "Fix parser")).toBe("run the tests");
  });

  it("answers empty when there is no prompt", () => {
    [null, undefined, "", "  "].forEach((prompt) => expect(rowPrompt(prompt, "Fix parser")).toBe(""));
  });

  it("answers empty when the prompt only repeats the title", () => {
    expect(rowPrompt("issueを出して", "issueを出して")).toBe("");
    expect(rowPrompt(" issueを出して\n", "issueを出して")).toBe("");
  });

  // A title that is a capped copy of a long prompt still says the same thing.
  it("answers empty when the title is the same long prompt, capped", () => {
    const prompt = "y".repeat(ROW_PROMPT_MAX_CHARS * 2);
    expect(rowPrompt(prompt, diskTitle({ ...NO_TIERS, livePrompt: prompt }))).toBe("");
  });

  // Only a CAPPED title counts as a prefix: a short title that happens to open the prompt is not it.
  it("keeps a prompt that merely starts with an uncapped title", () => {
    expect(rowPrompt("Fix the parser and the lexer", "Fix the parser")).toBe("Fix the parser and the lexer");
  });

  it("keeps a prompt that differs from a capped title", () => {
    const title = diskTitle({ ...NO_TIERS, diskAiTitle: "a".repeat(ROW_TITLE_MAX_CHARS * 2) });
    expect(rowPrompt("something else", title)).toBe("something else");
  });

  it("caps a long prompt", () => {
    expect([...rowPrompt("z".repeat(1000), "t")]).toHaveLength(ROW_PROMPT_MAX_CHARS);
  });
});

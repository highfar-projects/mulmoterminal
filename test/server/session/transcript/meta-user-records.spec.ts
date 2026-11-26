// @vitest-environment node
//
// Fork-only: a user-channel record the harness marks `isMeta` — the body of a skill the agent invoked
// mid-turn, the description of a pasted image — is not a prompt. Read as one, a skill call split the
// agent's turn in two, and the reply of the turn that asked came back empty to an external ask
// (plans/feat-external-ask.md). The records below are the shapes Claude Code writes.
import { describe, it, expect } from "vitest";
import { currentTurnReplyFromClaudeParsed, lastTurnFromClaudeParsed } from "../../../../server/session/transcript/last-turn.js";
import {
  conversationTurnsFromParsed,
  currentTurnToolNamesFromParsed,
  latestUserPromptFromParsed,
  userRecordPrompt,
} from "../../../../server/session/transcript/transcript.js";
import { emptyTranscriptScan, foldTranscriptView, isTurnBoundary, transcriptViewOf } from "../../../../server/session/transcript/transcript-view.js";
import { transcriptPrompts } from "../../../../server/session/transcript/prompt-history.js";

const ASK = "Ask the hfgrid clone for its branch. [edgar 0123456789ab]";
const REPLY = "hfgrid is on main.";
const SKILL_BODY = "Base directory for this skill: D:\\skills\\clone-ask\n\n# clone-ask\n\nSteps...";

const prompt = (text: string, at = "2026-11-26T06:45:48.000Z") => ({ type: "user", timestamp: at, message: { role: "user", content: text } });
const toolUse = (name: string, input: Record<string, unknown> = {}) => ({
  type: "assistant",
  timestamp: "2026-11-26T06:45:49.000Z",
  message: { role: "assistant", stop_reason: "tool_use", content: [{ type: "tool_use", id: `toolu_${name}`, name, input }] },
});
const toolResult = (name: string, text: string) => ({
  type: "user",
  timestamp: "2026-11-26T06:45:50.000Z",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: `toolu_${name}`, content: text }] },
});
// What a Skill call writes after its tool result: the skill's body, as user text, marked isMeta.
const skillBody = () => ({
  type: "user",
  isMeta: true,
  sourceToolUseID: "toolu_Skill",
  timestamp: "2026-11-26T06:45:50.100Z",
  message: { role: "user", content: [{ type: "text", text: SKILL_BODY }] },
});
const imageNote = () => ({
  type: "user",
  isMeta: true,
  timestamp: "2026-11-26T06:45:48.100Z",
  message: { role: "user", content: [{ type: "text", text: "[Image: source: C:\\shot.png]" }] },
});
const concluding = (text: string) => ({
  type: "assistant",
  timestamp: "2026-11-26T06:46:10.000Z",
  message: { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text }] },
});

// The turn as session A wrote it in the case that was found: ask, Skill call, skill body, a Bash
// call, the answer.
const turnWithSkill = () => [
  prompt(ASK),
  toolUse("Skill", { skill: "clone-ask" }),
  toolResult("Skill", "Launching skill: clone-ask"),
  skillBody(),
  toolUse("Bash", { command: "node ask.mjs --list" }),
  toolResult("Bash", "sessions"),
  concluding(REPLY),
];

describe("userRecordPrompt", () => {
  it("is null for a record the harness marked isMeta", () => {
    expect(userRecordPrompt(skillBody())).toBeNull();
    expect(userRecordPrompt(imageNote())).toBeNull();
  });

  it("still reads an ordinary prompt", () => {
    expect(userRecordPrompt(prompt(ASK))).toBe(ASK);
    expect(userRecordPrompt({ ...prompt(ASK), isMeta: false })).toBe(ASK);
  });
});

describe("a skill called mid-turn does not start a new turn", () => {
  it("leaves the last turn's prompt the one that asked, and its reply the answer", () => {
    expect(lastTurnFromClaudeParsed(turnWithSkill())).toEqual({ prompt: ASK, reply: REPLY });
    expect(currentTurnReplyFromClaudeParsed(turnWithSkill())).toBe(REPLY);
  });

  it("is one user turn in the conversation", () => {
    expect(conversationTurnsFromParsed(turnWithSkill()).filter((t) => t.role === "user")).toEqual([{ role: "user", text: ASK }]);
  });

  it("is one turn in the conversation view, opened by the ask and without the skill's body", () => {
    const scan = emptyTranscriptScan();
    turnWithSkill().forEach((record) => foldTranscriptView(scan, record));
    const view = transcriptViewOf(scan, false);
    if (view.status !== "ok") throw new Error("expected an ok view");
    expect(view.turns).toHaveLength(1);
    const rows = view.turns[0].rows;
    expect(rows[0]).toMatchObject({ kind: "user", text: ASK });
    expect(rows.some((row) => row.text.includes("Base directory for this skill"))).toBe(false);
    expect(rows.filter((row) => row.kind === "assistant").at(-1)?.text).toBe(REPLY);
    expect(isTurnBoundary(skillBody())).toBe(false);
  });

  it("keeps the tools the turn ran before the skill", () => {
    expect(currentTurnToolNamesFromParsed(turnWithSkill())).toEqual(["Skill", "Bash"]);
  });

  it("is not the latest prompt, nor one in the prompt history", () => {
    expect(latestUserPromptFromParsed(turnWithSkill())).toBe(ASK);
    expect(transcriptPrompts(turnWithSkill()).map((p) => p.text)).toEqual([ASK]);
  });
});

describe("an image's description after the prompt", () => {
  it("does not take the prompt's place", () => {
    const records = [prompt(ASK), imageNote(), concluding(REPLY)];
    expect(lastTurnFromClaudeParsed(records)).toEqual({ prompt: ASK, reply: REPLY });
    expect(latestUserPromptFromParsed(records)).toBe(ASK);
  });
});

describe("a real prompt after the turn", () => {
  it("still opens the next turn", () => {
    const records = [...turnWithSkill(), prompt("next", "2026-11-26T07:00:00.000Z"), concluding("done")];
    expect(lastTurnFromClaudeParsed(records)).toEqual({ prompt: "next", reply: "done" });
  });
});

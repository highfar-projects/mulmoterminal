// @vitest-environment node
// What a local program may ask of a session (plans/feat-external-ask.md): the settings it reads, the
// directories it may reach, the token, and — the part that decides what the caller is told — which
// finished turn is the answer to a tagged send.
import { describe, it, expect } from "vitest";
import {
  answerFor,
  dirAllowed,
  externalAskTag,
  parseAskRequest,
  parseExternalAskSettings,
  promptCarries,
  sameDir,
  tokenMatches,
  waitMsOf,
  DEFAULT_LABEL,
  MAX_WAIT_SECONDS,
} from "../../../server/routes/externalAsk.js";
import { SEND_MAX_CHARS } from "../../../server/routes/sessionAsk.js";
import { readExternalAnswer, type ExternalAskReadDeps } from "../../../server/session/transcript/external-ask-read.js";
import type { RelayTurn } from "../../../server/session/transcript/relay-range.js";
import type { TranscriptPage } from "../../../common/transcriptView.js";

const ASK = "0123456789ab";

describe("parseExternalAskSettings", () => {
  it("is off for anything that does not say enabled: true", () => {
    expect(parseExternalAskSettings(null).enabled).toBe(false);
    expect(parseExternalAskSettings({ enabled: "true" }).enabled).toBe(false);
    expect(parseExternalAskSettings({ enabled: true }).enabled).toBe(true);
  });

  it("keeps only absolute directories, and a label of the safe shape", () => {
    const settings = parseExternalAskSettings({ enabled: true, allowDirs: ["/srv/a", "relative", 3, " /srv/b "], label: "edgar" });
    expect(settings.allowDirs).toEqual(["/srv/a", "/srv/b"]);
    expect(settings.label).toBe("edgar");
    expect(parseExternalAskSettings({ label: "Edgar]" }).label).toBe(DEFAULT_LABEL);
  });
});

describe("dirAllowed", () => {
  it("allows the directory and what is inside it, not a sibling that shares its prefix", () => {
    expect(dirAllowed("/srv/clone", ["/srv/clone"], "linux")).toBe(true);
    expect(dirAllowed("/srv/clone/sub", ["/srv/clone/"], "linux")).toBe(true);
    expect(dirAllowed("/srv/clone-2", ["/srv/clone"], "linux")).toBe(false);
    expect(dirAllowed("", ["/srv/clone"], "linux")).toBe(false);
  });

  it("ignores case and slash direction on Windows", () => {
    expect(dirAllowed("D:\\Work\\Clone", ["d:/work/clone"], "win32")).toBe(true);
    expect(sameDir("D:\\Work\\Clone\\", "d:/work/clone", "win32")).toBe(true);
    expect(sameDir("/srv/Clone", "/srv/clone", "linux")).toBe(false);
  });
});

describe("tokenMatches", () => {
  it("accepts exactly the bearer token", () => {
    expect(tokenMatches("Bearer abc123", "abc123")).toBe(true);
    expect(tokenMatches("bearer abc123", "abc123")).toBe(true);
    expect(tokenMatches("Bearer abc124", "abc123")).toBe(false);
    expect(tokenMatches("Bearer abc", "abc123")).toBe(false);
    expect(tokenMatches("abc123", "abc123")).toBe(false);
    expect(tokenMatches(undefined, "abc123")).toBe(false);
    expect(tokenMatches("Bearer ", "")).toBe(false);
  });
});

describe("parseAskRequest", () => {
  it("flattens the text the way the sender will, and needs an absolute expectCwd", () => {
    expect(parseAskRequest({ text: "line one\nline two", expectCwd: "/srv/clone" })).toEqual({ ok: true, text: "line one line two", expectCwd: "/srv/clone" });
    expect(parseAskRequest({ text: "hi", expectCwd: "clone" })).toMatchObject({ ok: false, code: "invalid-request" });
    expect(parseAskRequest({ text: " \n ", expectCwd: "/srv/clone" })).toMatchObject({ ok: false, code: "invalid-request" });
  });

  it("refuses text that would not fit with its tag", () => {
    expect(parseAskRequest({ text: "x".repeat(SEND_MAX_CHARS + 1), expectCwd: "/srv/clone" })).toMatchObject({ ok: false, code: "text-too-long" });
    expect(parseAskRequest({ text: "x".repeat(SEND_MAX_CHARS), expectCwd: "/srv/clone" }).ok).toBe(true);
  });
});

describe("waitMsOf", () => {
  it("defaults, clamps, and lets 0 mean answer now", () => {
    expect(waitMsOf(undefined)).toBe(30_000);
    expect(waitMsOf("abc")).toBe(30_000);
    expect(waitMsOf("0")).toBe(0);
    expect(waitMsOf("5")).toBe(5000);
    expect(waitMsOf("99999")).toBe(MAX_WAIT_SECONDS * 1000);
    expect(waitMsOf("-3")).toBe(0);
  });
});

const tagged = (text: string): string => `${text}${externalAskTag("edgar", ASK)}`;
const turn = (prompt: string, ...replies: string[]): RelayTurn => ({ prompt, promptClipped: false, replies, at: null });

describe("answerFor", () => {
  it("finds the tag whatever label sent it", () => {
    expect(promptCarries(tagged("estimate this"), ASK)).toBe(true);
    expect(promptCarries(`x${externalAskTag("other", ASK)}`, ASK)).toBe(true);
    expect(promptCarries(`x${externalAskTag("edgar", "ffffffffffff")}`, ASK)).toBe(false);
    expect(promptCarries(null, ASK)).toBe(false);
  });

  it("answers from the last completed turn when that is ours", () => {
    expect(answerFor(ASK, { prompt: tagged("estimate"), reply: "3 days" }, [])).toEqual({ status: "answered", reply: "3 days" });
  });

  it("finds our turn behind one the user started since, once it has finished", () => {
    const turns = [turn(tagged("estimate"), "looking", "3 days"), turn("and the tests?", "they pass")];
    expect(answerFor(ASK, { prompt: "and the tests?", reply: "they pass" }, turns)).toEqual({ status: "answered", reply: "3 days" });
  });

  it("is pending while our turn is the one still running", () => {
    const turns = [turn("earlier", "done"), turn(tagged("estimate"), "reading files")];
    expect(answerFor(ASK, { prompt: "earlier", reply: "done" }, turns)).toEqual({ status: "pending", seen: true });
  });

  it("is pending, unseen, before the prompt reaches the log", () => {
    expect(answerFor(ASK, { prompt: "earlier", reply: "done" }, [turn("earlier", "done")])).toEqual({ status: "pending", seen: false });
  });
});

describe("readExternalAnswer", () => {
  const page = (turns: { prompt: string; replies: string[] }[], older: string | null): TranscriptPage => ({
    view: {
      status: "ok",
      truncated: false,
      turns: turns.map((t) => ({
        at: null,
        rows: [{ kind: "user" as const, text: t.prompt }, ...t.replies.map((text) => ({ kind: "assistant" as const, text }))],
      })),
    },
    older,
  });

  const deps = (
    pages: TranscriptPage[],
    last: { prompt: string | null; reply: string | null },
    transcriptId: string | null = "t1",
  ): ExternalAskReadDeps & { reads: number } => {
    const state = { reads: 0 };
    return {
      get reads() {
        return state.reads;
      },
      transcriptIdOf: () => transcriptId,
      cwdOf: async () => "/srv/clone",
      lastTurn: async () => last,
      readPage: async () => pages[state.reads++] ?? page([], null),
    };
  };

  it("reads no page when the last turn is ours", async () => {
    const d = deps([], { prompt: tagged("estimate"), reply: "3 days" });
    expect(await readExternalAnswer(d, "s", ASK, "claude")).toEqual({ status: "answered", reply: "3 days" });
    expect(d.reads).toBe(0);
  });

  it("walks back page by page until the tag is found", async () => {
    const d = deps([page([{ prompt: "later", replies: ["ok"] }], "c1"), page([{ prompt: tagged("estimate"), replies: ["3 days"] }], "c2")], {
      prompt: "later",
      reply: "ok",
    });
    expect(await readExternalAnswer(d, "s", ASK, "claude")).toEqual({ status: "answered", reply: "3 days" });
    expect(d.reads).toBe(2);
  });

  it("says cleared when the session's conversation is gone", async () => {
    expect(await readExternalAnswer(deps([], { prompt: null, reply: null }, null), "s", ASK, "claude")).toEqual({ status: "cleared" });
  });
});

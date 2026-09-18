// @vitest-environment node
//
// What an agent's OWN store calls a session, for the cockpit roster's `summary` line (#2123).
//
// Three readers over three completely different stores, and the properties worth pinning are the
// ones that are NOT obvious from a reader working: that a miss is never remembered (a cell whose
// agent has not written its first turn must not stay blank until the process restarts), that
// copilot's machine-wide store is scoped by cwd, and that the cache is bounded and keyed so two
// stores cannot answer for each other.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { agentSessionTitle, clearAgentTitleCache, TITLE_CACHE_MAX, titleCacheSize } from "../../../server/agents/agent-session-title.js";

const CODEX_ID = "01a0b1ce-52ce-7ee3-96b3-6ae19313a77b";
const OTHER_CODEX_ID = "01a0b1ce-52ce-7ee3-96b3-6ae19313a99f";
const CURSOR_ID = "chat-abc";
const COPILOT_ID = "1293238c-ae59-4592-8665-2088ee30032d";
const HERE = "/work/project";
const ELSEWHERE = "/work/other";

let home = "";
const line = (r: unknown) => `${JSON.stringify(r)}\n`;

const codexRoot = () => path.join(home, ".codex", "sessions");

async function writeRollout(prompt: unknown, id = CODEX_ID, day = "18"): Promise<void> {
  const dir = path.join(codexRoot(), "2026", "09", day);
  await fs.mkdir(dir, { recursive: true });
  const body =
    line({ type: "session_meta", payload: { id, cwd: HERE } }) +
    // codex writes its own wrapper blocks into a turn before the person's first word; the reader
    // must skip them, which is the rule codex-user-turn.ts owns.
    line({
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>cwd=/x</environment_context>" }] },
    }) +
    (prompt === null ? "" : line({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: prompt }] } }));
  await fs.writeFile(path.join(dir, `rollout-2026-09-${day}T08-58-04-${id}.jsonl`), body);
}

/** A cursor project directory as cursor really lays one out: a slug that cannot be derived from the
 *  path, the workspace it stands for in `.workspace-trusted`, and the chat under its own id twice. */
async function writeCursorTranscript(text: string, cwd = HERE): Promise<void> {
  const dir = path.join(home, ".cursor", "projects", "slug-one");
  await fs.mkdir(path.join(dir, "agent-transcripts", CURSOR_ID), { recursive: true });
  await fs.writeFile(path.join(dir, ".workspace-trusted"), JSON.stringify({ trustedAt: "2026-09-18T00:00:00Z", workspacePath: cwd }));
  await fs.writeFile(
    path.join(dir, "agent-transcripts", CURSOR_ID, `${CURSOR_ID}.jsonl`),
    line({ role: "user", message: { content: [{ type: "text", text: `<timestamp>t</timestamp><user_query>${text}</user_query>` }] } }),
  );
}

function withCopilotDb(fn: (db: DatabaseSync) => void): void {
  const db = new DatabaseSync(path.join(home, ".copilot", "session-store.db"));
  try {
    fn(db);
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  clearAgentTitleCache();
  home = mkdtempSync(path.join(tmpdir(), "mt-agent-title-"));
  await fs.mkdir(path.join(home, ".copilot"), { recursive: true });
});

afterEach(() => {
  clearAgentTitleCache();
  rmSync(home, { recursive: true, force: true });
});

describe("codex", () => {
  it("answers the first thing the PERSON said, skipping codex's own wrapper block", async () => {
    await writeRollout("rewrite the parser");
    expect(await agentSessionTitle(HERE, CODEX_ID, "codex", { codexSessions: codexRoot() })).toBe("rewrite the parser");
  });

  it("collapses whitespace so the row is one line", async () => {
    await writeRollout("rewrite\n  the   parser");
    expect(await agentSessionTitle(HERE, CODEX_ID, "codex", { codexSessions: codexRoot() })).toBe("rewrite the parser");
  });

  it("says nothing for a rollout whose only user record is codex's own wrapper", async () => {
    await writeRollout(null);
    expect(await agentSessionTitle(HERE, CODEX_ID, "codex", { codexSessions: codexRoot() })).toBeNull();
  });

  it("says nothing when there is no rollout for the id", async () => {
    expect(await agentSessionTitle(HERE, CODEX_ID, "codex", { codexSessions: codexRoot() })).toBeNull();
  });

  // The failure `rolloutMeta` records twice in codex-sessions.ts: a cell that has just started has
  // no rollout yet, and remembering "no title" would leave its row blank until a restart.
  it("never remembers a miss, so a session titled later is picked up", async () => {
    expect(await agentSessionTitle(HERE, CODEX_ID, "codex", { codexSessions: codexRoot() })).toBeNull();
    expect(titleCacheSize()).toBe(0);
    await writeRollout("rewrite the parser");
    expect(await agentSessionTitle(HERE, CODEX_ID, "codex", { codexSessions: codexRoot() })).toBe("rewrite the parser");
    expect(titleCacheSize()).toBe(1);
  });

  // The answer is written once and cannot change, so a second ask must not re-read the store. A
  // rescan would find the NEWER day first, so the remembered value is the only way to get the old.
  it("answers from memory rather than reading the store again", async () => {
    await writeRollout("the first one", CODEX_ID, "10");
    expect(await agentSessionTitle(HERE, CODEX_ID, "codex", { codexSessions: codexRoot() })).toBe("the first one");
    await writeRollout("a newer file for the same id", CODEX_ID, "20");
    expect(await agentSessionTitle(HERE, CODEX_ID, "codex", { codexSessions: codexRoot() })).toBe("the first one");
  });

  it("keys on the store, so two roots cannot answer for each other", async () => {
    await writeRollout("rewrite the parser");
    expect(await agentSessionTitle(HERE, CODEX_ID, "codex", { codexSessions: codexRoot() })).toBe("rewrite the parser");
    const other = mkdtempSync(path.join(tmpdir(), "mt-agent-title-other-"));
    try {
      expect(await agentSessionTitle(HERE, CODEX_ID, "codex", { codexSessions: other })).toBeNull();
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  // The eviction is proved in bounded-cache.spec.ts, where it costs nothing. What is worth an
  // assertion HERE is the wiring: that this reader remembers through the bounded helper at all,
  // and under the cap it declares. Driving 512 real rollouts to watch one eviction took 45 s and
  // would have made this the file that goes red first on a loaded runner (#1314).
  it("remembers through the bound it declares", async () => {
    expect(TITLE_CACHE_MAX).toBe(512);
    await writeRollout("rewrite the parser");
    await writeRollout("fix the lexer", OTHER_CODEX_ID);
    expect(await agentSessionTitle(HERE, CODEX_ID, "codex", { codexSessions: codexRoot() })).toBe("rewrite the parser");
    expect(await agentSessionTitle(HERE, OTHER_CODEX_ID, "codex", { codexSessions: codexRoot() })).toBe("fix the lexer");
    expect(titleCacheSize()).toBe(2);
  });
});

describe("cursor", () => {
  it("answers the first user message, unwrapped from cursor's own tags", async () => {
    await writeCursorTranscript("fix the failing spec");
    expect(await agentSessionTitle(HERE, CURSOR_ID, "cursor", { cursorHome: path.join(home, ".cursor") })).toBe("fix the failing spec");
  });

  it("says nothing for a project that is not this cell's directory", async () => {
    await writeCursorTranscript("fix the failing spec", ELSEWHERE);
    expect(await agentSessionTitle(HERE, CURSOR_ID, "cursor", { cursorHome: path.join(home, ".cursor") })).toBeNull();
  });
});

describe("antigravity", () => {
  const AGY_ID = "conv-7f3a";
  const agyHome = () => path.join(home, ".antigravity");

  /** agy's own layout: the transcript is a plain join under the brain root, and the prompt arrives
   *  wrapped in <USER_REQUEST> with agy's own blocks appended after it. */
  async function writeAgyTranscript(prompt: string | null, id = AGY_ID): Promise<void> {
    const dir = path.join(agyHome(), "brain", id, ".system_generated", "logs");
    await fs.mkdir(dir, { recursive: true });
    const content = `<USER_REQUEST>\n${prompt}\n</USER_REQUEST>\n<ADDITIONAL_METADATA>local time is 9am</ADDITIONAL_METADATA><USER_SETTINGS_CHANGE>The user changed setting Model Selection.</USER_SETTINGS_CHANGE>`;
    await fs.writeFile(
      path.join(dir, "transcript.jsonl"),
      // Step 0 is agy's own history block, which carries no content at all — the reader has to walk
      // past it rather than take the first record.
      line({ type: "CONVERSATION_HISTORY" }) + (prompt === null ? "" : line({ type: "USER_INPUT", content })),
    );
  }

  it("answers the first prompt, unwrapped and with agy's appended blocks stripped", async () => {
    await writeAgyTranscript("rewrite the parser");
    expect(await agentSessionTitle(HERE, AGY_ID, "antigravity", { antigravityHome: agyHome() })).toBe("rewrite the parser");
  });

  // Its listing answers "Antigravity session" when there is no prompt. A roster row wants nothing
  // rather than words that say less than the blank line they would replace.
  it("says nothing rather than agy's placeholder title", async () => {
    await writeAgyTranscript(null);
    const title = await agentSessionTitle(HERE, AGY_ID, "antigravity", { antigravityHome: agyHome() });
    expect(title).toBeNull();
    expect(title).not.toBe("Antigravity session");
  });

  it("says nothing when agy has written no transcript for the id", async () => {
    expect(await agentSessionTitle(HERE, AGY_ID, "antigravity", { antigravityHome: agyHome() })).toBeNull();
  });
});

describe("copilot", () => {
  beforeEach(() => {
    withCopilotDb((db) => {
      db.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, cwd TEXT, summary TEXT)");
      db.prepare("INSERT INTO sessions (id, cwd, summary) VALUES (?, ?, ?)").run(COPILOT_ID, HERE, "Refactoring the parser");
    });
    process.env.COPILOT_HOME = path.join(home, ".copilot");
  });
  afterEach(() => delete process.env.COPILOT_HOME);

  it("answers copilot's own summary", async () => {
    expect(await agentSessionTitle(HERE, COPILOT_ID, "copilot")).toBe("Refactoring the parser");
  });

  // Copilot keeps ONE store for the machine, so an id alone reads another project's summary — the
  // hole copilotSessionExistsForCwd exists to close, and this reader has to close it too.
  it("does not answer with another project's summary for the same id", async () => {
    expect(await agentSessionTitle(ELSEWHERE, COPILOT_ID, "copilot")).toBeNull();
  });

  // Copilot REWRITES this as the session goes, so unlike the other two it must not be remembered.
  it("re-reads, because copilot rewrites its summary", async () => {
    expect(await agentSessionTitle(HERE, COPILOT_ID, "copilot")).toBe("Refactoring the parser");
    withCopilotDb((db) => db.prepare("UPDATE sessions SET summary = ? WHERE id = ?").run("Now fixing the tests", COPILOT_ID));
    expect(await agentSessionTitle(HERE, COPILOT_ID, "copilot")).toBe("Now fixing the tests");
  });
});

describe("the agents whose store cannot answer this for one id yet", () => {
  it("says nothing rather than guessing", async () => {
    for (const agent of ["grok", "muse"] as const) {
      expect(await agentSessionTitle(HERE, CODEX_ID, agent)).toBeNull();
    }
  });
});

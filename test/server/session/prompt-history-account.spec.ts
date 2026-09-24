// @vitest-environment node
// Prompt history for a session on a second login (#2215): claude writes history.jsonl into the
// ACCOUNT's home, so a session found there must be read from there even before anything binds it.
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionPrompts } from "../../../server/session/session-reads.js";
import { setAccountsProvider } from "../../../server/session/session-home.js";
import { encodeProjectDirName } from "../../../server/session/project-dir.js";

const SESSION = "12121212-3434-4565-8787-909090909090";
const CWD = path.resolve("/ws/account-app");

let home = "";
const historyLine = (display: string) => `${JSON.stringify({ display, pastedContents: {}, timestamp: 1_700_000_000_000, project: CWD, sessionId: SESSION })}\n`;

async function put(file: string, body: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
}

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "mt-prompt-account-"));
  vi.spyOn(os, "homedir").mockReturnValue(home);
  vi.stubEnv("CLAUDE_CONFIG_DIR", undefined);
  setAccountsProvider(() => [{ id: "work", label: "Work", agent: "claude", home: "~/.claude-work" }]);
  // The transcript holds no prompt, so an answer can only have come from a history file.
  await put(path.join(home, ".claude-work", "projects", encodeProjectDirName(CWD), `${SESSION}.jsonl`), "{}\n");
  await put(path.join(home, ".claude", "history.jsonl"), "");
});

afterEach(async () => {
  setAccountsProvider(() => []);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await fs.rm(home, { recursive: true, force: true });
});

describe("sessionPrompts for a session in an account home", () => {
  it("reads that account's history.jsonl, not the default one", async () => {
    await put(path.join(home, ".claude-work", "history.jsonl"), historyLine("typed on the work login"));
    const { prompts } = await sessionPrompts(CWD, SESSION, "claude");
    expect(prompts.map((p) => p.text)).toEqual(["typed on the work login"]);
  });
});

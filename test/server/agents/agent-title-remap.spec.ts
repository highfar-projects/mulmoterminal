// @vitest-environment node
//
// The cache key is the RESOLVED conversation, never the session key (#2123).
//
// codex and agy both file a transcript under an id of their own, and MulmoTerminal keeps a map from
// its session id to that conversation. The map MOVES — a cell relaunched or resumed onto a different
// rollout rewrites it — so a cache keyed by our session id keeps answering with the conversation the
// key used to name. Codex confirmed the sequence in review: S→A cached, S remapped to B, cache still
// says A.
//
// Its own file because it needs a temp HOME: the mapping is persisted to `~/.mulmoterminal`, and a
// spec that wrote there would append to the developer's real state log.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const home = await fs.mkdtemp(path.join(os.tmpdir(), "mt-title-remap-"));
vi.spyOn(os, "homedir").mockReturnValue(home);

// Imported AFTER the homedir mock: the registry resolves its state directory at module load, so an
// import above this line would bind the developer's real `~/.mulmoterminal`.
const { agentSessionTitle, clearAgentTitleCache } = await import("../../../server/agents/agent-session-title.js");
const { rememberCodexRollout } = await import("../../../server/session/registry.js");

const CWD = "/work/project";
const SESSION = "11111111-2222-4333-8444-555555555555";
const ROLLOUT_A = "01a0b1ce-52ce-7ee3-96b3-6ae19313a001";
const ROLLOUT_B = "01a0b1ce-52ce-7ee3-96b3-6ae19313a002";

const codexRoot = () => path.join(home, "codex-store");
const line = (r: unknown) => `${JSON.stringify(r)}\n`;

async function writeRollout(id: string, prompt: string): Promise<void> {
  const dir = path.join(codexRoot(), "2026", "09", "18");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `rollout-2026-09-18T08-58-04-${id}.jsonl`),
    line({ type: "session_meta", payload: { id, cwd: CWD } }) +
      line({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: prompt }] } }),
  );
}

beforeEach(() => clearAgentTitleCache());
afterEach(() => clearAgentTitleCache());

describe("a session key remapped to another codex rollout", () => {
  it("answers the NEW rollout's opening, not the cached one", async () => {
    await writeRollout(ROLLOUT_A, "the first conversation");
    await writeRollout(ROLLOUT_B, "a different conversation");

    await rememberCodexRollout(SESSION, ROLLOUT_A, CWD);
    expect(await agentSessionTitle(CWD, SESSION, "codex", { codexSessions: codexRoot() })).toBe("the first conversation");

    // The cell is relaunched onto another rollout under the same key.
    await rememberCodexRollout(SESSION, ROLLOUT_B, CWD);
    expect(await agentSessionTitle(CWD, SESSION, "codex", { codexSessions: codexRoot() })).toBe("a different conversation");
  });

  // The other half of keying by the resolved id: two session keys pointing at ONE rollout share the
  // entry rather than reading it twice.
  it("shares one entry between two keys naming the same rollout", async () => {
    await writeRollout(ROLLOUT_A, "the first conversation");
    const second = "99999999-2222-4333-8444-555555555555";
    await rememberCodexRollout(SESSION, ROLLOUT_A, CWD);
    await rememberCodexRollout(second, ROLLOUT_A, CWD);
    expect(await agentSessionTitle(CWD, SESSION, "codex", { codexSessions: codexRoot() })).toBe("the first conversation");
    expect(await agentSessionTitle(CWD, second, "codex", { codexSessions: codexRoot() })).toBe("the first conversation");
  });
});

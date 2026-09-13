// @vitest-environment node
// WHICH directory the copilot resume probe is asked about.
//
// The probe is cwd-bound so that a session id from another project cannot be resumed here by
// hand-editing `?session=`. That guard must not also break the ordinary reconnect: a reconnect
// often carries no `?cwd=` at all, and `wsConnectionContext` resolves that to the DEFAULT
// workspace — so asking the REQUEST's directory declines to resume a session that lives elsewhere,
// and `resolveReattachableId` then mints a new id, silently losing the conversation (Codex round 5
// of #2063, P1).
//
// So the assertion is not "does it resume" but "which cwd did it ask about", which is the decision
// that was wrong.
import { describe, it, expect, vi, beforeEach } from "vitest";

const existsForCwd = vi.fn<(id: string, cwd: string) => Promise<boolean>>(async () => true);
vi.mock("../../../server/agents/copilot-sessions.js", () => ({
  copilotSessionExistsForCwd: (id: string, cwd: string) => existsForCwd(id, cwd),
  copilotSessionExists: () => false,
  listCopilotSessionsForCwd: async () => [],
  copilotSessionStatePath: () => "/nonexistent",
}));

const rememberedCwd = vi.fn<(id: string) => string | null>(() => null);
vi.mock("../../../server/session/registry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../server/session/registry")>();
  return { ...actual, sessionCwd: (id: string) => rememberedCwd(id) };
});

const ID = "3a7c1e90-2b44-4c8e-9d10-5f6a7b8c9d01";
const REQUEST_CWD = "/the/request/said/this";
const REMEMBERED = "/where/the/session/actually/lives";

beforeEach(() => vi.clearAllMocks());

describe("resolveCopilotSession", () => {
  it("asks the session's REMEMBERED directory, not the one the request carried", async () => {
    rememberedCwd.mockReturnValue(REMEMBERED);
    const { resolveCopilotSession } = await import("../../../server/routes/ws-routes");
    await resolveCopilotSession(ID, REQUEST_CWD);
    expect(existsForCwd).toHaveBeenCalledWith(ID, REMEMBERED);
  });

  it("falls back to the request's directory when nothing is remembered", async () => {
    rememberedCwd.mockReturnValue(null);
    const { resolveCopilotSession } = await import("../../../server/routes/ws-routes");
    await resolveCopilotSession(ID, REQUEST_CWD);
    expect(existsForCwd).toHaveBeenCalledWith(ID, REQUEST_CWD);
  });

  it("asks nothing at all for a fresh connection", async () => {
    const { resolveCopilotSession } = await import("../../../server/routes/ws-routes");
    await resolveCopilotSession(null, REQUEST_CWD);
    expect(existsForCwd).not.toHaveBeenCalled();
  });
});

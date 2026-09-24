// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const ID = "11111111-2222-4333-8444-555555555555";
const bound = new Set<string>();
const cwds = new Map<string, string>();
const asked: string[] = [];

vi.mock("../../../server/session/account-sessions.js", () => ({
  boundAccount: (_agent: string, id: string) => (bound.has(id) ? { sessionId: id, agent: "claude", accountId: "work", home: "/h" } : undefined),
}));
vi.mock("../../../server/session/registry.js", () => ({ devTerminalCwdsHydrated: Promise.resolve(), sessionCwd: (id: string) => cwds.get(id) }));
vi.mock("../../../server/infra/gui-mcp-registration.js", () => ({
  registeredGuiMcpGroups: async (cwd: string) => {
    asked.push(cwd);
    return ["render"];
  },
}));

const { accountDirectoryMcpGroups } = await import("../../../server/session/account-mcp.js");

beforeEach(() => {
  bound.clear();
  cwds.clear();
  asked.length = 0;
});

describe("accountDirectoryMcpGroups (#2215)", () => {
  it("hands a project cell on an account its directory's groups", async () => {
    bound.add(ID);
    expect(await accountDirectoryMcpGroups(ID, "/p", false, false)).toEqual(["render"]);
  });

  it("reads the SESSION's own directory over the request's", async () => {
    bound.add(ID);
    cwds.set(ID, "/session/dir");
    await accountDirectoryMcpGroups(ID, "/request/dir", false, false);
    expect(asked).toEqual(["/session/dir"]);
  });

  it("hands nothing, and reads nothing, on the default login, to a full-GUI cell, or to a live reattach", async () => {
    expect(await accountDirectoryMcpGroups(ID, "/p", false, false)).toEqual([]);
    bound.add(ID);
    expect(await accountDirectoryMcpGroups(ID, "/p", true, false)).toEqual([]);
    expect(await accountDirectoryMcpGroups(ID, "/p", false, true)).toEqual([]);
    expect(asked).toEqual([]);
  });
});

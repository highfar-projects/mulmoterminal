// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { CommandHandlers, JsonObject, JsonValue } from "@mulmoclaude/core/remote-host";
import type { PeerHost } from "../../../common/peers.js";
import { DIR_ICONS_MAX_CHARS } from "./dirIcons.js";
import { mergeListing, withPeerSessions, type PeerSessionDeps } from "./peerSessions.js";

const WSL: PeerHost = { id: "wsl", label: "WSL", url: "http://localhost:34567" };
const LOCAL_ID = "11111111-1111-4111-8111-111111111111";
const PEER_ID = "22222222-2222-4222-8222-222222222222";

const localHandlers = (): CommandHandlers => ({
  listTerminalSessions: vi.fn(() => ({ sessions: [{ id: LOCAL_ID, title: "local", cwd: "D:\\w", live: true, agent: "claude" }], icons: {} })),
  getTerminalScreen: vi.fn((params: JsonObject) => ({ from: "local", sessionId: params.sessionId ?? null })),
  sendTerminalInput: vi.fn(() => ({ from: "local" })),
  listFeeds: vi.fn(() => ({ feeds: [] })),
});

// A handler the table must have — a missing one fails the test where it is asked for.
const run = (table: CommandHandlers, name: string, params: JsonObject) => {
  const handler = table[name];
  if (!handler) throw new Error(`no handler ${name}`);
  return Promise.resolve(handler(params));
};

const peerListing = { sessions: [{ id: PEER_ID, title: "peer work", cwd: "/home/u/w", live: true, agent: "claude" }], icons: {} };

function setup(overrides: Partial<PeerSessionDeps> = {}) {
  const handlers = localHandlers();
  const call = vi.fn(async (_peer: PeerHost, name: string, params: JsonObject): Promise<JsonValue> => {
    if (name === "listTerminalSessions") return peerListing;
    return { from: "peer", name, sessionId: params.sessionId ?? null };
  });
  const deps: PeerSessionDeps = {
    peers: () => [WSL],
    call,
    isLocal: async (id) => id === LOCAL_ID,
    warn: vi.fn(),
    ...overrides,
  };
  return { handlers, call, deps, wrapped: withPeerSessions(handlers, deps) };
}

describe("withPeerSessions — the list", () => {
  it("adds the peer's rows after ours, titled with the peer's label", async () => {
    const { wrapped } = setup();
    const listing = await run(wrapped, "listTerminalSessions", {});
    expect(listing).toEqual({
      sessions: [
        { id: LOCAL_ID, title: "local", cwd: "D:\\w", live: true, agent: "claude" },
        { id: PEER_ID, title: "[WSL] peer work", cwd: "/home/u/w", live: true, agent: "claude" },
      ],
      icons: {},
    });
  });

  // A peer that is down must not cost the phone the host's own list.
  it("still answers with our own rows when the peer does not", async () => {
    const warn = vi.fn();
    const { wrapped } = setup({ call: vi.fn(() => Promise.reject(new Error("WSL is not reachable."))), warn });
    const listing = await run(wrapped, "listTerminalSessions", {});
    expect(listing).toMatchObject({ sessions: [{ id: LOCAL_ID }] });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("WSL is not reachable."));
  });

  it("asks no peer when none is configured", async () => {
    const { wrapped, call } = setup({ peers: () => [] });
    await run(wrapped, "listTerminalSessions", {});
    expect(call).not.toHaveBeenCalled();
  });
});

describe("withPeerSessions — a session-scoped command", () => {
  it("keeps a session of ours here", async () => {
    const { wrapped, call } = setup();
    expect(await run(wrapped, "getTerminalScreen", { sessionId: LOCAL_ID })).toEqual({ from: "local", sessionId: LOCAL_ID });
    expect(call).not.toHaveBeenCalled();
  });

  it("sends a peer's session to that peer, with the phone's params unchanged", async () => {
    const { wrapped, call } = setup();
    await run(wrapped, "listTerminalSessions", {});
    expect(await run(wrapped, "sendTerminalInput", { sessionId: PEER_ID, text: "hi" })).toEqual({
      from: "peer",
      name: "sendTerminalInput",
      sessionId: PEER_ID,
    });
    expect(call).toHaveBeenLastCalledWith(WSL, "sendTerminalInput", { sessionId: PEER_ID, text: "hi" });
  });

  // A notification tap names a session before the phone ever asked for the list.
  it("finds the peer of a session it has not listed yet", async () => {
    const { wrapped, call } = setup();
    expect(await run(wrapped, "getTerminalScreen", { sessionId: PEER_ID })).toEqual({ from: "peer", name: "getTerminalScreen", sessionId: PEER_ID });
    expect(call).toHaveBeenCalledWith(WSL, "listTerminalSessions", {});
  });

  // Nobody holds it: the local handler's own refusal is the answer, as before peers existed.
  it("leaves a session nobody lists to the local handler", async () => {
    const { wrapped } = setup();
    const unknown = "33333333-3333-4333-8333-333333333333";
    expect(await run(wrapped, "getTerminalScreen", { sessionId: unknown })).toEqual({ from: "local", sessionId: unknown });
  });

  it("passes a peer's refusal through as the error the phone shows", async () => {
    const call = vi.fn(async (_peer: PeerHost, name: string): Promise<JsonValue> => {
      if (name === "listTerminalSessions") return peerListing;
      throw new Error("That question was already answered.");
    });
    const { wrapped } = setup({ call });
    await expect(run(wrapped, "sendTerminalInput", { sessionId: PEER_ID, text: "x" })).rejects.toThrow("That question was already answered.");
  });

  // The slash-command chips under a peer cell: only the peer knows that cell's directory and
  // plugins, and ours refused it as "unknown session". Without a session, the list is ours.
  it("asks the peer for the skills of its session, and keeps the plain list here", async () => {
    const handlers: CommandHandlers = { ...localHandlers(), listSkills: vi.fn(() => ({ skills: ["local"] })) };
    const { deps, call } = setup();
    const wrapped = withPeerSessions(handlers, deps);
    expect(await run(wrapped, "listSkills", { sessionId: PEER_ID })).toEqual({ from: "peer", name: "listSkills", sessionId: PEER_ID });
    expect(await run(wrapped, "listSkills", {})).toEqual({ skills: ["local"] });
    expect(call).not.toHaveBeenCalledWith(WSL, "listSkills", {});
  });

  it("leaves commands that name no session alone", () => {
    const { handlers, wrapped } = setup();
    expect(wrapped.listFeeds).toBe(handlers.listFeeds);
  });
});

describe("mergeListing", () => {
  it("keeps the icon table under the one budget, dropping the reference of a row whose icon did not fit", () => {
    const big = "x".repeat(DIR_ICONS_MAX_CHARS - 10);
    const into = { sessions: [], icons: { own: big } };
    mergeListing(into, { sessions: [{ id: PEER_ID, title: "t", iconId: "peerIcon" }], icons: { peerIcon: "y".repeat(20) } }, WSL);
    expect(into.icons).toEqual({ own: big });
    expect(into.sessions).toEqual([{ id: PEER_ID, title: "[WSL] t" }]);
  });

  it("shares an icon both servers already have", () => {
    const into = { sessions: [], icons: { same: "data" } };
    mergeListing(into, { sessions: [{ id: PEER_ID, title: "t", iconId: "same" }], icons: { same: "data" } }, WSL);
    expect(into.sessions).toEqual([{ id: PEER_ID, title: "[WSL] t", iconId: "same" }]);
  });
});

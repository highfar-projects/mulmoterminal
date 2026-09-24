// What the browser does with the three outcomes (#1219). The one that matters is `resumed`: that
// session was already working on this issue and NOTHING was typed into it, so a cell told to
// expect a draft would sit waiting for an Enter with no text behind it.
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { registerSpawnedChatHandler, resetSpawnedChatQueue, type SpawnedChatRequest } from "../../../src/composables/useSpawnedChat";
import { useIssueStart } from "../../../src/composables/useIssueStart";
import type { RepoDirs } from "../../../common/repoDirs";
import { flushPromises } from "@vue/test-utils";
import { resetIssueStartAgent, useIssueStartAgent } from "../../../src/composables/useIssueStartAgent";
import { resetAgentAvailability, useAgentAvailability } from "../../../src/composables/useAgentAvailability";
import { useAppConfig } from "../../../src/composables/useAppConfig";

const { repoDirs, startIssueWork, startError } = useIssueStart();

const placed: SpawnedChatRequest[] = [];
let unregister: () => void = () => {};

const answer = (body: unknown, ok = true) =>
  vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) } as unknown as Response)) as unknown as typeof fetch;

const entry = (): RepoDirs => ({ repo: "acme/web", dirs: [{ path: "/w/web", label: "web", orderPriority: null }], primary: "/w/web" });

beforeEach(() => {
  placed.length = 0;
  resetSpawnedChatQueue();
  unregister = registerSpawnedChatHandler((req) => {
    placed.push(req);
    return true;
  });
  repoDirs.value = [entry()];
  startError.value = null;
});
afterEach(() => unregister());

describe("what the row does with the server's outcome", () => {
  it("expects a draft for a freshly started issue", async () => {
    globalThis.fetch = answer({ ok: true, sessionId: "s-1", outcome: "created" });
    expect(await startIssueWork("acme/web", 7, "/w/web")).toBe(true);
    expect(placed).toEqual([{ id: "s-1", agent: "claude", draft: true }]);
  });

  // Same as created: the worktree was already there but empty, so the issue IS in the box.
  it("expects a draft when an empty existing worktree was reused", async () => {
    globalThis.fetch = answer({ ok: true, sessionId: "s-2", outcome: "reused" });
    await startIssueWork("acme/web", 7, "/w/web");
    expect(placed[0]).toMatchObject({ id: "s-2", draft: true });
  });

  it("does NOT expect a draft when the issue's own session was reopened", async () => {
    globalThis.fetch = answer({ ok: true, sessionId: "s-old", outcome: "resumed" });
    await startIssueWork("acme/web", 7, "/w/web");
    expect(placed[0]).toMatchObject({ id: "s-old", draft: false });
  });

  // #2227. The resumed session is whatever agent the worktree held; placed as Claude it attaches on
  // Claude's endpoint, which starts Claude instead of reopening it.
  it("places the cell as the agent the server names", async () => {
    globalThis.fetch = answer({ ok: true, sessionId: "s-old", outcome: "resumed", agent: "codex" });
    await startIssueWork("acme/web", 7, "/w/web");
    expect(placed[0]).toEqual({ id: "s-old", agent: "codex", draft: false });
  });

  // #2228. A seed that runs is not waiting for an Enter; placed as a draft, the cell would wait for one.
  it("does NOT expect a draft when the server says the seed runs", async () => {
    globalThis.fetch = answer({ ok: true, sessionId: "s-5", outcome: "created", agent: "codex", seedRuns: true });
    await startIssueWork("acme/web", 7, "/w/web");
    expect(placed[0]).toEqual({ id: "s-5", agent: "codex", draft: false });
  });

  it.each([false, undefined, "true", 1])("still expects a draft when seedRuns is %j", async (seedRuns) => {
    globalThis.fetch = answer({ ok: true, sessionId: "s-6", outcome: "created", seedRuns });
    await startIssueWork("acme/web", 7, "/w/web");
    expect(placed[0]).toMatchObject({ draft: true });
  });

  // A reply from before the field existed meant Claude, and a value that is not an agent is not
  // something to attach on; both place as Claude rather than refusing a session that did start.
  it.each([undefined, null, "", "gemini", 7, { name: "codex" }])("places as claude when the agent is %j", async (agent) => {
    globalThis.fetch = answer({ ok: true, sessionId: "s-4", outcome: "created", agent });
    await startIssueWork("acme/web", 7, "/w/web");
    expect(placed[0]).toMatchObject({ id: "s-4", agent: "claude" });
  });

  // A server that predates the field: the ordinary case is a draft, which is what every start did
  // before the three outcomes existed.
  it("expects a draft when the server said nothing about the outcome", async () => {
    globalThis.fetch = answer({ ok: true, sessionId: "s-3" });
    await startIssueWork("acme/web", 7, "/w/web");
    expect(placed[0]).toMatchObject({ draft: true });
  });

  // The REAL shape the route sends for a step that ran and stopped: `{ ok: false, reason, detail }`
  // — no `error` key. Reading only `error` showed "could not start work on acme/web#7" and dropped
  // the one sentence that says what to do, which is the whole point of refusing rather than
  // starting a second worktree.
  it("shows the refusal and places nothing when the worktree is held elsewhere", async () => {
    const detail = "this worktree's session is open in another terminal — a worktree runs one session, so close it there first";
    globalThis.fetch = answer({ ok: false, reason: "worktree-busy", detail }, false);
    expect(await startIssueWork("acme/web", 7, "/w/web")).toBe(false);
    expect(placed).toEqual([]);
    expect(startError.value).toBe(detail);
  });

  // The other shape, from the guards that reject the request outright.
  it("shows the guard's error when the request itself was refused", async () => {
    globalThis.fetch = answer({ error: "/etc is not a known clone of acme/web" }, false);
    await startIssueWork("acme/web", 7, "/w/web");
    expect(startError.value).toBe("/etc is not a known clone of acme/web");
  });

  it("falls back to a sentence of its own when the server said neither", async () => {
    globalThis.fetch = answer({ ok: false }, false);
    await startIssueWork("acme/web", 7, "/w/web");
    expect(startError.value).toBe("could not start work on acme/web#7");
  });
});

// #2226. The view's pick travels with the request, and an agent that cannot start is not asked for.
describe("the agent and account the view picked", () => {
  const bodies: unknown[] = [];
  const route = (availability: unknown) =>
    vi.fn((url: string, init?: RequestInit) => {
      if (String(url).includes("/api/agents/availability"))
        return Promise.resolve({ ok: true, json: () => Promise.resolve(availability) } as unknown as Response);
      bodies.push(JSON.parse(String(init?.body)));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, sessionId: "s-9", outcome: "created", agent: "codex", seedRuns: true }),
      } as unknown as Response);
    }) as unknown as typeof fetch;

  beforeEach(() => {
    bodies.length = 0;
    resetIssueStartAgent();
    resetAgentAvailability();
    useAppConfig().accounts.value = [{ id: "side", label: "Side", agent: "codex", home: "~/.codex-side" }];
  });

  it("sends the picked agent, and the account only when one is picked", async () => {
    globalThis.fetch = route({ agents: [] });
    const { chooseAgent, chooseAccount } = useIssueStartAgent();
    chooseAgent("codex");
    await startIssueWork("acme/web", 7, "/w/web");
    chooseAccount("side");
    await startIssueWork("acme/web", 8, "/w/web");
    expect(bodies).toEqual([
      { repo: "acme/web", issue: 7, dir: "/w/web", agent: "codex" },
      { repo: "acme/web", issue: 8, dir: "/w/web", agent: "codex", account: "side" },
    ]);
  });

  it("refuses to start an agent this machine cannot start, and says so", async () => {
    globalThis.fetch = route({ agents: [{ agent: "codex", available: false, reason: "missing", installGuide: null }] });
    useIssueStartAgent().chooseAgent("codex");
    // The picker row loads availability when it mounts, before any start button can be clicked.
    useAgentAvailability();
    await flushPromises();
    expect(await startIssueWork("acme/web", 7, "/w/web")).toBe(false);
    expect(bodies).toEqual([]);
    expect(startError.value).toContain("codex cannot be started");
    expect(placed).toEqual([]);
  });
});

// @vitest-environment node
// A peer's push reaching the phone through the parent that relays it (backends/remoteHost/
// peerProtocol.ts): the peer hands its push to a listening parent whatever its own settings say,
// and the parent sends it under its own channel, deciding by ITS settings.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PushKind } from "../../../../common/pushKinds.js";

const mocks = vi.hoisted(() => ({
  pushEnabled: false,
  pushKinds: [] as string[],
  hostId: "mulmoterminal-abcd1234" as string | null,
}));

vi.mock("../../../../server/config/config-routes.js", () => ({
  getPushEnabled: () => mocks.pushEnabled,
  getPushKinds: () => mocks.pushKinds,
}));
const sendWebPush = vi.fn(() => Promise.resolve(null));
vi.mock("../../../../server/infra/http/web-push.js", () => ({ sendWebPush }));
vi.mock("../../../../server/backends/remoteHost/index.js", () => ({ currentHostId: () => mocks.hostId }));
vi.mock("../../../../server/session/registry.js", () => ({
  aiTitles: new Map<string, string>(),
  lastResponses: new Map<string, string>(),
  ptys: new Map([["s1", { cwd: "/home/u/proj", agent: "claude" }]]),
  translationWorkerIds: new Set<string>(),
  pushClassification: () => Promise.resolve({ background: false, userScheduled: false }),
}));
vi.mock("../../../../server/session/transcript/cleared-transcripts.js", () => ({ transcriptIdOf: (id: string) => id }));
vi.mock("../../../../server/session/session-reads.js", () => ({
  LAST_RESPONSE_MAX: 500,
  claudeCurrentTurnReply: () => Promise.resolve("read from the transcript"),
  sessionLastTurn: () => Promise.resolve({ reply: null }),
}));

const { notifyTaskFinished, relayPeerPush, setPeerPushSink } = await import("../../../../server/session/activity/task-push.js");

const published: unknown[] = [];
let listening = false;
setPeerPushSink({ wanted: () => listening, publish: (event) => published.push(event) });

beforeEach(() => {
  published.length = 0;
  sendWebPush.mockClear();
  mocks.pushEnabled = false;
  mocks.pushKinds = [];
  listening = false;
});

const finished = (kind: PushKind = "finished") => notifyTaskFinished("s1", kind, { message: "", reply: "done it" }, "34567");

describe("the peer's side", () => {
  // The usual WSL peer: no phone of its own, push off, a parent listening.
  it("hands a parent its push even with its own push off, and sends none itself", async () => {
    listening = true;
    await finished();
    expect(published).toEqual([{ sessionId: "s1", kind: "finished", title: expect.stringContaining("proj"), body: "done it" }]);
    expect(sendWebPush).not.toHaveBeenCalled();
  });

  it("publishes nothing when no parent listens", async () => {
    mocks.pushEnabled = true;
    mocks.pushKinds = ["finished"];
    await finished();
    expect(published).toEqual([]);
    expect(sendWebPush).toHaveBeenCalledTimes(1);
  });
});

describe("the parent's side", () => {
  const event = { sessionId: "peer-session", kind: "finished", title: "done proj", body: "done it" };

  it("sends a peer's push under its own host id, titled with the peer's label", () => {
    mocks.pushEnabled = true;
    mocks.pushKinds = ["finished", "waiting"];
    relayPeerPush("WSL", event, "34568");
    expect(sendWebPush).toHaveBeenCalledWith("[WSL] done proj", "done it", { sessionId: "peer-session", hostId: "mulmoterminal-abcd1234", port: "34568" });
  });

  it("follows its own push settings, not the peer's", () => {
    mocks.pushEnabled = true;
    mocks.pushKinds = ["waiting"];
    relayPeerPush("WSL", event, "34568");
    expect(sendWebPush).not.toHaveBeenCalled();
  });

  it("drops a kind it does not know", () => {
    mocks.pushEnabled = true;
    mocks.pushKinds = ["finished", "waiting"];
    relayPeerPush("WSL", { ...event, kind: "exploded" }, "34568");
    expect(sendWebPush).not.toHaveBeenCalled();
  });
});

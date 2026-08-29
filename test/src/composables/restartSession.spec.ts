// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { restartSession, reapSessionOnServer } from "../../../src/composables/restartSession";

// The ORDER is the whole point, and it is invisible in the code that reads it: a session lives
// inside tmux, and reconnecting to one that is still alive ATTACHES the old process instead of
// starting a new one. A reconnect that overtakes the reap therefore produces a restart that
// silently changes nothing — the failure this test exists to keep out.
describe("restartSession", () => {
  it("reaps before reconnecting, and reconnects only after the reap has RESOLVED", async () => {
    const calls: string[] = [];
    let finishReap = (): void => {};
    const reaping = new Promise<boolean>((resolve) => {
      finishReap = () => resolve(true);
    });

    const done = restartSession("s1", {
      reap: (id) => {
        calls.push(`reap:${id}`);
        return reaping;
      },
      reconnect: () => calls.push("reconnect"),
    });

    await Promise.resolve();
    expect(calls).toEqual(["reap:s1"]); // still in flight — nothing may reconnect yet
    finishReap();
    expect(await done).toBe("restarted");
    expect(calls).toEqual(["reap:s1", "reconnect"]);
  });

  it("does nothing at all without a session — a cell still on its launch form", async () => {
    const reap = vi.fn(async () => true);
    const reconnect = vi.fn();
    expect(await restartSession(null, { reap, reconnect })).toBe("no-session");
    expect(reap).not.toHaveBeenCalled();
    expect(reconnect).not.toHaveBeenCalled();
  });

  it("still reconnects when the reap could not be confirmed, and says so", async () => {
    const reconnect = vi.fn();
    expect(await restartSession("s1", { reap: async () => false, reconnect })).toBe("reap-unconfirmed");
    expect(reconnect).toHaveBeenCalledTimes(1);
  });
});

describe("reapSessionOnServer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts to the session's terminate route", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await reapSessionOnServer("a/b")).toBe(true);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("/api/session/a%2Fb/terminate"); // the id rides in a path segment
    expect(call?.[1]?.method).toBe("POST");
  });

  it("reports NOT confirmed on a refusal, so the caller knows the old process may still be there", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    expect(await reapSessionOnServer("s1")).toBe(false);
  });

  it("reports NOT confirmed when the request cannot be made at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    expect(await reapSessionOnServer("s1")).toBe(false);
  });
});

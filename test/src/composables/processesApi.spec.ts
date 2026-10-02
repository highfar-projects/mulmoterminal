// What the Processes page tells the user after End: the server can answer 200 without having seen
// the process go, and that must not read as success.
import { afterEach, describe, expect, it, vi } from "vitest";
import { killProcess } from "../../../src/composables/processesApi";
import type { SessionProcess } from "../../../common/sessionProcesses";

const PROCESS: SessionProcess = { pid: 10, ppid: 1, depth: 1, command: "vite", rssKb: 1, elapsedSeconds: 1, startedAt: "s", cpuPercent: null };

const answer = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("killProcess", () => {
  it.each([
    [200, { ok: true, ended: true, forced: false }, "ended"],
    [200, { ok: true, ended: false, forced: true }, "unconfirmed"],
    [200, {}, "unconfirmed"],
    [404, { error: "no such process in any session" }, "failed"],
    [409, { error: "this is the session itself" }, "failed"],
  ])("reads %s %j as %s", async (status, body, outcome) => {
    answer(status, body);
    expect(await killProcess(PROCESS)).toBe(outcome);
  });

  it("is failed when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("network"))),
    );
    expect(await killProcess(PROCESS)).toBe("failed");
  });

  it("names the process by pid and start time", async () => {
    answer(200, { ended: true });
    await killProcess(PROCESS);
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({ pid: 10, startedAt: "s" });
  });
});

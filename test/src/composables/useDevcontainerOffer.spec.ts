import { describe, it, expect, beforeEach, vi } from "vitest";
import { devcontainerStatus, buildDevcontainer, offerDevcontainerIfNeeded } from "../../../src/composables/useDevcontainerOffer";

// Stubs `fetch` to answer every request the same way, whatever the URL — enough for the tests
// that only ever make one call.
const serveOnce = (answer: { ok: boolean; status?: number; statusText?: string; body: unknown }) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: answer.ok, status: answer.status ?? (answer.ok ? 200 : 500), statusText: answer.statusText ?? "", json: async () => answer.body }),
    ),
  );

// For `offerDevcontainerIfNeeded`, which calls `/api/devcontainer/status` first and (maybe)
// `/api/devcontainer/up` second — the two need different bodies.
const serveByUrl = (byUrl: Record<string, { ok: boolean; status?: number; body: unknown }>) =>
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const match = Object.entries(byUrl).find(([key]) => String(url).includes(key));
      if (!match) throw new Error(`unexpected fetch: ${String(url)}`);
      const [, answer] = match;
      return Promise.resolve({ ok: answer.ok, status: answer.status ?? (answer.ok ? 200 : 500), json: async () => answer.body });
    }),
  );

beforeEach(() => {
  vi.unstubAllGlobals();
  // Restores window.confirm/window.alert to their real (jsdom) implementations — without this, a
  // later `vi.spyOn(window, "alert")` wraps the PREVIOUS test's spy instead of a fresh one and
  // inherits its call history, so an assertion against "not called" sees an old test's calls.
  vi.restoreAllMocks();
});

describe("devcontainerStatus", () => {
  it("reads hasConfig/enabled/containerName off the response", async () => {
    serveOnce({ ok: true, body: { hasConfig: true, enabled: true, containerName: "angry_rubin" } });
    expect(await devcontainerStatus("/repo")).toEqual({ hasConfig: true, enabled: true, containerName: "angry_rubin" });
  });

  it("defaults a body with no recognizable fields to hasConfig:false", async () => {
    serveOnce({ ok: true, body: {} });
    expect(await devcontainerStatus("/repo")).toEqual({ hasConfig: false, enabled: false, containerName: null });
  });

  it("answers null (not a thrown error) when the server can't be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );
    expect(await devcontainerStatus("/repo")).toBeNull();
  });
});

describe("buildDevcontainer", () => {
  it("reports ok with no message on success", async () => {
    serveOnce({ ok: true, body: { ok: true, output: "…build log…" } });
    expect(await buildDevcontainer("/repo")).toEqual({ ok: true, message: "" });
  });

  it("carries the build log tail on a failed build", async () => {
    serveOnce({ ok: false, body: { ok: false, output: "postCreateCommand exited 1" } });
    expect(await buildDevcontainer("/repo")).toEqual({ ok: false, message: "postCreateCommand exited 1" });
  });

  it("falls back to the status text when the failure body carries no log", async () => {
    serveOnce({ ok: false, statusText: "Internal Server Error", body: {} });
    expect(await buildDevcontainer("/repo")).toEqual({ ok: false, message: "Internal Server Error" });
  });

  it("turns an unreachable server into a readable message instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );
    const result = await buildDevcontainer("/repo");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("network down");
  });

  it("defaults to rebuild:false, and carries rebuild:true when asked", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) }));
    vi.stubGlobal("fetch", fetchMock);
    const bodyOf = (n: number) => JSON.parse(String((fetchMock.mock.calls[n] as unknown as [string, RequestInit] | undefined)?.[1]?.body));
    await buildDevcontainer("/repo");
    expect(bodyOf(0)).toEqual({ cwd: "/repo", rebuild: false });
    await buildDevcontainer("/repo", { rebuild: true });
    expect(bodyOf(1)).toEqual({ cwd: "/repo", rebuild: true });
  });
});

describe("offerDevcontainerIfNeeded", () => {
  it("never asks when the directory has no devcontainer config", async () => {
    serveOnce({ ok: true, body: { hasConfig: false, enabled: false, containerName: null } });
    const confirmSpy = vi.spyOn(window, "confirm");
    await offerDevcontainerIfNeeded("/repo");
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("never asks again once the directory is already enabled", async () => {
    serveOnce({ ok: true, body: { hasConfig: true, enabled: true, containerName: "angry_rubin" } });
    const confirmSpy = vi.spyOn(window, "confirm");
    await offerDevcontainerIfNeeded("/repo");
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("does not build when the user declines the confirm", async () => {
    serveOnce({ ok: true, body: { hasConfig: true, enabled: false, containerName: null } });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await offerDevcontainerIfNeeded("/repo");
    // The only call made was the status check — a decline never reaches /api/devcontainer/up.
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it("builds and alerts with the log on a failed build the user accepted", async () => {
    serveByUrl({
      "/api/devcontainer/status": { ok: true, body: { hasConfig: true, enabled: false, containerName: null } },
      "/api/devcontainer/up": { ok: false, body: { output: "build failed" } },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    await offerDevcontainerIfNeeded("/repo");
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("build failed"));
  });

  it("says nothing on a successful build", async () => {
    serveByUrl({
      "/api/devcontainer/status": { ok: true, body: { hasConfig: true, enabled: false, containerName: null } },
      "/api/devcontainer/up": { ok: true, body: { ok: true } },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    await offerDevcontainerIfNeeded("/repo");
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

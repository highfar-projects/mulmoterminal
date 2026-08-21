// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UpdateStatus } from "../../../common/updateStatus.js";

type UpdateInfo = Omit<UpdateStatus, "ready">;
type InstallInfo = Pick<UpdateStatus, "install" | "version" | "commit">;

// vi.mock is hoisted above imports, so the doubles it returns must be created inside a
// vi.hoisted block rather than referencing top-level consts (which aren't initialized yet).
const { computeUpdateInfo, readInstallInfo, isUpdateCheckDisabled } = vi.hoisted(() => ({
  computeUpdateInfo: vi.fn<(pkgDir: string, version: string) => Promise<UpdateInfo>>(),
  readInstallInfo: vi.fn<(pkgDir: string, version: string) => Promise<InstallInfo>>(),
  isUpdateCheckDisabled: vi.fn<(env: Record<string, string | undefined>) => boolean>(),
}));
vi.mock("../../../bin/update-check.js", () => ({ computeUpdateInfo, readInstallInfo, isUpdateCheckDisabled }));

import { refreshUpdateStatus, getUpdateStatus, startUpdateStatusRefresh } from "../../../server/config/update-status.js";

const gitInfo: UpdateInfo = {
  install: "git",
  version: "4.7.0",
  commit: "a1b2c3d",
  latest: null,
  notice: "Update available: a1b2c3d → origin  ·  run: git pull",
};

beforeEach(() => {
  computeUpdateInfo.mockReset();
  readInstallInfo.mockReset();
  isUpdateCheckDisabled.mockReset();
});

describe("refreshUpdateStatus", () => {
  it("caches the whole computed status for the route to serve", async () => {
    isUpdateCheckDisabled.mockReturnValue(false);
    computeUpdateInfo.mockResolvedValue(gitInfo);
    await refreshUpdateStatus();
    expect(getUpdateStatus()).toEqual({ ready: true, ...gitInfo });
  });

  // "Up to date" and "not finished yet" are both a null notice, so `ready` is what tells them
  // apart — without it the client cannot know a commit is never coming.
  it("marks the status ready even when there is nothing to report", async () => {
    isUpdateCheckDisabled.mockReturnValue(false);
    computeUpdateInfo.mockResolvedValue({ install: "npm", version: "4.7.0", commit: null, latest: null, notice: null });
    await refreshUpdateStatus();
    expect(getUpdateStatus()).toEqual({ ready: true, install: "npm", version: "4.7.0", commit: null, latest: null, notice: null });
  });

  // The opt-out silences the notice, not the version display: the local read still runs, so a
  // user who turned the nagging off can still read which build they are on.
  it("still reports the running install when opted out, without checking for an update", async () => {
    isUpdateCheckDisabled.mockReturnValue(true);
    readInstallInfo.mockResolvedValue({ install: "git", version: "4.7.0", commit: "a1b2c3d" });
    await refreshUpdateStatus();
    expect(getUpdateStatus()).toEqual({ ready: true, install: "git", version: "4.7.0", commit: "a1b2c3d", latest: null, notice: null });
    expect(computeUpdateInfo).not.toHaveBeenCalled();
  });

  // The property the re-check interval rests on (#1821): a second call must REPLACE the answer,
  // not leave the first one latched. Without this the interval would spin against a frozen cache
  // and the badge would still never appear for a server started with `npx mulmoterminal@latest`.
  it("replaces the cached answer on a later call", async () => {
    isUpdateCheckDisabled.mockReturnValue(false);
    const current: UpdateInfo = { install: "npm", version: "4.10.1", commit: null, latest: null, notice: null };
    computeUpdateInfo.mockResolvedValue(current);
    await refreshUpdateStatus();
    expect(getUpdateStatus().notice).toBeNull();

    const behind: UpdateInfo = { ...current, latest: "4.11.0", notice: "Update available: 4.10.1 → 4.11.0  ·  run: npm i -g mulmoterminal" };
    computeUpdateInfo.mockResolvedValue(behind);
    await refreshUpdateStatus();
    expect(getUpdateStatus()).toEqual({ ready: true, ...behind });
  });

  // The opt-out is read per call rather than latched at the first one, so turning it on takes
  // effect on the next tick instead of needing a restart — and the notice it silenced is cleared
  // rather than left standing from before.
  it("stops checking the network when the opt-out is turned on between calls", async () => {
    isUpdateCheckDisabled.mockReturnValueOnce(false).mockReturnValueOnce(true);
    computeUpdateInfo.mockResolvedValue(gitInfo);
    readInstallInfo.mockResolvedValue({ install: "git", version: "4.7.0", commit: "a1b2c3d" });
    await refreshUpdateStatus();
    expect(getUpdateStatus().notice).toBe(gitInfo.notice);

    await refreshUpdateStatus();
    expect(getUpdateStatus()).toEqual({ ready: true, install: "git", version: "4.7.0", commit: "a1b2c3d", latest: null, notice: null });
    expect(computeUpdateInfo).toHaveBeenCalledTimes(1);
  });

  // A thrown check must not surface — the status just keeps its last value.
  it("does not throw when the check rejects", async () => {
    isUpdateCheckDisabled.mockReturnValue(false);
    computeUpdateInfo.mockResolvedValue(gitInfo);
    await refreshUpdateStatus();
    computeUpdateInfo.mockRejectedValue(new Error("offline"));
    await expect(refreshUpdateStatus()).resolves.toBeUndefined();
    expect(getUpdateStatus()).toEqual({ ready: true, ...gitInfo });
  });
});

// The one thing a startup-only check could never do (#1821), and the reason the badge never
// appeared for `npx mulmoterminal@latest`: that install IS the registry's latest at the moment it
// starts, so the answer only becomes news later.
describe("startUpdateStatusRefresh", () => {
  const REFRESH_INTERVAL_MS = 3 * 60 * 60_000;

  it("checks at startup and again on the interval, picking up a release that shipped after boot", async () => {
    vi.useFakeTimers();
    try {
      isUpdateCheckDisabled.mockReturnValue(false);
      const current: UpdateInfo = { install: "npm", version: "4.10.1", commit: null, latest: null, notice: null };
      computeUpdateInfo.mockResolvedValue(current);
      startUpdateStatusRefresh();
      await vi.advanceTimersByTimeAsync(0);
      expect(getUpdateStatus().notice).toBeNull();

      const behind: UpdateInfo = { ...current, latest: "4.11.0", notice: "Update available: 4.10.1 → 4.11.0  ·  run: npm i -g mulmoterminal" };
      computeUpdateInfo.mockResolvedValue(behind);
      await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
      expect(getUpdateStatus().notice).toBe(behind.notice);
    } finally {
      vi.useRealTimers();
    }
  });

  // The timer must not be what keeps a shutting-down process alive.
  it("does not hold the event loop open", () => {
    vi.useFakeTimers();
    try {
      isUpdateCheckDisabled.mockReturnValue(false);
      computeUpdateInfo.mockResolvedValue(gitInfo);
      const unref = vi.spyOn(globalThis, "setInterval");
      startUpdateStatusRefresh();
      const timer = unref.mock.results.at(-1)?.value;
      expect(timer.hasRef()).toBe(false);
      clearInterval(timer);
      unref.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});

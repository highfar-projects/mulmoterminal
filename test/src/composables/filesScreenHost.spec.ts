// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { filesScreenOpen, provideFilesScreenHost, runOnFilesScreen } from "../../../src/composables/filesScreenHost";

// #2655. Where the full-screen Files view takes `files-*` from: only while it is registered AND up.
describe("filesScreenHost", () => {
  it("runs nothing with no view registered", () => {
    expect(filesScreenOpen()).toBe(false);
    expect(runOnFilesScreen("files-find")).toBe(false);
  });

  it("runs on the view only while it is open", () => {
    let open = true;
    const run = vi.fn();
    const withdraw = provideFilesScreenHost({ open: () => open, run });
    expect(runOnFilesScreen("files-tab-next")).toBe(true);
    expect(run).toHaveBeenCalledWith("files-tab-next");
    open = false;
    expect(runOnFilesScreen("files-find")).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
    withdraw();
  });

  it("keeps the live host when an older one withdraws after a remount", () => {
    const older = provideFilesScreenHost({ open: () => true, run: vi.fn() });
    const newer = vi.fn();
    const withdrawNewer = provideFilesScreenHost({ open: () => true, run: newer });
    older();
    expect(runOnFilesScreen("files-search")).toBe(true);
    expect(newer).toHaveBeenCalledWith("files-search");
    withdrawNewer();
  });
});

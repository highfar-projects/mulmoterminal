// #2729. A cell asks for its directory's settings: Directory settings takes the request once, lists
// that directory even when it is not one of the recent ones, and hands it to the preview to open.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { i18n } from "../../../../src/i18n";
import { closeSettings, openDirSettings, requestedSettingsDir, requestedSettingsTab, settingsOpen } from "../../../../src/composables/settingsOpener";

const DirSettingsSection = (await import("../../../../src/components/settings/DirSettingsSection.vue")).default;

afterEach(() => {
  closeSettings();
  vi.restoreAllMocks();
});

describe("opening a directory's settings", () => {
  it("opens Settings on Directory settings with that directory asked for", () => {
    openDirSettings("/work/shop");
    expect(settingsOpen.value).toBe(true);
    expect(requestedSettingsTab.value).toBe("dirSettings");
    expect(requestedSettingsDir.value).toBe("/work/shop");
  });

  it("forgets the directory when Settings closes", () => {
    openDirSettings("/work/shop");
    closeSettings();
    expect(requestedSettingsDir.value).toBeNull();
  });

  it("takes the request, lists a directory that is not a recent one, and focuses it", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}"));
    openDirSettings("/work/elsewhere");
    const w = mount(DirSettingsSection, { props: { dirPaths: ["/work/shop"] }, global: { plugins: [i18n], stubs: { SkillLaunchButton: true } } });
    expect(requestedSettingsDir.value).toBeNull();
    const preview = w.findComponent({ name: "DirConfigPreview" });
    expect(preview.props("paths")).toEqual(["/work/shop", "/work/elsewhere"]);
    expect(preview.props("focus")).toBe("/work/elsewhere");
  });

  it("does not list a recent directory twice", () => {
    openDirSettings("/work/shop");
    const w = mount(DirSettingsSection, { props: { dirPaths: ["/work/shop"] }, global: { plugins: [i18n], stubs: { SkillLaunchButton: true } } });
    expect(w.findComponent({ name: "DirConfigPreview" }).props("paths")).toEqual(["/work/shop"]);
  });
});

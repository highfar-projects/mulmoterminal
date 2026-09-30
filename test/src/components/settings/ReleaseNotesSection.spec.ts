// #2717. Settings' release notes: the newest release is shown first, another is read on choosing it,
// and an answer to an earlier choice never replaces a later one.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { i18n } from "../../../../src/i18n";

const state = vi.hoisted(() => ({
  releases: [
    { version: "7.3.0", title: "Seven three" },
    { version: "7.2.0", title: "Seven two" },
  ] as { version: string; title: string }[] | null,
  asked: [] as string[],
  pending: new Map<string, (value: unknown) => void>(),
  hold: false,
}));
vi.mock("../../../../src/composables/releaseNotes", () => ({
  fetchReleaseNotes: async () => state.releases,
  fetchReleaseNote: (version: string) => {
    state.asked.push(version);
    const entry = { version, title: version, markdown: `Body of ${version}`, url: `https://example.com/${version}` };
    if (!state.hold) return Promise.resolve(entry);
    return new Promise((resolve) => state.pending.set(version, () => resolve(entry)));
  },
}));

const ReleaseNotesSection = (await import("../../../../src/components/settings/ReleaseNotesSection.vue")).default;

afterEach(() => {
  state.releases = [
    { version: "7.3.0", title: "Seven three" },
    { version: "7.2.0", title: "Seven two" },
  ];
  state.asked.length = 0;
  state.pending.clear();
  state.hold = false;
});

const mountSection = () => mount(ReleaseNotesSection, { global: { plugins: [i18n] } });

describe("ReleaseNotesSection", () => {
  it("lists the releases by title and shows the newest", async () => {
    const w = mountSection();
    await flushPromises();
    expect(w.findAll("option").map((option) => option.text())).toEqual(["Seven three", "Seven two"]);
    expect(w.find('[data-testid="release-notes-page"]').text()).toContain("Body of 7.3.0");
  });

  it("reads another release when it is chosen", async () => {
    const w = mountSection();
    await flushPromises();
    await w.find('[data-testid="release-notes-version"]').setValue("7.2.0");
    await flushPromises();
    expect(state.asked).toEqual(["7.3.0", "7.2.0"]);
    expect(w.find('[data-testid="release-notes-page"]').text()).toContain("Body of 7.2.0");
  });

  it("shows the latest choice even when an earlier answer arrives after it", async () => {
    state.hold = true;
    const w = mountSection();
    await flushPromises();
    await w.find('[data-testid="release-notes-version"]').setValue("7.2.0");
    state.pending.get("7.2.0")?.(null);
    await flushPromises();
    state.pending.get("7.3.0")?.(null);
    await flushPromises();
    expect(w.find('[data-testid="release-notes-page"]').text()).toContain("Body of 7.2.0");
  });

  it("says so when the list cannot be read, and when it is empty", async () => {
    state.releases = null;
    expect(mountSection().find('[data-testid="release-notes-failed"]').exists()).toBe(false);
    const failed = mountSection();
    await flushPromises();
    expect(failed.find('[data-testid="release-notes-failed"]').exists()).toBe(true);
    state.releases = [];
    const empty = mountSection();
    await flushPromises();
    expect(empty.find('[data-testid="release-notes-none"]').exists()).toBe(true);
  });
});

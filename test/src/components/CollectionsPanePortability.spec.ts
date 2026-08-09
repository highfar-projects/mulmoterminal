import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// The plugin's Vue surfaces pull a large module graph and render inside a shadow root; none of
// that is what this spec is about (the HOST's portability strip below them is). Stubbed at the
// module boundary so the pane mounts as itself.
vi.mock("@mulmoclaude/collection-plugin/vue", () => ({
  CollectionsIndexView: { name: "CollectionsIndexView", template: "<div />" },
  CollectionView: { name: "CollectionView", template: "<div />" },
  FeedsView: { name: "FeedsView", template: "<div />" },
  // collectionUi.ts binds the package at import time; the pane pulls that module in for its
  // teleport-target helpers, so the mock has to answer for it too.
  configureCollectionUi: () => {},
}));
vi.mock("../../../src/components/PluginFrame.vue", () => ({
  default: { name: "PluginFrame", template: "<div><slot /></div>" },
}));

// The pane resolves its project from the server's list; this cell's cwd IS a known project.
vi.mock("../../../src/composables/collectionProject", () => ({
  projectIdForCwd: async (cwd: string | null) => (cwd === "/srv/mag2" ? "p1" : null),
}));

// Imported at module scope on purpose — an `await import` inside a test bills the whole module
// graph against that test's timeout (CLAUDE.md).
const CollectionsPane = (await import("../../../src/components/CollectionsPane.vue")).default;
const { activeCollectionNavSurface } = await import("../../../src/composables/collectionSurface");

const REPORT = {
  slug: "newsletters",
  portable: false,
  findings: [
    { code: "data-ignored", severity: "blocker", message: "The data directory is excluded by .gitignore, so the records do not travel." },
    { code: "no-primary-key", severity: "warning", message: "No primaryKey is declared, so record ids are 4 random bytes." },
  ],
};

let lastUrl = "";
function mockFetch(body: unknown, ok = true) {
  lastUrl = "";
  globalThis.fetch = vi.fn((url: string) => {
    lastUrl = String(url);
    return Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body });
  }) as unknown as typeof fetch;
}

/** Mount the pane and open a collection in it. The pane registers itself as the collection nav
 *  SURFACE while mounted, and that is how the plugin's own views move it — so the test drives the
 *  same seam rather than reaching into the component. (Wrappers auto-unmount after each test, so
 *  the surface a later test finds is its own.) */
async function mountOnCollection(slug = "newsletters") {
  const wrapper = mount(CollectionsPane, { props: { cwd: "/srv/mag2" } });
  await flushPromises();
  const nav = activeCollectionNavSurface();
  if (!nav) throw new Error("the pane did not register a nav surface");
  nav.gotoDetail("collection", slug);
  await flushPromises();
  return { wrapper, nav };
}

describe("CollectionsPane portability strip", () => {
  beforeEach(() => {
    mockFetch(REPORT);
  });

  it("offers nothing while the pane is on the index — the question is per collection", async () => {
    const w = mount(CollectionsPane, { props: { cwd: "/srv/mag2" } });
    await flushPromises();
    expect(w.find("button").exists()).toBe(false);
  });

  it("says so when the directory is not a project the server knows", async () => {
    const w = mount(CollectionsPane, { props: { cwd: "/srv/unknown" } });
    await flushPromises();
    expect(w.text()).toContain("This directory has no collections yet");
    expect(w.find("button").exists()).toBe(false);
  });

  it("asks the server for THIS pane's project, and renders what breaks on the other machine", async () => {
    const { wrapper: w } = await mountOnCollection();
    const button = w.find("button");
    expect(button.exists()).toBe(true);
    await button.trigger("click");
    await flushPromises();

    expect(lastUrl).toBe("/api/collections/newsletters/self-containment?project=p1");
    expect(w.text()).toContain("Would not survive a clone");
    // The MESSAGE, not the code — it is the part that says what to do.
    expect(w.text()).toContain("excluded by .gitignore");
    expect(w.text()).toContain("4 random bytes");
  });

  it("reports a clean collection without inventing a finding row", async () => {
    mockFetch({ slug: "newsletters", portable: true, findings: [] });
    const { wrapper: w } = await mountOnCollection();
    await w.find("button").trigger("click");
    await flushPromises();
    expect(w.text()).toContain("Nothing to fix");
    expect(w.findAll("li")).toHaveLength(0);
  });

  it("says the check failed rather than showing a verdict it does not have", async () => {
    mockFetch({}, false);
    const { wrapper: w } = await mountOnCollection();
    await w.find("button").trigger("click");
    await flushPromises();
    expect(w.text()).toContain("Could not run the check");
    expect(w.text()).not.toContain("survive");
  });

  // A verdict that outlived the collection it was about would read as the new one's.
  it("drops the report when the pane moves to another collection", async () => {
    const { wrapper: w, nav } = await mountOnCollection();
    await w.find("button").trigger("click");
    await flushPromises();
    expect(w.text()).toContain("Would not survive a clone");

    nav.gotoDetail("collection", "other");
    await flushPromises();
    expect(w.text()).not.toContain("Would not survive a clone");
  });
});

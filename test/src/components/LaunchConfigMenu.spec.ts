import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import LaunchConfigMenu from "../../../src/components/LaunchConfigMenu.vue";

type LaunchConfig = { index: number; label: string; command: string };

// /api/launch-configs echoes back a resolved cwd (the server may fall back from a bad
// path); the picked command must carry THAT cwd, not the requested one.
function mockFetch(configs: LaunchConfig[], cwd = "/home/me/proj") {
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ cwd, configs }) })) as unknown as typeof fetch;
}

const CONFIGS: LaunchConfig[] = [
  { index: 0, label: "Dev server", command: "node index.js" },
  { index: 1, label: "Unit tests", command: "python3 -m pytest" },
];

const mountMenu = async () => {
  const w = mount(LaunchConfigMenu, { props: { cwd: "/proj" } });
  await flushPromises(); // launch configs fetch up front (decides whether the button shows)
  return w;
};

describe("LaunchConfigMenu", () => {
  beforeEach(() => mockFetch(CONFIGS));

  it("shows the trigger once the project's launch configs have loaded", async () => {
    const w = await mountMenu();
    expect(w.find('[aria-haspopup="menu"]').exists()).toBe(true);
    expect(w.find('[role="menu"]').exists()).toBe(false); // closed until clicked
  });

  it("renders nothing when the project has no runnable launch configs (no file, no button)", async () => {
    mockFetch([]);
    const w = await mountMenu();
    expect(w.find('[aria-haspopup="menu"]').exists()).toBe(false);
    expect(w.find('[role="menu"]').exists()).toBe(false);
  });

  it("does not fetch (no button) while cwd is unresolved, avoiding default-workspace configs", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const w = mount(LaunchConfigMenu, { props: { cwd: null } });
    await flushPromises();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(w.find('[aria-haspopup="menu"]').exists()).toBe(false);
  });

  it("lists the launch configs when opened", async () => {
    const w = await mountMenu();
    await w.find('[aria-haspopup="menu"]').trigger("click");
    const items = w.findAll('[role="menuitem"]');
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain("Dev server");
  });

  it("closes when cwd changes and does not reappear pre-opened", async () => {
    const w = await mountMenu();
    await w.find('[aria-haspopup="menu"]').trigger("click");
    expect(w.find('[role="menu"]').exists()).toBe(true);

    await w.setProps({ cwd: null }); // unresolved → cleared + closed
    await flushPromises();
    expect(w.find('[aria-haspopup="menu"]').exists()).toBe(false);

    await w.setProps({ cwd: "/proj2" }); // resolves again
    await flushPromises();
    expect(w.find('[aria-haspopup="menu"]').exists()).toBe(true);
    expect(w.find('[role="menu"]').exists()).toBe(false); // not pre-opened
  });

  it("emits the picked config as a launch-source RunCommand with the server-resolved cwd, then closes", async () => {
    const w = await mountMenu();
    await w.find('[aria-haspopup="menu"]').trigger("click");
    await w.findAll('[role="menuitem"]')[1].trigger("click");
    expect(w.emitted("run")?.[0]?.[0]).toEqual({ source: "launch", index: 1, label: "Unit tests", cwd: "/home/me/proj" });
    expect(w.find('[role="menu"]').exists()).toBe(false); // closed after picking
  });
});

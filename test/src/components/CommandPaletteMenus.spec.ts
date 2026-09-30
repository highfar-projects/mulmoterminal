// #2697. The acting terminal's Run-menu scripts and Skill-menu skills are palette rows, and a pick
// runs through the terminal's own paths. Its own file because CommandPalette.spec.ts is at the
// length limit.
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import CommandPalette from "../../../src/components/CommandPalette.vue";
import { closeCommandPalette, openCommandPalette, paletteOpen, providePaletteTerminals } from "../../../src/composables/commandPalette";
import { providePaletteHeaderEntries, type PaletteMenus } from "../../../src/composables/paletteHeaderEntries";

vi.mock("../../../src/composables/voiceModelStatus", () => ({ fetchVoiceInputStatus: async () => ({ capable: false }) }));
vi.mock("../../../src/composables/usePaletteWikiPages", async () => {
  const { ref } = await import("vue");
  return { usePaletteWikiPages: () => ({ pages: ref([]) }) };
});
vi.mock("../../../src/composables/usePaletteResumes", async () => {
  const { ref } = await import("vue");
  return { usePaletteResumes: () => ({ resumes: ref([]), recheck: async () => null }) };
});

// The server resolves the asked-for directory, and a script runs in the one it answered with.
const RESOLVED_DIR = "/work/app";
const fetched: string[] = [];
function stubLists(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetched.push(String(url));
      if (String(url).startsWith("/api/scripts")) {
        return new Response(JSON.stringify({ cwd: RESOLVED_DIR, scripts: [{ index: 2, label: "dev", command: "yarn dev" }] }));
      }
      if (String(url).startsWith("/api/skills")) return new Response(JSON.stringify({ skills: [{ slug: "review", description: "Reviews the diff" }] }));
      return new Response("{}");
    }),
  );
}

const noScroll = function (this: Element): void {};
beforeAll(() => {
  Element.prototype.scrollIntoView = noScroll;
});
let withdraw: (() => void)[] = [];
afterEach(() => {
  withdraw.forEach((undo) => undo());
  withdraw = [];
  fetched.length = 0;
  vi.unstubAllGlobals();
  closeCommandPalette();
  document.body.innerHTML = "";
});

function actingTerminal(menus: PaletteMenus | null): void {
  withdraw.push(
    providePaletteTerminals({
      list: () => [],
      goTo: () => {},
      current: () => 5,
      launchDirs: () => [],
      startDir: () => null,
      full: () => false,
      openSessionIds: () => [],
      promptSource: () => null,
    }),
    providePaletteHeaderEntries("cell-5", { buttons: () => [], commands: () => [], run: () => {}, menus: () => menus }),
  );
}

async function mountPalette(query: string) {
  openCommandPalette();
  const w = mount(CommandPalette, { attachTo: document.body });
  await flushPromises();
  const input = document.querySelector<HTMLInputElement>('[data-testid="command-palette-input"]');
  if (!input) throw new Error("no input");
  input.value = query;
  input.dispatchEvent(new Event("input"));
  await flushPromises();
  return w;
}
const row = (key: string) => document.querySelector<HTMLElement>(`[data-action="${key}"]`);

describe("CommandPalette — the Run and Skill menus' entries", () => {
  it("runs a script in a new command cell, in the directory its list was read for", async () => {
    stubLists();
    const menus = { cwd: "/work/app/", runScript: vi.fn(), runSkill: vi.fn() };
    actingTerminal(menus);
    const w = await mountPalette(">dev");
    expect(fetched).toContain(`/api/scripts?cwd=${encodeURIComponent("/work/app/")}`);
    expect(row("script:2")?.textContent).toContain("Run: dev");
    row("script:2")?.click();
    await flushPromises();
    expect(menus.runScript).toHaveBeenCalledWith({ source: "script", index: 2, label: "dev", cwd: RESOLVED_DIR });
    expect(menus.runSkill).not.toHaveBeenCalled();
    expect(paletteOpen.value).toBe(false);
    w.unmount();
  });

  it("submits a skill into the acting terminal's session", async () => {
    stubLists();
    const menus = { cwd: "/work/app", runScript: vi.fn(), runSkill: vi.fn() };
    actingTerminal(menus);
    const w = await mountPalette(">review");
    expect(row("skill:review")?.textContent).toContain("Skill: /review");
    row("skill:review")?.click();
    await flushPromises();
    expect(menus.runSkill).toHaveBeenCalledWith("review");
    expect(menus.runScript).not.toHaveBeenCalled();
    w.unmount();
  });

  // A command or launcher cell registers no menus: nothing is read and nothing is listed.
  it("lists neither for a terminal that shows no menus", async () => {
    stubLists();
    actingTerminal(null);
    const w = await mountPalette(">");
    expect(fetched.filter((url) => url.startsWith("/api/scripts") || url.startsWith("/api/skills"))).toEqual([]);
    expect(document.querySelector('[data-action^="script:"], [data-action^="skill:"]')).toBeNull();
    w.unmount();
  });
});

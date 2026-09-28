import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";

// #2446. The grid registers its terminals with the palette; going to one from another screen brings
// the grid back as well.
const route = vi.hoisted(() => ({ name: "terminals" as string, pushed: [] as string[] }));
vi.mock("../../../src/router", () => ({
  router: {
    currentRoute: {
      get value() {
        return { name: route.name };
      },
    },
    push: (path: string) => {
      route.pushed.push(path);
      return Promise.resolve();
    },
  },
}));

const { usePaletteTerminals } = await import("../../../src/composables/usePaletteTerminals");
const { paletteTerminals } = await import("../../../src/composables/commandPalette");

const rows = [
  { uid: 1, cwd: "/home/me/app", agent: "claude", memo: null, summary: null },
  { uid: 2, cwd: null, agent: null, memo: null, summary: null },
];

const mountGrid = (jump: (uid: number) => void) =>
  mount(
    defineComponent({
      setup() {
        usePaletteTerminals(() => rows, ref("/home/me"), jump);
        return () => h("div");
      },
    }),
  );

describe("usePaletteTerminals", () => {
  beforeEach(() => {
    route.name = "terminals";
    route.pushed = [];
  });

  it("lists the cells that have a directory, and withdraws them on unmount", () => {
    const w = mountGrid(() => {});
    expect(paletteTerminals.value?.list().map((terminal) => terminal.path)).toEqual(["~/app"]);
    w.unmount();
    expect(paletteTerminals.value).toBeNull();
  });

  it("jumps on the grid without navigating", () => {
    const jump = vi.fn();
    const w = mountGrid(jump);
    paletteTerminals.value?.goTo(1);
    expect(jump).toHaveBeenCalledWith(1);
    expect(route.pushed).toEqual([]);
    w.unmount();
  });

  it("brings the grid back when picked from another screen", () => {
    route.name = "wiki";
    const jump = vi.fn();
    const w = mountGrid(jump);
    paletteTerminals.value?.goTo(1);
    expect(route.pushed).toEqual(["/terminals"]);
    expect(jump).toHaveBeenCalledWith(1);
    w.unmount();
  });
});

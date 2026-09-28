import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import LauncherCell from "../../../src/components/LauncherCell.vue";

// Stub the terminal so no xterm/WebSocket is needed; it just forwards the props the
// cell passes and can emit session/exit.
const pick = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../../src/composables/useHeaderAction", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/composables/useHeaderAction")>()),
  pickFileInto: pick,
}));

vi.mock("../../../src/components/Terminal.vue", () => ({
  default: {
    name: "TerminalView",
    props: ["persistKey", "sessionId", "connectKey", "cwd", "launcher", "hideHeader", "pathMenuPicker"],
    emits: ["session", "exit"],
    template: '<div class="stub-term" />',
  },
}));

const LAUNCHER = { index: 1, label: "zsh" };
const baseProps = { uid: 7, expanded: false, launcher: LAUNCHER, session: null, cwd: "/work/proj", home: "/work" };
const mountCell = (extra: Record<string, unknown> = {}) => mount(LauncherCell, { props: { ...baseProps, ...extra } });

describe("LauncherCell header zoom", () => {
  // #965: the whole cell — header included — sits in one wrapper, so the focus zoom can be
  // cancelled about the cell's own centre. A second element child, or content left outside the
  // wrapper, would scale with the frame and resample the terminal's canvas.
  it("keeps its whole content in the focus-zoom wrapper", () => {
    const root = mountCell().element;
    expect(root.children).toHaveLength(1);
    expect(root.children[0].className).toContain("group-[.focused]/cell:scale-[calc(1/var(--focus-zoom))]");
  });

  it("shows the label + dir and runs the configured launcher in its directory", () => {
    const w = mountCell();
    expect(w.find(".cell-cmd").text()).toContain("zsh");
    const term = w.findComponent({ name: "TerminalView" });
    expect(term.props("launcher")).toEqual({ index: 1 });
    expect(term.props("cwd")).toBe("/work/proj");
  });

  // The path menu is on every cell (#2364). A launcher's terminal is durable, so Insert a file path
  // types into THIS cell's slot, the same key its TerminalView connects with.
  it("offers the path menu, and Insert a file path targets this cell's slot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ githubUrl: null }))),
    );
    const w = mountCell();
    await flushPromises();
    await w.find('[data-testid="cell-dir"]').trigger("click");
    const items = w.findAll('[data-testid="cell-path-item"]');
    expect(items.map((b) => b.text().replace(/^[a-z_]+\s+/, ""))).toEqual([
      "Insert a file path",
      "Reveal in the file manager",
      "Browse files in the app",
      "New terminal here",
    ]);
    await items[0].trigger("click");
    expect(pick).toHaveBeenCalledWith("cell-7", expect.any(Function));
    vi.unstubAllGlobals();
  });

  it("keeps a thumbnail's directory plain, with no menu", () => {
    const w = mountCell({ zoomed: true, expanded: false });
    expect(w.find('[data-testid="cell-dir"]').exists()).toBe(false);
    expect(w.find(".cell-dir-path").text()).toBe("~/proj");
  });

  // A failed drop names the path menu where its Insert a file path is on screen: a tile or the
  // enlarged cell, not a thumbnail, whose header is hidden.
  it("tells the terminal it has a path-menu picker unless it is a thumbnail", () => {
    expect(mountCell().findComponent({ name: "TerminalView" }).props("pathMenuPicker")).toBe(true);
    expect(mountCell({ zoomed: true, expanded: false }).findComponent({ name: "TerminalView" }).props("pathMenuPicker")).toBe(false);
  });

  it("emits toggle-expand and close from the header buttons", async () => {
    const w = mountCell();
    await w.find('[aria-label="Expand terminal"]').trigger("click");
    await w.find('[aria-label="Close terminal"]').trigger("click");
    expect(w.emitted("toggle-expand")).toHaveLength(1);
    expect(w.emitted("close")).toHaveLength(1);
  });

  it("zooms on a header-background click in the normal grid (mirrors clicking the body)", async () => {
    const w = mountCell(); // expanded: false, zoomed: undefined → tiled grid
    expect(w.find(".cell-header").classes()).toContain("is-zoomable");
    await w.find(".cell-header").trigger("click");
    expect(w.emitted("toggle-expand")).toHaveLength(1);
  });

  it("zooms on a header-background click when it's a filmstrip thumbnail", async () => {
    const w = mountCell({ zoomed: true }); // some other cell is zoomed → this is a thumbnail
    expect(w.find(".cell-header").classes()).toContain("is-zoomable");
    await w.find(".cell-header").trigger("click");
    expect(w.emitted("toggle-expand")).toHaveLength(1);
  });

  it("does not zoom on a header-background click while expanded (restore via the ⤡ button)", async () => {
    const w = mountCell({ expanded: true });
    expect(w.find(".cell-header").classes()).not.toContain("is-zoomable");
    await w.find(".cell-header").trigger("click");
    expect(w.emitted("toggle-expand")).toBeUndefined();
  });

  // #2007. A launcher cell has no `toggle-park` in its event binding (cellShellEvents), so a park
  // button here is one that clicks and does nothing. It shipped that way for eleven releases: the
  // guard in CellChromeButtons asked whether `parked` was undefined, and Vue casts an absent
  // boolean prop to `false`. Mounted here rather than only on the buttons because this — a cell
  // the user actually opens — is where it was visible.
  it("offers no park button: a launched program is not a session to set aside", () => {
    expect(mountCell().find('[data-testid="cell-park-btn"]').exists()).toBe(false);
    expect(mountCell({ expanded: true }).find('[data-testid="cell-park-btn"]').exists()).toBe(false);
  });

  // A thumbnail looks the same whatever the cell runs: the directory and close.
  describe("as a filmstrip thumbnail", () => {
    const thumb = () => mountCell({ zoomed: true, expanded: false, reorderable: true, session: "s-1" });

    it("keeps only close in its header", () => {
      const w = thumb();
      expect(w.findAll(".cell-actions button").map((b) => b.attributes("aria-label"))).toEqual(["Close terminal"]);
    });

    it("drops the name badge, which does not shrink and pushed close out of a thumbnail", () => {
      const w = mount(LauncherCell, { props: { ...baseProps, cwd: "/work", defaultCwd: "/work", zoomed: true, expanded: false } });
      expect(w.findComponent({ name: "DirBadge" }).exists()).toBe(false);
      const tile = mount(LauncherCell, { props: { ...baseProps, cwd: "/work", defaultCwd: "/work" } });
      expect(tile.findComponent({ name: "DirBadge" }).exists()).toBe(true);
    });

    it("drops the program's name, keeping its icon", () => {
      expect(thumb().find(".cell-cmd").text()).toBe("rocket_launch");
    });

    it("hides the terminal's own header row", () => {
      expect(thumb().findComponent({ name: "TerminalView" }).props("hideHeader")).toBe(true);
    });

    it("keeps everything when it is the enlarged cell or a tile", () => {
      const enlarged = mountCell({ zoomed: true, expanded: true, reorderable: true });
      expect(enlarged.find('[aria-label="Move launcher left"]').exists()).toBe(true);
      expect(enlarged.findComponent({ name: "TerminalView" }).props("hideHeader")).toBe(false);
      expect(mountCell({ zoomed: false, reorderable: true }).find(".cell-cmd").text()).toContain("zsh");
    });
  });
});

// A launcher cannot be set aside or marked, so its thumbnail menu is moving and closing.
describe("LauncherCell thumbnail row menu", () => {
  it("routes move and close from the thumbnail's ⋮", async () => {
    const rowMenu = { canUp: true, canDown: true, reorderable: true, attention: null, parkable: false, parked: false };
    const w = mountCell({ zoomed: true, expanded: false, rowMenu });
    const pick = async (id: string) => {
      await w.find('[data-testid="cockpit-row-menu"]').trigger("click");
      document.body.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)?.click();
      await flushPromises();
    };
    await pick("reorder-up");
    await pick("row-close");
    expect(w.emitted("move")).toEqual([[-1]]);
    expect(w.emitted("close")).toHaveLength(1);
    expect(document.body.querySelector('[data-testid="row-park"]')).toBeNull();
    w.unmount();
  });
});

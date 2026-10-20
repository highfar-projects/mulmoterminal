import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import FilesPane from "../../../src/components/FilesPane.vue";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import { oneFile } from "./filesPaneFixture";
import { isRecord } from "../../../common/isRecord";
import type { FilesPaneState } from "../../../src/components/filesPaneState";

vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: () => fakeCmEditor("# hello") };
});

// #3122. Leaving a cell for one whose right pane is not files unmounts this pane; coming back mounts
// a new one from the snapshot. The side-by-side switch has to be in that snapshot to survive.
const callExposed = async (w: VueWrapper, name: "snapshot" | "reload"): Promise<unknown> => {
  const exposed: unknown = Reflect.get(w.vm, name);
  if (typeof exposed !== "function") throw new Error(`FilesPane exposes no ${name}`);
  return await exposed();
};

const sideBySidePressed = (w: VueWrapper) => w.get('[data-testid="files-side-by-side"]').attributes("aria-pressed");

const isPaneState = (value: unknown): value is FilesPaneState => isRecord(value) && Array.isArray(value.tabs) && Array.isArray(value.expanded);

const mountOn = async (initialState: FilesPaneState) => {
  const w = mount(FilesPane, { props: { cwd: "/proj", initialState } });
  await flushPromises();
  return w;
};

describe("FilesPane remembering side by side", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/list")) return { ok: true, json: async () => ({ entries: [{ name: "README.md", dir: false, size: 10 }] }) };
        if (url.includes("/text")) return { ok: true, json: async () => ({ text: "# hello", version: "v1" }) };
        return { ok: true, json: async () => ({ ok: true, version: "v2" }) };
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("comes back side by side in a pane mounted from what it left behind", async () => {
    const before = await mountOn(oneFile("README.md"));
    await before.get('[data-testid="files-side-by-side"]').trigger("click");
    await flushPromises();
    expect(sideBySidePressed(before)).toBe("true");
    const left = await callExposed(before, "snapshot");
    before.unmount();
    if (!isPaneState(left)) throw new Error("the snapshot is not a pane state");

    const after = await mountOn(left);
    expect(sideBySidePressed(after)).toBe("true");
  });

  // The other way round: two cells that both show files keep ONE pane, which reloads in place — here
  // onto a cell with nothing remembered, where no restore runs to say "off".
  it("drops the switch when it reloads onto a cell with nothing remembered", async () => {
    const w = await mountOn(oneFile("README.md"));
    await w.get('[data-testid="files-side-by-side"]').trigger("click");
    await flushPromises();
    await w.setProps({ initialState: null });
    await callExposed(w, "reload");
    await flushPromises();
    // No file is open, so there is no button to read; the snapshot is what the next cell inherits.
    expect(await callExposed(w, "snapshot")).not.toHaveProperty("sideBySide");
  });

  // Two reloads in quick succession — the zoom walked on before the first one's tree arrived, and it
  // arrives last. The first start must not put its cell's switch on the second cell's pane.
  it("does not let a start that a later reload replaced turn the switch on", async () => {
    const w = await mountOn(oneFile("README.md"));
    let releaseList: () => void = () => {};
    const listGate = new Promise<void>((resolve) => (releaseList = resolve));
    const served = vi.mocked(globalThis.fetch).getMockImplementation();
    let gated = false;
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      // Only the FIRST start's tree read is held, so it lands after the second start has finished.
      if (String(input).includes("/list") && !gated) {
        gated = true;
        await listGate;
      }
      return served ? served(input, init) : Promise.reject(new Error("no fetch"));
    });
    await w.setProps({ initialState: { ...oneFile("README.md"), sideBySide: true } });
    const stale = callExposed(w, "reload");
    await w.setProps({ initialState: null });
    await callExposed(w, "reload");
    releaseList();
    await stale;
    await flushPromises();
    expect(await callExposed(w, "snapshot")).not.toHaveProperty("sideBySide");
  });

  // The switch is the pane's: a file opened FOR this start (a clicked path) keeps it, as it would in
  // a pane that had stayed open. Unlike the Canvas view (#1979), which belongs to a file.
  it("keeps the remembered switch for a file the pane was opened for", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj", initialState: { ...oneFile(null), sideBySide: true }, requestedPath: "README.md" } });
    await flushPromises();
    expect(sideBySidePressed(w)).toBe("true");
  });
});

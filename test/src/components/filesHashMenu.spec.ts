import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FilesPane from "../../../src/components/FilesPane.vue";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";

// The Files tree's "Get SHA-256 hash" (fork-only), from the row menu to the dialog: the server is
// asked for the row's file under the pane's root, and what it answers is what the dialog shows and
// what Copy puts on the clipboard. What the menu OFFERS is filesRowActions' job and tested there.

const fakeEditor = fakeCmEditor("");
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: () => fakeEditor };
});

const DIGEST = "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03";
const hashUrls: string[] = [];

function mockFs(hashAnswer: { ok: boolean; status?: number; body: unknown }) {
  hashUrls.length = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/list")) return { ok: true, json: async () => ({ entries: [{ name: "app.zip", dir: false, size: 6 }] }) };
    if (url.includes("/sha256")) {
      hashUrls.push(url);
      return { ok: hashAnswer.ok, status: hashAnswer.status ?? 200, json: async () => hashAnswer.body };
    }
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
}

const mountPane = async () => {
  const w = mount(FilesPane, {
    props: { cwd: "/proj", insertTarget: true, insertTargetCwd: "/proj" },
    attachTo: document.body,
    global: { stubs: { FilesCanvasView: true } },
  });
  await flushPromises();
  return w;
};

const byTestId = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function pickHash(w: Awaited<ReturnType<typeof mountPane>>): Promise<void> {
  w.findAll('[data-testid="files-row"]')[0].element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }));
  await flushPromises();
  byTestId("files-row-action-sha256")?.click();
  await flushPromises();
}

describe("the row menu's SHA-256 entry", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("when the server answers", () => {
    beforeEach(() => mockFs({ ok: true, body: { sha256: DIGEST, size: 6 } }));

    it("asks for the row's file under the pane's root and shows the digest", async () => {
      const w = await mountPane();
      await pickHash(w);
      expect(hashUrls).toHaveLength(1);
      const asked = new URL(hashUrls[0], "https://x");
      expect(asked.pathname).toBe("/api/files/browse/sha256");
      expect(asked.searchParams.get("cwd")).toBe("/proj");
      expect(asked.searchParams.get("path")).toBe("app.zip");
      expect(byTestId("files-hash-dialog")?.textContent).toContain("app.zip");
      expect(byTestId("files-hash-value")).toHaveProperty("value", DIGEST);
    });

    it("copies exactly the digest", async () => {
      const writeText = vi.fn(async () => {});
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
      Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
      const w = await mountPane();
      await pickHash(w);
      byTestId("files-hash-copy")?.click();
      await flushPromises();
      expect(writeText).toHaveBeenCalledWith(DIGEST);
    });

    it("goes away on Close", async () => {
      const w = await mountPane();
      await pickHash(w);
      const close = [...(byTestId("files-hash-dialog")?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === "Close");
      close?.click();
      await flushPromises();
      expect(byTestId("files-hash-dialog")).toBeNull();
    });
  });

  it("says why when the server could not hash the file", async () => {
    mockFs({ ok: false, status: 404, body: { error: "not found" } });
    const w = await mountPane();
    await pickHash(w);
    expect(byTestId("files-hash-error")?.textContent).toContain("not found");
    expect(byTestId("files-hash-copy")).toBeNull();
  });
});

import { describe, it, expect, vi } from "vitest";
import { useFilesGallery } from "../../../src/composables/useFilesGallery";

const listing = (names: string[]) => ({ ok: true, json: async () => ({ entries: names.map((name) => ({ name, dir: false, size: 1 })) }) });

describe("useFilesGallery", () => {
  // A slow folder must not land over the one opened after it, or over a gallery already closed.
  it("keeps only the newest folder's listing", async () => {
    const answers: Array<(value: unknown) => void> = [];
    globalThis.fetch = vi.fn(() => new Promise((resolve) => answers.push(resolve))) as unknown as typeof fetch;
    const gallery = useFilesGallery(() => "/proj");
    const slow = gallery.open("old");
    const fresh = gallery.open("new");
    answers[1]?.(listing(["n.png"]));
    await fresh;
    answers[0]?.(listing(["o.png"]));
    await slow;
    expect(gallery.dir.value).toBe("new");
    expect(gallery.items.value?.map((item) => item.pathRel)).toEqual(["new/n.png"]);
  });

  it("drops a listing that lands after the gallery was closed", async () => {
    let answer: (value: unknown) => void = () => {};
    globalThis.fetch = vi.fn(() => new Promise((resolve) => (answer = resolve))) as unknown as typeof fetch;
    const gallery = useFilesGallery(() => "/proj");
    const opening = gallery.open("shots");
    gallery.close();
    answer(listing(["a.png"]));
    await opening;
    expect(gallery.dir.value).toBeNull();
    expect(gallery.items.value).toBeNull();
  });

  it("says which folder could not be read", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
    const gallery = useFilesGallery(() => "/proj");
    await gallery.open("gone");
    expect(gallery.error.value).toBe("gone: HTTP 404");
  });
});

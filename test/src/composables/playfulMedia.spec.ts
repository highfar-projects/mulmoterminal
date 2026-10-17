// The browser's copy of the user's playfulEffects files: only what the server lists under its own
// route, and only the newest read.
import { describe, it, expect, afterEach, vi } from "vitest";
import { loadPlayfulMedia, playfulMedia } from "../../../src/composables/playfulMedia";

const listing = (index: number) => ({ builtIn: false, items: [{ media: { kind: "image", url: `/api/playful-media/${index}?v=1` }, finale: null }] });
const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

afterEach(async () => {
  vi.stubGlobal("fetch", async () => answer({ builtIn: true, items: [] }));
  await loadPlayfulMedia();
  vi.unstubAllGlobals();
});

describe("loadPlayfulMedia", () => {
  it("holds what the server lists", async () => {
    vi.stubGlobal("fetch", async () => answer(listing(0)));
    await loadPlayfulMedia();
    expect(playfulMedia.value).toEqual(listing(0));
  });

  // A reload while an earlier read is still on its way must not be undone by that read landing last.
  it("keeps the newest read when an older one lands after it", async () => {
    const pending: Array<(response: Response) => void> = [];
    vi.stubGlobal("fetch", () => new Promise<Response>((resolve) => pending.push(resolve)));
    const older = loadPlayfulMedia();
    const newer = loadPlayfulMedia();
    pending[1]?.(answer(listing(1)));
    await newer;
    pending[0]?.(answer(listing(0)));
    await older;
    expect(playfulMedia.value).toEqual(listing(1));
  });

  it("keeps the last good list when a read fails", async () => {
    vi.stubGlobal("fetch", async () => answer(listing(0)));
    await loadPlayfulMedia();
    vi.stubGlobal("fetch", async () => new Response("", { status: 500 }));
    await loadPlayfulMedia();
    expect(playfulMedia.value).toEqual(listing(0));
  });
});

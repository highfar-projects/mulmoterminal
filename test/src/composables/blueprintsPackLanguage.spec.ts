// The form asks for the packs in the screen's language, so the server can lay their English words over them.
import { describe, it, expect, vi, afterEach } from "vitest";
import { listPacks, listPresets, previewPair } from "../../../src/composables/blueprintsApi";
import { i18n } from "../../../src/i18n";

const urls: string[] = [];
const answering = (body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );

describe("the pack calls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    urls.length = 0;
    i18n.global.locale.value = "en";
  });

  it("name the screen's language", async () => {
    i18n.global.locale.value = "ja";
    answering({ packs: [] });
    await listPacks();
    answering({ presets: [] });
    await listPresets();
    answering({ hearing: { questions: [{ id: "a", label: "a", why: "w", kind: "text" }] }, steps: [] });
    await previewPair("docs", "polish");
    expect(urls).toEqual(["/api/blueprints/packs?lang=ja", "/api/blueprints/presets?lang=ja", "/api/blueprints/pairs/docs/polish?lang=ja"]);
  });
});

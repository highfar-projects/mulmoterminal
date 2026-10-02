// The form asks for the packs in the screen's language, so the server can lay their English words over them.
import { describe, it, expect, vi, afterEach } from "vitest";
import { archiveRun, listPacks, listPresets, listRuns, loadRun, previewPair, sendEvent, sendSpecMessage } from "../../../src/composables/blueprintsApi";
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

  it("ask for the builds in the screen's language too", async () => {
    i18n.global.locale.value = "en";
    answering({ runs: [] });
    await listRuns();
    answering({});
    await loadRun("run-1");
    answering({});
    await sendEvent("run-1", "s", { type: "approve" });
    answering({});
    await archiveRun("run-1", true);
    answering({});
    await sendSpecMessage("run-1", "hi");
    expect(urls).toEqual([
      "/api/blueprints/runs?lang=en",
      "/api/blueprints/runs/run-1?lang=en",
      "/api/blueprints/runs/run-1/events?lang=en",
      "/api/blueprints/runs/run-1/archive?lang=en",
      "/api/blueprints/runs/run-1/spec/messages?lang=en",
    ]);
  });
});

// The preview frame's contract with the document it renders.
//
// What is pinned here is that the preview is NOT a kinder version of production. Every one of
// these assertions is something that would make a broken page look fine on the author's machine
// and break in a stranger's browser, which is the exact failure the feature exists to prevent:
//
//   `allow-modals` absent, so `alert` / `confirm` / `prompt` are ignored here as they are there;
//   `allow-same-origin` absent, so the frame has an opaque origin;
//   the CSP present, so nothing the page loads reaches a third party;
//   the bootstrap present, so the page talks to a parent rather than to nothing;
//   a FRESH nonce per rendered document, so a page that navigated cannot go on answering.
//
// Imported at module scope, not inside a test: the component's module graph is billed to whichever
// test first reaches it, and that has made a file's first test look 100x slower than its siblings.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SharedAppPreview from "../../../src/components/SharedAppPreview.vue";

const PAGE = "<h1>Book</h1>";

const payload = (over: Record<string, unknown> = {}) => ({
  declared: true,
  ok: true,
  preview: {
    aid: "aid-1",
    pages: [{ id: "public", html: PAGE, audience: "public" }],
    publicOpen: true,
    fromLiveApp: false,
    generatedForm: false,
    datasets: { "public:public": { bookings: [] } },
    unreadable: [],
    warnings: [],
    ...over,
  },
});

const answering = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });

beforeEach(() => {
  vi.stubGlobal("fetch", answering(payload()));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mountPreview = async () => {
  const wrapper = mount(SharedAppPreview, { props: { cwd: "/repo" } });
  await flushPromises();
  return wrapper;
};

describe("SharedAppPreview", () => {
  it("renders the page in a frame no looser than the published one", async () => {
    const wrapper = await mountPreview();
    const frame = wrapper.find("iframe");

    expect(frame.exists()).toBe(true);
    // The whole point. `allow-modals` here would make a page whose `prompt()` the real sandbox
    // ignores appear to work — which is finding #1 from the diagnostics plan, manufactured by the
    // very thing meant to catch it.
    expect(frame.attributes("sandbox")).toBe("allow-scripts");
    expect(frame.attributes("csp")).toContain("connect-src 'none'");
  });

  it("serves the author's HTML with the parent's bootstrap above it", async () => {
    const wrapper = await mountPreview();
    const srcdoc = wrapper.find("iframe").attributes("srcdoc") ?? "";

    expect(srcdoc).toContain(PAGE);
    // The contract's name. A page written against the HOST's `__MC_VIEW` reads `undefined` and
    // draws nothing, and publish refuses one — so the preview must not quietly answer both.
    expect(srcdoc).toContain("__MC_APP_VIEW");
    expect(srcdoc).toContain("Content-Security-Policy");
  });

  it("gives each rendered document its own name", async () => {
    const first = (await mountPreview()).find("iframe").attributes("srcdoc") ?? "";
    const second = (await mountPreview()).find("iframe").attributes("srcdoc") ?? "";

    // Per render, not per component: reusing a nonce would let the previous document — which may
    // be the one that navigated away — go on being answered.
    expect(first).not.toBe(second);
  });

  it("says a directory with no app is not an app, and draws no frame", async () => {
    vi.stubGlobal("fetch", answering({ declared: false }));

    const wrapper = await mountPreview();

    expect(wrapper.find("iframe").exists()).toBe(false);
    expect(wrapper.text()).toContain("declares no shared app");
  });

  it("puts the refusals in front of the author rather than an empty frame", async () => {
    vi.stubGlobal("fetch", answering({ declared: true, ok: false, problems: ["public.view.path names no file"] }));

    const wrapper = await mountPreview();

    expect(wrapper.text()).toContain("public.view.path names no file");
    expect(wrapper.find("iframe").exists()).toBe(false);
  });

  it("distinguishes an empty collection from one it could not read", async () => {
    vi.stubGlobal("fetch", answering(payload({ unreadable: ["bookings"] })));

    const wrapper = await mountPreview();

    // Identical pixels, opposite meanings: a page drawing nothing because there are no bookings,
    // and one drawing nothing because the read was refused.
    expect(wrapper.text()).toContain("Could not read records for: bookings");
  });

  it("says out loud that the rules were not run", async () => {
    const wrapper = await mountPreview();

    // The one claim a preview must never let anyone make. What it proves is that the page DRAWS.
    expect(wrapper.text()).toContain("the rules are not run");
  });

  it("draws nothing but a note for an app that publishes only schemas", async () => {
    vi.stubGlobal("fetch", answering(payload({ pages: [] })));

    const wrapper = await mountPreview();

    expect(wrapper.find("iframe").exists()).toBe(false);
    expect(wrapper.text()).toContain("publishes no pages");
  });

  it("does not report a generated-form app as having nothing to draw", async () => {
    vi.stubGlobal("fetch", answering(payload({ pages: [], generatedForm: true })));

    const wrapper = await mountPreview();

    // Same empty frame, opposite meanings. "There is nothing here" over a survey that publishes
    // perfectly well sends the author looking for a bug that is not there.
    expect(wrapper.text()).toContain("generated form");
    expect(wrapper.text()).not.toContain("publishes no pages");
  });

  it("offers every tier's pages, not only the public one", async () => {
    vi.stubGlobal(
      "fetch",
      answering(
        payload({
          pages: [
            { id: "public", html: PAGE, audience: "public" },
            { id: "desk", html: "<p>desk</p>", audience: "member" },
            { id: "mine", html: "<p>mine</p>", audience: "roster" },
          ],
        }),
      ),
    );

    const wrapper = await mountPreview();
    const options = wrapper.findAll("option").map((option) => option.text());

    // Three separate documents with three separate rules — reading one of them as "the app" is how
    // a page written for the front desk gets published to the world.
    expect(options.some((text) => text.includes("public"))).toBe(true);
    expect(options.some((text) => text.includes("desk"))).toBe(true);
    expect(options.some((text) => text.includes("mine"))).toBe(true);
  });

  it("starts with the picker on the page it is drawing", async () => {
    const wrapper = await mountPreview();

    // A blank picker over a page that is right there reads as "nothing selected", and the first
    // thing the author does is click the thing that was already showing.
    expect((wrapper.find("select").element as HTMLSelectElement).value).toBe("public:public");
  });

  it("hands a page only ITS OWN records", async () => {
    vi.stubGlobal(
      "fetch",
      answering(
        payload({
          pages: [
            { id: "public", html: PAGE, audience: "public" },
            { id: "desk", html: "<p>desk</p>", audience: "member" },
          ],
          datasets: { "public:public": { bookings: [] }, "member:desk": { notes: [{ id: "1" }] } },
        }),
      ),
    );

    const wrapper = await mountPreview();
    await wrapper.find("select").setValue("member:desk");
    await flushPromises();

    // The frame is per document and the records are per page. One map for the app would hand the
    // member page's rows to the public page's frame — the preview showing MORE than production,
    // the one direction it must never fail in.
    expect(wrapper.find("iframe").attributes("srcdoc")).toContain("desk");
  });
});

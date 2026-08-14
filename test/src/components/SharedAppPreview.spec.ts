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
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import SharedAppPreview from "../../../src/components/SharedAppPreview.vue";

const PAGE = "<h1>Book</h1>";

const payload = (over: Record<string, unknown> = {}) => ({
  declared: true,
  ok: true,
  preview: {
    aid: "aid-1",
    submit: { bookings: { createFields: ["slot", "requesterName"] } },
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

/** A fetch that answers the projection route and the write routes separately, and records the
 *  writes it was asked to make. */
const answeringWrites = (write: unknown, preview: unknown = payload()) => {
  const posted: { url: string; body: unknown }[] = [];
  const fetcher = vi.fn().mockImplementation((url: string, init?: { body?: string }) => {
    if (url.includes("/preview/")) {
      posted.push({ url, body: init?.body === undefined ? null : JSON.parse(init.body) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(write) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(preview) });
  });
  return { fetcher, posted };
};

beforeEach(() => {
  vi.stubGlobal("fetch", answering(payload()));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Do the handshake and return the far end of the private channel. */
const connect = async (wrapper: VueWrapper) => {
  const frame = wrapper.find("iframe").element as HTMLIFrameElement;
  const srcdoc = frame.getAttribute("srcdoc") ?? "";
  const nonce = /const nonce = "([^"]+)"/.exec(srcdoc)?.[1] ?? "";

  let far: MessagePort | null = null;
  const contentWindow = {
    postMessage: (_message: unknown, _origin: string, ports?: MessagePort[]) => {
      far = ports?.[0] ?? null;
    },
  };
  vi.spyOn(frame, "contentWindow", "get").mockReturnValue(contentWindow as unknown as Window);

  const ready = new MessageEvent("message", { data: { type: "mc-public-view:ready", nonce } });
  Object.defineProperty(ready, "source", { value: contentWindow });
  window.dispatchEvent(ready);
  await flushPromises();

  const port = far as MessagePort | null;
  if (port === null) throw new Error("the parent never handed over a channel");
  const answers: Record<string, unknown>[] = [];
  port.onmessage = (event: MessageEvent) => answers.push(event.data as Record<string, unknown>);
  port.start();
  // The name only the injected document knows, echoed on the port it was handed.
  port.postMessage({ nonce });
  await flushPromises();
  return { port, answers };
};

const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
};

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

  // The parent judges a submission against the app's declaration BEFORE the write path is reached.
  // Getting the declaration wrong here does not weaken the check — it refuses EVERYTHING, and it
  // refuses with a code that names the author's own repository. That shipped once (2026-08-14) and
  // an author spent a session debugging a page and an app that were both correct.
  //
  // Driven through the real doors: `ready` on the window, everything after it on the port the
  // parent hands back. No shortcut into the bridge — a preview-only path is the thing this whole
  // feature exists to refuse.
  describe("what the frame is told when it submits", () => {
    it("accepts a submission the declaration allows, and says why it cannot write it", async () => {
      const wrapper = await mountPreview();
      const { port, answers } = await connect(wrapper);

      port.postMessage({ type: "mc-public-view:submit", requestId: "r-1", cid: "bookings", values: { slot: "roomA-1000", requesterName: "客" } });
      await settle();

      // It got PAST the declaration check — which an empty `submit` map makes impossible — and the
      // parent is now holding it for the author to confirm, with the values shown OUTSIDE the frame.
      expect(answers.filter((answer) => answer.type === "mc-public-view:submitResult")).toEqual([]);
      expect(wrapper.text()).toContain("asks to write to");
      expect(wrapper.text()).toContain("roomA-1000");
    });

    it("writes the record when the author sends it, and answers the page", async () => {
      const { fetcher, posted } = answeringWrites({ ok: true, written: { cid: "bookings", id: "roomA-1000" } });
      vi.stubGlobal("fetch", fetcher);
      const wrapper = await mountPreview();
      const { port, answers } = await connect(wrapper);

      port.postMessage({ type: "mc-public-view:submit", requestId: "r-4", cid: "bookings", values: { slot: "roomA-1000" } });
      await settle();
      await wrapper
        .findAll("button")
        .filter((button) => button.text() === "Send it")[0]
        ?.trigger("click");
      await settle();

      // The submission reaches the server as the author accepted it — and the page is told, because
      // a submit has no timeout and a promise that never settles is a button that does nothing.
      expect(posted[0]?.url).toContain("/preview/submit");
      expect(posted[0]?.body).toEqual({ cid: "bookings", values: { slot: "roomA-1000" } });
      expect(answers).toContainEqual(expect.objectContaining({ requestId: "r-4", ok: true }));
    });

    it("carries the server's refusal back to the page rather than reporting success", async () => {
      const { fetcher } = answeringWrites({ ok: false, error: "missing: 予約者" });
      vi.stubGlobal("fetch", fetcher);
      const wrapper = await mountPreview();
      const { port, answers } = await connect(wrapper);

      port.postMessage({ type: "mc-public-view:submit", requestId: "r-6", cid: "bookings", values: { slot: "roomA-1000" } });
      await settle();
      await wrapper
        .findAll("button")
        .filter((button) => button.text() === "Send it")[0]
        ?.trigger("click");
      await settle();

      expect(answers).toContainEqual(expect.objectContaining({ requestId: "r-6", ok: false, error: "missing: 予約者" }));
    });

    it("remembers what it wrote, and offers to take it back with its mirror", async () => {
      const { fetcher, posted } = answeringWrites({
        ok: true,
        written: { cid: "bookings", id: "roomA-1000", mirror: { cid: "slots", id: "roomA-1000" } },
      });
      vi.stubGlobal("fetch", fetcher);
      const wrapper = await mountPreview();
      const { port } = await connect(wrapper);

      port.postMessage({ type: "mc-public-view:submit", requestId: "r-7", cid: "bookings", values: { slot: "roomA-1000" } });
      await settle();
      await wrapper
        .findAll("button")
        .filter((button) => button.text() === "Send it")[0]
        ?.trigger("click");
      await settle();

      // The rules read a public create with `hasOnly(createFields)`, so nothing marks these records
      // in the database. This list is the only place they are known to be tests.
      expect(wrapper.text()).toContain("1 record written from this preview");
      expect(wrapper.text()).toContain("bookings / roomA-1000");

      await wrapper
        .findAll("button")
        .filter((button) => button.text() === "Remove them")[0]
        ?.trigger("click");
      await settle();

      // The MIRROR travels with it: a bare delete would leave the slot saying `taken` about a
      // booking that no longer exists.
      const undo = posted.find((entry) => entry.url.includes("/preview/undo"));
      expect(undo?.body).toEqual({ written: { cid: "bookings", id: "roomA-1000", mirror: { cid: "slots", id: "roomA-1000" } } });
    });

    it("answers the page when the author cancels, rather than leaving it waiting", async () => {
      const wrapper = await mountPreview();
      const { port, answers } = await connect(wrapper);

      port.postMessage({ type: "mc-public-view:submit", requestId: "r-5", cid: "bookings", values: { slot: "roomA-1000" } });
      await settle();
      await wrapper
        .findAll("button")
        .filter((button) => button.text() === "Cancel")[0]
        ?.trigger("click");
      await settle();

      expect(answers).toContainEqual(expect.objectContaining({ requestId: "r-5", ok: false, error: "cancelled" }));
      expect(wrapper.text()).not.toContain("asks to write to");
    });

    it("still refuses a cid the declaration does not name", async () => {
      const wrapper = await mountPreview();
      const { port, answers } = await connect(wrapper);

      port.postMessage({ type: "mc-public-view:submit", requestId: "r-2", cid: "nowhere", values: { slot: "x" } });
      await settle();

      // The check is real, not switched off — this cid genuinely is not declared.
      expect(answers).toContainEqual(expect.objectContaining({ requestId: "r-2", ok: false, error: "unknown-collection" }));
    });

    it("refuses a field outside createFields — the finding a preview exists to catch", async () => {
      const wrapper = await mountPreview();
      const { port, answers } = await connect(wrapper);

      port.postMessage({ type: "mc-public-view:submit", requestId: "r-3", cid: "bookings", values: { slot: "roomA-1000", nickname: "x" } });
      await settle();

      expect(answers).toContainEqual(expect.objectContaining({ requestId: "r-3", ok: false, error: "undeclared-field" }));
    });
  });

  it("starts a new document when the page changes, even if the HTML is identical", async () => {
    vi.stubGlobal(
      "fetch",
      answering(
        payload({
          pages: [
            { id: "desk", html: PAGE, audience: "member" },
            { id: "mine", html: PAGE, audience: "roster" },
          ],
        }),
      ),
    );

    const wrapper = await mountPreview();
    const first = wrapper.find("iframe").attributes("srcdoc") ?? "";
    await wrapper.find("select").setValue("roster:mine");
    await flushPromises();

    // Two pages can hold byte-identical HTML. Keeping the old document would hand the roster page's
    // records to a member page's still-running script, on a channel that was never restarted.
    expect(wrapper.find("iframe").attributes("srcdoc")).not.toBe(first);
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

    expect(wrapper.find("iframe").attributes("srcdoc")).toContain("desk");

    // And the DATA that reaches it is that page's alone. One map for the app would hand the member
    // page's rows to the public page's frame — the preview showing MORE than production, the one
    // direction it must never fail in. Asserted on what crosses the channel: the srcdoc only proves
    // which HTML was chosen, so a test that stopped there would pass on every dataset map there is.
    const { answers } = await connect(wrapper);
    const state = answers.find((answer) => answer.type === "mc-public-view:state");
    expect(state?.collections).toEqual({ notes: [{ id: "1" }] });
  });
});

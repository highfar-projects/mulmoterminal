// Which files the Canvas can be asked to open, and what card is written for them (#1374).
//
// The gates are the PLUGINS' own (`isDocumentPath`, `isPresentableHtmlPath`), so what is pinned
// here is that this module actually defers to them rather than re-deciding with a weaker extension
// test — the traversal and dotfile cases below are the ones a hand-rolled `.endsWith(".md")` would
// wave through.
import { describe, it, expect, vi, afterEach } from "vitest";

import {
  canvasCardForFile,
  canOpenInCanvas,
  absoluteUnder,
  storyWirePath,
  buildCanvasCard,
  seedCanvasCard,
  hasStoredCard,
} from "../../../src/composables/canvasOpenFile";

describe("canvasCardForFile", () => {
  it("renders a markdown document through presentDocument, keyed by its path", () => {
    expect(canvasCardForFile("docs/design.md")).toEqual({
      toolName: "presentDocument",
      // `markdown: ""` is required by MarkdownToolData; `docPath` is what documentPathOf reads.
      data: { markdown: "", docPath: "docs/design.md" },
    });
  });

  it("takes a markdown file from anywhere in the workspace, not only the artifacts area", () => {
    expect(canvasCardForFile("README.md")?.toolName).toBe("presentDocument");
  });

  // Inside artifacts the View could derive this URL itself; it is set anyway so the card does not
  // depend on a fallback that only holds for one of the two locations.
  it("points an artifacts page at the artifacts mount", () => {
    expect(canvasCardForFile("artifacts/html/page.html")).toEqual({
      toolName: "presentHtml",
      data: { filePath: "artifacts/html/page.html", previewUrl: "/artifacts/html/page.html" },
    });
  });

  // The case the View's fallback gets WRONG. The Files pane is rooted at the cell's cwd, so most
  // html a user opens is outside artifacts; deriving `/artifacts/html/…` for it would point the
  // iframe at nothing.
  it("points a page outside artifacts at the /htmlfile mount instead", () => {
    expect(canvasCardForFile("site/index.html")).toEqual({
      toolName: "presentHtml",
      data: { filePath: "site/index.html", previewUrl: "/htmlfile/ws/site/index.html" },
    });
  });

  it("has nothing to show for a file neither plugin renders", () => {
    expect(canvasCardForFile("notes.txt")).toBeNull();
    expect(canvasCardForFile("src/main.ts")).toBeNull();
  });

  // Both of these END in a renderable extension, so an extension test would accept them. The
  // plugins refuse them — a prefixed traversal, and a dotfile segment the iframe mount denies.
  it("refuses a path the plugin's own guard refuses", () => {
    expect(canvasCardForFile("artifacts/documents/../../secrets.md")).toBeNull();
    expect(canvasCardForFile(".hidden/x.html")).toBeNull();
  });
});

describe("canOpenInCanvas", () => {
  it("answers for the button's sake, and says no when nothing is open", () => {
    expect(canOpenInCanvas("docs/design.md")).toBe(true);
    expect(canOpenInCanvas("site/index.html")).toBe(true);
    expect(canOpenInCanvas("notes.txt")).toBe(false);
    expect(canOpenInCanvas(null)).toBe(false);
  });
});

// The bug the browser found: the Files pane is rooted at the CELL's directory while the plugins
// resolve against the WORKSPACE, so a bare `design.md` from a project cell named a workspace file
// that does not exist — the card was written, the pane opened, and nothing rendered.
describe("absoluteUnder", () => {
  it("puts the pane's relative row under the cell's directory", () => {
    expect(absoluteUnder("/work/proj", "docs/design.md")).toBe("/work/proj/docs/design.md");
  });

  it("does not double the separator", () => {
    expect(absoluteUnder("/work/proj/", "design.md")).toBe("/work/proj/design.md");
  });

  // Joined with `/` on every platform. Both plugin gates accept the mixed result and htmlFileUrl
  // normalises it, so there is no separator arithmetic to get wrong per-OS.
  it("leaves a Windows directory alone and still produces a path the gates accept", () => {
    const joined = absoluteUnder("C:\\Users\\me\\proj", "docs/design.md");
    expect(joined).toBe("C:\\Users\\me\\proj/docs/design.md");
    expect(canvasCardForFile(joined)?.toolName).toBe("presentDocument");
  });

  it("passes the path through when there is no cwd to anchor it to", () => {
    expect(absoluteUnder(null, "design.md")).toBe("design.md");
  });
});

// The disagreement the pane's button could have with the card builder: the row's own path passes,
// and the one the card would carry does not. A cell working under a dot directory is the ordinary
// way to reach it (`~/.config/…`), and the symptom is a button that does nothing when pressed.
describe("the button's gate and the card's gate agree on the same path", () => {
  it("refuses an html file whose containing directory the plugin's guard rejects", () => {
    expect(canOpenInCanvas("p.html")).toBe(true); // the row alone looks fine
    const joined = absoluteUnder("/home/me/.config/proj", "p.html");
    expect(canOpenInCanvas(joined)).toBe(false); // …and the card's path does not
    expect(canvasCardForFile(joined)).toBeNull();
  });

  it("still accepts an ordinary directory", () => {
    const joined = absoluteUnder("/home/me/proj", "p.html");
    expect(canOpenInCanvas(joined)).toBe(true);
    expect(canvasCardForFile(joined)?.toolName).toBe("presentHtml");
  });
});

// mulmoScript, the one tool here that cannot be handed an absolute path — `normalizeStoryPath`
// refuses those outright. So the question is not "does the extension match" but "is this file in
// the WORKSPACE's story directory", and the answer is the wire path the plugin wants.
// A deck kept beside the notes it was written from (#1933). The workspace subtree is registered
// with the plugin under an id the server mints, and a story anywhere under it is addressable as
// `(root, stories/<rel>)` — which is what makes "put the deck in the repository" work at all.
describe("storyWirePath — the workspace subtree", () => {
  const WS = "/work/ws";
  const ROOTS = { workspace: WS, rootId: "abc123" };

  it("names a deck kept anywhere under the workspace", () => {
    expect(storyWirePath(`${WS}/myrepo/decks/talk.json`, ROOTS)).toEqual({ filePath: "stories/myrepo/decks/talk.json", root: "abc123" });
  });

  // The workspace's own stories directory sits INSIDE the subtree, so both could name one file —
  // as `stories/x.json` and as `stories/artifacts/stories/x.json`. Two spellings are two card
  // identities, i.e. two cards for one deck, so the narrower one is decided first and wins.
  it("keeps the default root's spelling for a file in the workspace's own stories directory", () => {
    expect(storyWirePath(`${WS}/artifacts/stories/tale.json`, ROOTS)).toEqual({ filePath: "stories/tale.json" });
  });

  it("answers nothing without the id — the subtree is not addressable until the server names it", () => {
    expect(storyWirePath(`${WS}/myrepo/decks/talk.json`, { workspace: WS, rootId: null })).toBeNull();
  });

  // A workspace that IS a root directory: `dirPathKey` answers `/`, `C:/` or `//server/share`, and
  // the first two already carry the separator. Joining another one made `//artifacts/stories` —
  // read back as a UNC share root — so nothing under such a workspace was a story at all
  // (Codex P1 on #1934). The default-root half of that predates the named root.
  it("recognises a workspace that is a filesystem root", () => {
    expect(storyWirePath("/myrepo/decks/talk.json", { workspace: "/", rootId: "abc123" })).toEqual({
      filePath: "stories/myrepo/decks/talk.json",
      root: "abc123",
    });
    expect(storyWirePath("/artifacts/stories/x.json", { workspace: "/", rootId: "abc123" })).toEqual({ filePath: "stories/x.json" });
  });

  it("recognises a Windows drive root and a UNC share root", () => {
    expect(storyWirePath("C:\\myrepo\\decks\\talk.json", { workspace: "C:\\", rootId: "abc123" })).toEqual({
      filePath: "stories/myrepo/decks/talk.json",
      root: "abc123",
    });
    expect(storyWirePath("//server/share/myrepo/talk.json", { workspace: "//server/share", rootId: "abc123" })).toEqual({
      filePath: "stories/myrepo/talk.json",
      root: "abc123",
    });
  });

  it("stops at the workspace boundary", () => {
    expect(storyWirePath("/work/elsewhere/deck.json", ROOTS)).toBeNull();
  });

  it("takes only .json, here too", () => {
    expect(storyWirePath(`${WS}/myrepo/notes.md`, ROOTS)).toBeNull();
  });

  it("is what canOpenInCanvas answers on", () => {
    expect(canOpenInCanvas(`${WS}/myrepo/decks/talk.json`, ROOTS)).toBe(true);
    expect(canOpenInCanvas(`${WS}/myrepo/decks/talk.json`, { workspace: WS, rootId: null })).toBe(false);
  });
});

describe("storyWirePath", () => {
  const WS = "/work/ws";

  it("turns a story under the workspace into the plugin's wire path", () => {
    expect(storyWirePath(`${WS}/artifacts/stories/tale.json`, { workspace: WS, rootId: null })).toEqual({ filePath: "stories/tale.json" });
  });

  it("keeps a story's own subdirectory", () => {
    expect(storyWirePath(`${WS}/artifacts/stories/drafts/tale.json`, { workspace: WS, rootId: null })).toEqual({ filePath: "stories/drafts/tale.json" });
  });

  // The reason this is rooted at the workspace rather than matched on shape: a project cell may
  // have an artifacts/stories of its own, and those stories are not the ones the plugin opens.
  it("refuses an identically-shaped path under another directory", () => {
    expect(storyWirePath("/work/other/artifacts/stories/tale.json", { workspace: WS, rootId: null })).toBeNull();
  });

  it("refuses a file in the story directory that is not a script", () => {
    expect(storyWirePath(`${WS}/artifacts/stories/notes.md`, { workspace: WS, rootId: null })).toBeNull();
    expect(storyWirePath(`${WS}/artifacts/stories/tale.json.bak`, { workspace: WS, rootId: null })).toBeNull();
  });

  // `..` folds away in the key, so a traversal stops matching the prefix rather than being
  // spotted as a traversal — the same reason the workspace chip can compare paths at all.
  it("refuses a path that climbs out of the story directory", () => {
    expect(storyWirePath(`${WS}/artifacts/stories/../../../etc/passwd`, { workspace: WS, rootId: null })).toBeNull();
    expect(storyWirePath(`${WS}/artifacts/stories/../secrets.json`, { workspace: WS, rootId: null })).toBeNull();
  });

  it("refuses the story directory itself, which is not a file", () => {
    expect(storyWirePath(`${WS}/artifacts/stories`, { workspace: WS, rootId: null })).toBeNull();
  });

  it("has no workspace to root against before the config lands", () => {
    expect(storyWirePath(`${WS}/artifacts/stories/tale.json`, { workspace: null, rootId: null })).toBeNull();
  });

  // Both separators fold, so the mixed path `absoluteUnder` produces on Windows still matches.
  it("matches a Windows workspace against a mixed-separator path", () => {
    const joined = absoluteUnder("C:\\Users\\me\\ws", "artifacts/stories/tale.json");
    expect(storyWirePath(joined, { workspace: "C:\\Users\\me\\ws", rootId: null })).toEqual({ filePath: "stories/tale.json" });
  });

  it("is what canOpenInCanvas answers on for a story", () => {
    expect(canOpenInCanvas(`${WS}/artifacts/stories/tale.json`, { workspace: WS, rootId: null })).toBe(true);
    // Without the workspace a story is unrecognisable; markdown and html are judged anywhere.
    expect(canOpenInCanvas(`${WS}/artifacts/stories/tale.json`, { workspace: null, rootId: null })).toBe(false);
    expect(canOpenInCanvas(`${WS}/notes.md`, { workspace: null, rootId: null })).toBe(true);
  });
});

// The card for a story comes from the plugin's own reopen: `MulmoScriptData` needs the parsed
// script, and reading it here would be a second copy of what that route already does.
describe("buildCanvasCard", () => {
  const WS = "/work/ws";
  afterEach(() => vi.unstubAllGlobals());

  const mockReopen = (body: unknown, ok = true) => {
    const fetchMock = vi.fn(async () => ({ ok, json: async () => body }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("builds a markdown card without asking the server anything", async () => {
    const fetchMock = mockReopen({});
    expect(await buildCanvasCard(`${WS}/docs/design.md`, { workspace: WS, rootId: null })).toEqual({
      toolName: "presentDocument",
      data: { markdown: "", docPath: `${WS}/docs/design.md` },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The DISPATCH shape, flat: `{ok, script, filePath, root}`. The kind-less body answers an
  // envelope `{data}` instead, and reading that one here built no card at all — the row's menu
  // entry appeared and clicking it did nothing, which only a browser run showed (#1933).
  it("reopens a story through the plugin route and carries back what it returned", async () => {
    const fetchMock = mockReopen({ ok: true, script: { title: "Tale" }, filePath: "stories/tale.json", message: "Reopened" });
    expect(await buildCanvasCard(`${WS}/artifacts/stories/tale.json`, { workspace: WS, rootId: null })).toEqual({
      toolName: "presentMulmoScript",
      data: { script: { title: "Tale" }, filePath: "stories/tale.json" },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/plugin/presentMulmoScript");
    // `kind: "save"` — the reopen the DISPATCH serves, which is the only shape that carries a root.
    // The kind-less body is the agent's tool call and is deliberately root-blind.
    expect(JSON.parse(String(init.body))).toEqual({ kind: "save", filePath: "stories/tale.json" });
  });

  // The root travels on the card, because that is what keeps two roots' identically-named decks on
  // two cards (canvasIdentity.filePathIdentity) rather than folding them into one.
  it("carries the root onto the card, and asks for it by name", async () => {
    const fetchMock = mockReopen({ ok: true, script: { title: "Deck" }, filePath: "stories/myrepo/decks/talk.json", root: "abc123" });
    expect(await buildCanvasCard(`${WS}/myrepo/decks/talk.json`, { workspace: WS, rootId: "abc123" })).toEqual({
      toolName: "presentMulmoScript",
      data: { script: { title: "Deck" }, filePath: "stories/myrepo/decks/talk.json", root: "abc123" },
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ kind: "save", filePath: "stories/myrepo/decks/talk.json", root: "abc123" });
  });

  it("has no card when the dispatch refuses", async () => {
    mockReopen({ ok: false, code: "bad_request", error: 'unknown stories root "gone"' });
    expect(await buildCanvasCard(`${WS}/myrepo/decks/talk.json`, { workspace: WS, rootId: "gone" })).toBeNull();
  });

  // The route narrates a missing or refused file as a 200 with no `data`, so absence of `data`
  // — not the status — is what "cannot open this" looks like.
  it("has no card when the route narrates the file as missing", async () => {
    mockReopen({ message: "Story not found" });
    expect(await buildCanvasCard(`${WS}/artifacts/stories/gone.json`, { workspace: WS, rootId: null })).toBeNull();
  });

  it("has no card when the route errors outright", async () => {
    mockReopen({}, false);
    expect(await buildCanvasCard(`${WS}/artifacts/stories/tale.json`, { workspace: WS, rootId: null })).toBeNull();
  });

  it("does not reach the server for a file no plugin renders", async () => {
    const fetchMock = mockReopen({});
    expect(await buildCanvasCard(`${WS}/notes.txt`, { workspace: WS, rootId: null })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// The ordering inside buildCanvasCard is load-bearing and silent: markdown and html are asked
// first, so if either ever started accepting `.json`, every story in the workspace would quietly
// open as that other thing instead. Pinned against the plugins themselves, not against our own
// reasoning about them — a package upgrade is exactly how this would change.
describe("the three plugins do not claim each other's files", () => {
  const WS = "/work/ws";

  it("leaves a story's .json to the story branch", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, script: {}, filePath: "stories/tale.json" }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    expect(canvasCardForFile(`${WS}/artifacts/stories/tale.json`)).toBeNull(); // no other plugin takes it
    expect((await buildCanvasCard(`${WS}/artifacts/stories/tale.json`, { workspace: WS, rootId: null }))?.toolName).toBe("presentMulmoScript");
    vi.unstubAllGlobals();
  });

  // The converse: a document that happens to live in the story directory is a document. It is not
  // a story, and storyWirePath's `.json` requirement is what keeps it from being treated as one.
  it("leaves a document in the story directory to the markdown branch", async () => {
    expect(storyWirePath(`${WS}/artifacts/stories/notes.md`, { workspace: WS, rootId: null })).toBeNull();
    expect(canvasCardForFile(`${WS}/artifacts/stories/notes.md`)?.toolName).toBe("presentDocument");
  });
});

// Bounded like the repo's other API callers. The reopen blocks the Canvas from opening, so a
// server that never answers would otherwise leave the button pressed and nothing happening.
describe("a request that never answers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const hangUntilAborted = () => {
    const started: AbortSignal[] = [];
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      if (signal) started.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    return started;
  };

  it("gives up on the reopen instead of hanging forever", async () => {
    vi.useFakeTimers();
    const started = hangUntilAborted();
    const pending = buildCanvasCard("/work/ws/artifacts/stories/tale.json", { workspace: "/work/ws", rootId: null });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull();
    expect(started[0]?.aborted).toBe(true);
  });

  it("gives up on the seed, so the Canvas is not revealed over a card that never landed", async () => {
    vi.useFakeTimers();
    hangUntilAborted();
    const pending = seedCanvasCard("s-1", { toolName: "presentDocument", data: {} });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBe(false);
  });

  it("gives up on the stored-card check, answering no", async () => {
    vi.useFakeTimers();
    hangUntilAborted();
    const pending = hasStoredCard("s-1");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBe(false);
  });
});

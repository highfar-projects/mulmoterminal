// @vitest-environment node
// The tool-call path for `presentMulmoScript`, and specifically the branch that replaces ONE beat
// of an existing story.
//
// It was documented and dead at the same time (#1880). The tool's own description tells an agent
// to use it "whenever the user asks to change part of an existing presentation", while the host's
// argument allowlist dropped `beatIndex` and `beat` on the way to the package — and every field of
// `SaveMulmoScriptArgs` is optional, so what arrived looked like a plain re-display request. The
// package answered "Loaded MulmoScript from …", changed nothing, and the agent could not tell that
// from success.
//
// Which is why these assertions are about the FILE ON DISK and the PUBLISH, never about the
// response: the response was already correct while the feature did nothing.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { initMulmoScriptBackend, mountMulmoScriptDispatchRoute } from "../../../server/backends/mulmoscript.js";
import { initArtifactsBackend } from "../../../server/backends/artifacts.js";

const SCRIPT_CHANGED = "plugin:mulmoScript:scriptChanged";
const STORY = "stories/deck.json";

const beat = (heading: string) => ({ speaker: "Presenter", text: heading, image: { type: "markdown", markdown: `# ${heading}`, style: "corporate-blue" } });

const script = {
  $mulmocast: { version: "1.1" },
  title: "Deck",
  lang: "en",
  beats: [beat("first"), beat("second"), beat("third")],
};

let workspace: string;
// Every workspace this file made, not just the current one: a test that calls the route twice
// makes two, and tracking only `workspace` would leave the first behind in the temp dir.
let workspaces: string[];
let published: { channel: string; data: unknown }[];

/** A story on disk plus a mounted route, which is the only way to reach `handleToolCall` — it is
 *  not exported, and exporting it to test it would let the allowlist drift from what the route
 *  actually calls. */
const appWithStory = () => {
  workspace = mkdtempSync(join(tmpdir(), "mulmoscript-beat-"));
  workspaces.push(workspace);
  const stories = join(workspace, "artifacts", "stories");
  mkdirSync(stories, { recursive: true });
  writeFileSync(join(stories, "deck.json"), JSON.stringify(script, null, 2));
  published = [];
  // Both, and in this order — the same pairing server/index.ts uses. The mulmoScript ops read and
  // write through the artifacts backend, so without this the save path 500s with "artifacts
  // backend not initialised" while the publish path (which touches no file) works fine.
  initArtifactsBackend({ workspace });
  initMulmoScriptBackend({
    workspace,
    pubsub: { publish: (channel, data) => published.push({ channel, data }) },
    isFfmpegAvailable: () => false,
  });
  const app = express();
  // Not optional, and its absence is quiet: without a JSON parser the route sees an EMPTY body,
  // the package answers "Provide either `script` or `filePath`" with a 200, and an assertion that
  // only checks the status and that the file is unchanged passes for entirely the wrong reason.
  // Four of these tests did exactly that before this line existed.
  app.use(express.json());
  mountMulmoScriptDispatchRoute(app);
  return app;
};

const onDisk = () => JSON.parse(readFileSync(join(workspace, "artifacts", "stories", "deck.json"), "utf8"));

const call = (body: Record<string, unknown>) => routeCall(appWithStory())("/api/plugin/presentMulmoScript", jsonPost(body));

beforeEach(() => {
  published = [];
  workspaces = [];
});

afterEach(() => {
  workspaces.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("presentMulmoScript — replacing one beat", () => {
  it("writes the replacement to disk", async () => {
    const res = await call({ filePath: STORY, beatIndex: 1, beat: beat("REPLACED") });

    expect(res.status).toBe(200);
    // The assertion that would have caught #1880. The response was always fine.
    expect(onDisk().beats[1].image.markdown).toBe("# REPLACED");
  });

  it("leaves the other beats alone", async () => {
    await call({ filePath: STORY, beatIndex: 1, beat: beat("REPLACED") });

    const beats = onDisk().beats;
    expect(beats).toHaveLength(3);
    // The target too, or this passes when NOTHING was written — which a mutation showed it doing.
    // "the others are unchanged" is trivially true of a no-op, and a no-op is the whole bug.
    expect(beats[1].image.markdown).toBe("# REPLACED");
    expect(beats[0].image.markdown).toBe("# first");
    expect(beats[2].image.markdown).toBe("# third");
  });

  // The other half of the ground truth: what the agent is TOLD. The response is the only thing the
  // caller can read, and before the fix it carried the PRE-write script under a message that reads
  // like success — so nothing pins that the host returns the post-write load rather than a snapshot
  // it took earlier. Asserted on the raw text because `res.body`'s fields are `unknown` by design
  // and the marker is unique in this story; a shape assertion would cost a type guard to prove what
  // the on-disk assertions already prove.
  it("returns the updated script to the caller", async () => {
    const res = await call({ filePath: STORY, beatIndex: 1, beat: beat("REPLACED") });

    expect(res.text).toContain("# REPLACED");
    expect(res.text).not.toContain("# second");
  });

  // The write is only half of it. A canvas that already has this story open learns about the
  // change from the broadcast and from nothing else — a new save gets redrawn because the response
  // tells the agent to display the story, which opens the new file, but replacing a beat of an
  // ALREADY OPEN story changes nothing on screen without this.
  it("broadcasts the change, so an open canvas reloads", async () => {
    await call({ filePath: STORY, beatIndex: 1, beat: beat("REPLACED") });

    expect(published).toEqual([{ channel: SCRIPT_CHANGED, data: { filePath: STORY } }]);
  });

  // No `origin`, and the package's contract is explicit about why: "A View passes its own id on
  // every write and ignores the echo of its own … An agent write carries no origin, so every View
  // reloads." An invented id here would make some View skip the reload as its own echo.
  it("carries no origin, because an agent wrote it", async () => {
    await call({ filePath: STORY, beatIndex: 1, beat: beat("REPLACED") });

    expect(published[0]?.data).not.toHaveProperty("origin");
  });
});

describe("presentMulmoScript — when no beat was replaced", () => {
  // A re-display touches nothing, so a broadcast would be a claim about a file nothing wrote.
  it("does not broadcast for a plain re-display", async () => {
    const res = await call({ filePath: STORY });

    expect(res.status).toBe(200);
    expect(published).toEqual([]);
    expect(onDisk().beats[1].image.markdown).toBe("# second");
  });

  // The package requires the pair together and refuses half of it. What matters here is that the
  // host does not broadcast for a request that wrote nothing — the refusal itself is the
  // package's to make.
  it("does not broadcast when only one half of the pair is given", async () => {
    await call({ filePath: STORY, beatIndex: 1 });
    expect(published).toEqual([]);

    published = [];
    await call({ filePath: STORY, beat: beat("REPLACED") });
    expect(published).toEqual([]);
    expect(onDisk().beats[1].image.markdown).toBe("# second");
  });

  // A string index is not an index. It has to be dropped rather than coerced, or `"1"` would edit
  // beat 1 while `"x"` reached the package as a value its own validation never expected.
  it("ignores a beatIndex that is not a number", async () => {
    await call({ filePath: STORY, beatIndex: "1", beat: beat("REPLACED") });

    expect(published).toEqual([]);
    expect(onDisk().beats[1].image.markdown).toBe("# second");
  });
});

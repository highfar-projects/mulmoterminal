// @vitest-environment node
//
// The tool's contract with the agent is ACTIONABLE PROSE, and that is the part a refusal is most
// likely to break: an operation that throws reaches the agent as a tool crash, which it will
// retry rather than report. So every path out of here is a string.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { MANAGE_SHARED_APP, SHARED_APP_ACTIONS, manageSharedApp } from "../../../server/infra/shared-app-tool.js";
import { HOST_TOOL_DEFINITIONS } from "../../../server/infra/host-tools.js";
import { groupOfTool } from "../../../common/toolGroups.js";
import { setFirestoreAccessor, setSharedCollectionsSupport } from "@mulmoclaude/core/collection/server";
import { initCollectionsBackend } from "../../../server/backends/collections.js";
import { makeTempDir } from "../../support/tempDir";
import path from "node:path";

describe("manageSharedApp, the tool", () => {
  beforeAll(() => {
    // Discovery needs a bound host: `check` reads this repository's collections, and without the
    // binding it throws rather than reporting. ONE call per file — the binding refuses a second.
    initCollectionsBackend({ workspace: makeTempDir("mt-shared-tool-ws-") });
    // Signed out on purpose: it is the state `check` has to work in, and the state the other
    // operations have to refuse in.
    setSharedCollectionsSupport(true);
    setFirestoreAccessor(null);
  });

  it("is registered as a host tool and reaches the group the collections live in", () => {
    expect(HOST_TOOL_DEFINITIONS.map((d) => d.name)).toContain("manageSharedApp");
    // Ungrouped would mean it is offered only through the all-tools URL — a cell with the
    // Collections pane would have the store and no way to deploy it.
    expect(groupOfTool("manageSharedApp")).toBe("data");
  });

  it("names the three operations in the schema the agent is given", () => {
    expect(SHARED_APP_ACTIONS).toEqual(["init", "check", "invite", "deploy", "publish", "unpublish"]);
    expect(MANAGE_SHARED_APP.parameters?.properties?.action).toMatchObject({ enum: [...SHARED_APP_ACTIONS] });
  });

  it("answers an unknown action with the ones that exist", async () => {
    expect(await manageSharedApp(makeTempDir("mt-shared-tool-"), { action: "ship" })).toContain("init, check, invite, deploy, publish, unpublish");
    expect(await manageSharedApp(makeTempDir("mt-shared-tool-"), {})).toContain("init, check, invite, deploy, publish, unpublish");
  });

  it("refuses to start an app in a repository that already declares one", async () => {
    const root = makeTempDir("mt-shared-tool-");
    writeFileSync(path.join(root, "app.json"), JSON.stringify({ aid: "a1", members: {} }));
    // Overwriting would revoke the whole roster without saying so.
    expect(await manageSharedApp(root, { action: "init", name: "Second" })).toContain("already");
  });

  it("calls a sound declaration deployable while signed out", async () => {
    // The publisher check asks whether the caller is an app-wide owner, so an empty address is not
    // neutral — it reported a missing owner for every signed-out call, and `check` could never
    // come back clean. Signed out, the honest question is "would this deploy for the owner it
    // names?", and the answer has to be able to be yes.
    const root = makeTempDir("mt-shared-tool-");
    writeFileSync(path.join(root, "app.json"), JSON.stringify({ aid: "a1", name: "Survey", members: { "o@e.com": { "*": "owner" } } }));

    const message = await manageSharedApp(root, { action: "check" });
    expect(message).toContain("deployable");
    expect(message).toContain("o@e.com");
  });

  it("checks the declaration without a session, and without writing", async () => {
    const root = makeTempDir("mt-shared-tool-");
    writeFileSync(path.join(root, "app.json"), JSON.stringify({ aid: "a1", members: { "o@e.com": { "*": "owner" } }, slug: "Not A Slug" }));

    const message = await manageSharedApp(root, { action: "check" });
    // The strict declaration refuses that slug's shape, and `check` is where an author is meant to
    // learn it — not at a deploy, and not from a live refusal.
    expect(message).toContain("slug");
    expect(JSON.parse(readFileSync(path.join(root, "app.json"), "utf-8")).slug).toBe("Not A Slug");
  });

  it("adds and removes one roster entry, leaving the rest of the file alone", async () => {
    const root = makeTempDir("mt-shared-tool-");
    writeFileSync(path.join(root, "app.json"), JSON.stringify({ aid: "a1", name: "Survey", members: { "o@e.com": { "*": "owner" } } }));

    expect(await manageSharedApp(root, { action: "invite", email: "t@e.com", role: "viewer" })).toContain("viewer");
    const after = JSON.parse(readFileSync(path.join(root, "app.json"), "utf-8"));
    expect(after.members).toEqual({ "o@e.com": { "*": "owner" }, "t@e.com": { "*": "viewer" } });
    expect(after.name).toBe("Survey");

    expect(await manageSharedApp(root, { action: "invite", email: "t@e.com" })).toContain("Removed");
    // Removed ENTIRELY rather than left as an empty object: the rules require the roster and its
    // email list to agree, and a half-removed entry is a permission somebody still holds.
    expect(JSON.parse(readFileSync(path.join(root, "app.json"), "utf-8")).members).toEqual({ "o@e.com": { "*": "owner" } });
  });

  it("returns every refusal as text rather than throwing", async () => {
    const root = makeTempDir("mt-shared-tool-");
    writeFileSync(path.join(root, "app.json"), JSON.stringify({ aid: "a1", members: {} }));
    // The three that reach the APP need a session and say so. `check` and `invite` are about the
    // file and need none; `init` refuses here because the declaration already exists.
    for (const action of ["deploy", "publish", "unpublish"]) {
      const message = await manageSharedApp(root, { action });
      expect(typeof message).toBe("string");
      expect(message).toContain("signed-in Firestore session");
    }
  });
});

// @vitest-environment node
//
// The other half of per-card scoping: the plugin only asks the host for a scoped binding when the
// card CARRIES a scope, and core deliberately refuses to take one from tool arguments (a
// model-controlled channel). So if the host never stamps one, every card is unscoped and the
// scoped binding is dead code — which is exactly what review caught.
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { stampCardScope, scopeOfStoredCard } from "../../../server/routes/stampCardScope.js";
import { initProjectRoots, projectId, resetProjectRootsForTesting } from "../../../server/infra/project-root.js";

const WORKSPACE = "/srv/ws";
const PROJECT = "/srv/mag2";
/** Where each fixture session is running — the server's own record, which is what the stamp
 *  reads. Anything unnamed is the workspace, as a session with no recorded cwd is. */
const CWDS: Record<string, string> = { "in-project": PROJECT, elsewhere: "/srv/never-saved" };
const cwdOf = (sessionId: string) => CWDS[sessionId] ?? WORKSPACE;
const card = (slug = "tasks") => ({ uuid: "u1", data: { collectionSlug: slug } });

beforeEach(() => {
  initProjectRoots({ workspace: WORKSPACE, knownProjects: () => [{ label: "mag2", path: PROJECT }] });
});

afterEach(() => {
  resetProjectRootsForTesting();
});

describe("stampCardScope", () => {
  it("stamps the session's project onto a collection card", () => {
    const out = stampCardScope("presentCollection", card(), { cwdOf, sessionId: "in-project" });
    expect(out.data).toMatchObject({ collectionSlug: "tasks", scope: projectId(PROJECT) });
  });

  // An opaque id, never a path: this payload reaches the browser and, through a custom view, an
  // LLM-authored iframe.
  it("stamps an id, not a path", () => {
    const out = stampCardScope("presentCollection", card(), { cwdOf, sessionId: "in-project" });
    expect(JSON.stringify(out)).not.toContain("/srv");
  });

  // The workspace is what a card with no scope already resolves to, so stamping it would add a
  // field that changes nothing — and every single-workspace card would suddenly carry one.
  it("leaves a workspace card unscoped", () => {
    const out = stampCardScope("presentCollection", card(), { cwdOf, sessionId: "workspace-session" });
    expect(Object.hasOwn(out.data, "scope")).toBe(false);
  });

  it("leaves a card from a directory the server does not serve unscoped", () => {
    const out = stampCardScope("presentCollection", card(), { cwdOf, sessionId: "elsewhere" });
    expect(Object.hasOwn(out.data, "scope")).toBe(false);
  });

  it("touches no other tool's result", () => {
    const result = { uuid: "u1", data: { collectionSlug: "tasks" } };
    expect(stampCardScope("presentChart", result, { cwdOf, sessionId: "in-project" })).toBe(result);
  });

  // The payload arrives as JSON from a broker that forwards a plugin's output unchanged, so "it
  // is a card" is checked rather than assumed. A shape this build does not recognise passes
  // through with no scope, which is better than a wrong one.
  it("passes through a result whose payload is not a card", () => {
    for (const stored of [{ uuid: "u1" }, { uuid: "u1", data: null }, { uuid: "u1", data: {} }, { uuid: "u1", data: { collectionSlug: "" } }]) {
      expect(stampCardScope("presentCollection", stored, { cwdOf, sessionId: "in-project" })).toBe(stored);
    }
  });

  // A card's project is decided when it is MADE. This same route persists a view's state change
  // under the card's uuid, replacing the stored entry wholesale — and a cell can be relaunched in
  // another directory in between, so re-deriving the scope here would let the card change project
  // after the fact. That is the bug the stamp exists to prevent, arriving by the back door.
  it("carries an existing card's scope forward, even when the session has moved", () => {
    const movedSession = "workspace-session"; // the cell now runs in the workspace
    const out = stampCardScope("presentCollection", card(), { cwdOf, sessionId: movedSession, priorScope: projectId(PROJECT) });
    expect(out.data).toMatchObject({ scope: projectId(PROJECT) });
  });

  it("derives the scope only when the card does not already have one", () => {
    const out = stampCardScope("presentCollection", card(), { cwdOf, sessionId: "in-project", priorScope: undefined });
    expect(out.data).toMatchObject({ scope: projectId(PROJECT) });
  });

  it("reads a stored card's scope, and nothing else's", () => {
    expect(scopeOfStoredCard({ uuid: "u", data: { collectionSlug: "tasks", scope: "p1" } })).toBe("p1");
    for (const stored of [undefined, null, {}, { data: {} }, { data: { scope: "" } }, { data: { scope: 7 } }, "nope"]) {
      expect(scopeOfStoredCard(stored)).toBeUndefined();
    }
  });

  it("keeps everything else on the result", () => {
    const stored = { uuid: "u1", toolName: "presentCollection", viewState: { selected: "x" }, data: { collectionSlug: "tasks", title: "Tasks" } };
    const out = stampCardScope("presentCollection", stored, { cwdOf, sessionId: "in-project" });
    expect(out).toMatchObject({ uuid: "u1", viewState: { selected: "x" } });
    expect(out.data).toMatchObject({ collectionSlug: "tasks", title: "Tasks" });
  });
});

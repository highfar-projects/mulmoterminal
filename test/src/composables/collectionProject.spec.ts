// @vitest-environment node
//
// The client half of the project scope. Two rules are encoded here rather than in a comment
// alone, because both are invisible until they break in a way that looks like something else.
import { describe, it, expect, afterEach } from "vitest";

import { withActiveProject } from "../../../src/composables/collectionProject";
import {
  activeCollectionNavSurface,
  activeCollectionProjectId,
  popCollectionSurface,
  pushCollectionSurface,
  type CollectionSurface,
} from "../../../src/composables/collectionSurface";

/** A surface with only the parts these tests read. */
const surfaceFor = (projectId: string | null, slug = "surface"): CollectionSurface => ({
  projectId,
  nav: {
    routeSlug: () => slug,
    routeSelectedId: () => undefined,
    isFeedRoute: () => false,
    setSelectedId: () => {},
    gotoIndex: () => {},
    gotoDetail: () => {},
    navigateToRecord: () => {},
  },
});

describe("withActiveProject", () => {
  let scoped: CollectionSurface | null = null;
  const scopeTo = (projectId: string) => {
    scoped = surfaceFor(projectId);
    pushCollectionSurface(scoped);
  };
  afterEach(() => {
    if (scoped) popCollectionSurface(scoped);
    scoped = null;
  });

  it("leaves urls alone when no project is active", () => {
    expect(withActiveProject("/api/collections/list")).toBe("/api/collections/list");
  });

  it("appends the project, and joins an existing query with &", () => {
    scopeTo("abc123");
    expect(withActiveProject("/api/collections/list")).toBe("/api/collections/list?project=abc123");
    expect(withActiveProject("/api/collections/tasks/view-file?id=v1")).toBe("/api/collections/tasks/view-file?id=v1&project=abc123");
  });

  // The view-data family is reached by the sandboxed iframe using the url minted WITH its token,
  // and that token is what names their project. A parameter here would also land inside the
  // suffixes the view contract builds by concatenation (`dataUrl + "/query"`), which is how the
  // server-side version of this mistake 401'd every one of them.
  it("never touches the view-data endpoints", () => {
    scopeTo("abc123");
    expect(withActiveProject("/api/collections/tasks/view-data")).toBe("/api/collections/tasks/view-data");
    expect(withActiveProject("/api/collections/tasks/view-data/query")).toBe("/api/collections/tasks/view-data/query");
  });
});

describe("collection nav surface", () => {
  const surfaceNamed = (slug: string): CollectionSurface => surfaceFor(null, slug);

  it("has no surface by default, so the binding keeps driving the router-backed overlay", () => {
    expect(activeCollectionNavSurface()).toBeNull();
  });

  // Surfaces nest — the full-screen overlay can open over a pane — so the innermost one wins and
  // removing it restores the one beneath rather than clearing navigation entirely.
  it("hands navigation to the innermost surface and restores the previous one", () => {
    const pane = surfaceNamed("pane");
    const overlay = surfaceNamed("overlay");
    pushCollectionSurface(pane);
    pushCollectionSurface(overlay);
    expect(activeCollectionNavSurface()?.routeSlug()).toBe("overlay");
    popCollectionSurface(overlay);
    expect(activeCollectionNavSurface()?.routeSlug()).toBe("pane");
    popCollectionSurface(pane);
    expect(activeCollectionNavSurface()).toBeNull();
  });

  // Scope travels WITH navigation: registering only the nav is what let a mounted pane keep the
  // project for the full-screen overlay opened over it.
  it("takes the project from the innermost surface too", () => {
    const pane = surfaceFor("project-a", "pane");
    const overlay = surfaceFor(null, "overlay");
    pushCollectionSurface(pane);
    expect(activeCollectionProjectId()).toBe("project-a");
    pushCollectionSurface(overlay);
    expect(activeCollectionProjectId()).toBeNull();
    expect(withActiveProject("/api/collections/list")).toBe("/api/collections/list");
    popCollectionSurface(overlay);
    expect(activeCollectionProjectId()).toBe("project-a");
    popCollectionSurface(pane);
  });

  it("ignores a pop for a surface that is not registered", () => {
    const pane = surfaceNamed("pane");
    pushCollectionSurface(pane);
    popCollectionSurface(surfaceNamed("never-pushed"));
    expect(activeCollectionNavSurface()?.routeSlug()).toBe("pane");
    popCollectionSurface(pane);
  });
});

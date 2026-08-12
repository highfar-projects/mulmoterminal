// @vitest-environment node
//
// The tool's contract with the agent is ACTIONABLE PROSE, and that is the part a refusal is most
// likely to break: an operation that throws reaches the agent as a tool crash, which it will
// retry rather than report. So every path out of here is a string.
import { describe, it, expect, beforeAll } from "vitest";
import { MANAGE_SHARED_APP, SHARED_APP_ACTIONS, manageSharedApp } from "../../../server/infra/shared-app-tool.js";
import { HOST_TOOL_DEFINITIONS } from "../../../server/infra/host-tools.js";
import { groupOfTool } from "../../../common/toolGroups.js";
import { setFirestoreAccessor, setSharedCollectionsSupport } from "@mulmoclaude/core/collection/server";
import { makeTempDir } from "../../support/tempDir";

describe("manageSharedApp, the tool", () => {
  beforeAll(() => {
    // Signed out on purpose: the operations then refuse, which is the path being pinned.
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
    expect(SHARED_APP_ACTIONS).toEqual(["deploy", "publish", "unpublish"]);
    expect(MANAGE_SHARED_APP.parameters?.properties?.action).toMatchObject({ enum: ["deploy", "publish", "unpublish"] });
  });

  it("answers an unknown action with the ones that exist", async () => {
    expect(await manageSharedApp(makeTempDir("mt-shared-tool-"), { action: "ship" })).toContain("deploy, publish, unpublish");
    expect(await manageSharedApp(makeTempDir("mt-shared-tool-"), {})).toContain("deploy, publish, unpublish");
  });

  it("returns every refusal as text rather than throwing", async () => {
    const root = makeTempDir("mt-shared-tool-");
    for (const action of SHARED_APP_ACTIONS) {
      const message = await manageSharedApp(root, { action });
      expect(typeof message).toBe("string");
      expect(message).toContain("signed-in Firestore session");
    }
  });
});

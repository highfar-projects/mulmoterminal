// @vitest-environment node
import { describe, it, expect } from "vitest";
import path from "node:path";
import { probePath } from "../../../../server/infra/process/throwawayTmux";

// The psmux probe prints its samples with `node`, so the running node must win on the PATH the
// throwaway server and its panes start from (#3180).
describe("probePath", () => {
  it("puts the running node's folder first", () => {
    expect(probePath("/usr/bin:/bin", "/opt/node/bin/node", path.posix)).toBe("/opt/node/bin:/usr/bin:/bin");
  });

  it("works with Windows separators", () => {
    expect(probePath("C:\\Windows", "C:\\Program Files\\nodejs\\node.exe", path.win32)).toBe("C:\\Program Files\\nodejs;C:\\Windows");
  });

  it.each([undefined, ""])("is the node folder alone when there is no PATH (%j)", (current) => {
    expect(probePath(current, "/opt/node/bin/node", path.posix)).toBe("/opt/node/bin");
  });
});

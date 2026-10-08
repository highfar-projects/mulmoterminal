import { describe, it, expect } from "vitest";
import { paletteLaunchAgent, paletteLaunchDirs } from "../../../src/composables/paletteLaunchDirs";

// #2484. The launch panel's directories as palette rows, and the agent a palette start runs.
describe("paletteLaunchDirs", () => {
  it("puts the workspace first, then the recent directories home-relative, without repeating the workspace", () => {
    const dirs = paletteLaunchDirs(
      [
        { label: "app", path: "/home/me/work/app" },
        { label: "ws", path: "/home/me/ws" },
      ],
      "/home/me/ws",
      "/home/me",
    );
    expect(dirs.map((dir) => dir.path)).toEqual(["/home/me/ws", "/home/me/work/app"]);
    expect(dirs[1]?.label).toBe("~/work/app");
  });

  it("lists only the recent directories with no workspace", () => {
    expect(paletteLaunchDirs([{ label: "app", path: "/srv/app" }], null, null)).toEqual([{ path: "/srv/app", label: "/srv/app" }]);
  });
});

describe("paletteLaunchAgent", () => {
  it("runs a built-in default agent, and Claude for a custom one", () => {
    expect(paletteLaunchAgent("codex")).toBe("codex");
    expect(paletteLaunchAgent("custom:ollama")).toBe("claude");
  });
});

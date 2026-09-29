import { describe, it, expect } from "vitest";
import { LAUNCH_COMMAND as launcherCommand } from "../../bin/launch-command.js";
import { LAUNCH_COMMAND as uiCommand } from "../../common/launchCommand";

// The launcher is plain JS and the UI cannot import from bin/, so the fork's start command lives in
// two files. Every printed hint (stop, init, --help, google, the Quit screen) reads one of them.
describe("the fork's start command", () => {
  it("is the same in the launcher and the UI", () => {
    expect(uiCommand).toBe(launcherCommand);
  });

  // `npx mulmoterminal@latest` starts upstream's npm package, which is what these hints replaced.
  it("starts this fork from GitHub, not upstream's npm package", () => {
    expect(launcherCommand).toBe("npx github:highfar-projects/mulmoterminal");
  });
});

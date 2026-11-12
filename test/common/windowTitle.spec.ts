// The window title names a server that runs inside WSL, so a Windows server and a WSL one on the
// same machine open windows that can be told apart from the taskbar.
import { describe, it, expect } from "vitest";
import { BASE_WINDOW_TITLE, windowTitleFor } from "../../common/windowTitle";

describe("windowTitleFor", () => {
  it("adds (WSL) for a server inside WSL", () => {
    expect(windowTitleFor(true)).toBe("mulmoterminal (WSL)");
  });

  it("is the base title otherwise", () => {
    expect(windowTitleFor(false)).toBe(BASE_WINDOW_TITLE);
  });
});

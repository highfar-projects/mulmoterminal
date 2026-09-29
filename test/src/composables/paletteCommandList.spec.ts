import { describe, it, expect } from "vitest";
import { findHeaderButton, paletteCommandList } from "../../../src/composables/paletteCommandList";
import type { HeaderEntry } from "../../../src/composables/useHeaderButtons";

// #2465. One terminal's header buttons and palette commands, as palette rows list them.
const TEXT = { fromHeader: "header", fromCommands: "command" };
const BUTTONS: HeaderEntry[] = [
  { id: "pr", label: "PR", run: "open", icon: "github:git-pull-request", open: { url: "https://x" } },
  { id: "tools", label: "Tools", items: [{ id: "lint", label: "Lint", run: "shell" }] },
];
const COMMANDS: HeaderEntry[] = [{ id: "release", label: "Release", run: "shell" }];

describe("paletteCommandList", () => {
  it("lists the commands, then the header buttons, a folder's items one by one", () => {
    expect(paletteCommandList(BUTTONS, COMMANDS, TEXT)).toEqual([
      { id: "release", label: "Release", icon: "bolt", detail: "command" },
      { id: "pr", label: "PR", icon: "github:git-pull-request", detail: "header" },
      { id: "lint", label: "Tools › Lint", icon: "bolt", detail: "header" },
    ]);
  });

  it("lists nothing for a terminal with neither", () => {
    expect(paletteCommandList([], [], TEXT)).toEqual([]);
  });
});

describe("findHeaderButton", () => {
  it("finds a button by id, inside a folder too, and nothing for an unknown id", () => {
    expect(findHeaderButton(BUTTONS, "lint")?.label).toBe("Lint");
    expect(findHeaderButton(BUTTONS, "pr")?.run).toBe("open");
    expect(findHeaderButton(BUTTONS, "nope")).toBeNull();
  });
});

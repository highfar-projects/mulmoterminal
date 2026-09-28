// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixedBackgroundsUnderThemeText, themeColorMixes } from "./themeColorMix";

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(vue|ts)$/.test(entry.name) ? [full] : [];
  });

describe("fixedBackgroundsUnderThemeText", () => {
  it.each([
    ["text-fg enabled:hover:bg-[#29344a]", ["enabled:hover:bg-[#29344a]"]],
    ["bg-[#141b33] text-dim", ["bg-[#141b33]"]],
  ])("flags %s", (classes, flagged) => {
    expect(fixedBackgroundsUnderThemeText(classes)).toEqual(flagged);
  });

  // All-theme and all-fixed read the same in every theme; a dot carries no text at all.
  it.each([["text-fg enabled:hover:bg-hover"], ["bg-[#232a45] text-[#cdd6ff] hover:bg-[#2c355a]"], ["bg-[#3fae6b]"], ["text-fg bg-panel"]])(
    "lets %s through",
    (classes) => {
      expect(fixedBackgroundsUnderThemeText(classes)).toEqual([]);
    },
  );
});

describe("src", () => {
  it("reads files at all, so the check below is not vacuous", () => {
    expect(sourceFiles(srcDir).length).toBeGreaterThan(0);
  });

  it("never puts a fixed background under the theme's text colour", () => {
    const mixes = sourceFiles(srcDir).flatMap((file) =>
      themeColorMixes(readFileSync(file, "utf8")).map(({ line, classes }) => `${path.relative(srcDir, file)}:${line} ${classes.join(" ")}`),
    );
    expect(mixes).toEqual([]);
  });
});

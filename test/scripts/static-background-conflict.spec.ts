// @vitest-environment node
// A static `bg-*` beside a conditional `bg-*` on one element: both are single-property utilities, so
// whichever the stylesheet defines LATER wins, whatever the condition says. `bg-transparent` is
// defined after the theme colours, which is how the Files tree's open-row mark, the toolbar popover's
// open state and the active Settings tab never showed (#3058). Put the background in the branches.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const OPENING_TAG = /<[a-zA-Z][^<>]*?>/gs;
const STATIC_CLASS = /(?<![:\w-])class="([^"]*)"/;
const BOUND_CLASS = /:class="([^"]*)"/;
// A plain background utility; `hover:bg-…` and the like are variants and do not compete.
const BACKGROUND = /(?<![\w:-])bg-[\w[\]()\-/.#%,]+/g;

/** The opening tags that set a background both statically and conditionally, as `line: tag`. */
function backgroundConflicts(source: string): number[] {
  return [...source.matchAll(OPENING_TAG)]
    .filter((tag) => {
      const fixed = STATIC_CLASS.exec(tag[0])?.[1] ?? "";
      const bound = BOUND_CLASS.exec(tag[0])?.[1] ?? "";
      return (fixed.match(BACKGROUND)?.length ?? 0) > 0 && (bound.match(BACKGROUND)?.length ?? 0) > 0;
    })
    .map((tag) => source.slice(0, tag.index).split("\n").length);
}

const vueFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return vueFiles(full);
    return entry.name.endsWith(".vue") ? [full] : [];
  });

describe("backgroundConflicts", () => {
  it("finds a static background beside a conditional one", () => {
    expect(backgroundConflicts(`<button class="p-1 bg-transparent" :class="on ? 'bg-hover' : ''">`)).toEqual([1]);
    expect(backgroundConflicts(`<div\n  class="bg-base"\n  :class="[x, { 'bg-selected': on }]"\n>`)).toEqual([1]);
  });

  it("leaves variants, a background on one side only, and the background inside the branches", () => {
    expect(backgroundConflicts(`<button class="hover:bg-hover p-1" :class="on ? 'bg-selected' : ''">`)).toEqual([]);
    expect(backgroundConflicts(`<button class="bg-base" :class="on ? 'text-fg' : 'hover:bg-hover'">`)).toEqual([]);
    expect(backgroundConflicts(`<button class="p-1" :class="on ? 'bg-selected' : 'bg-transparent'">`)).toEqual([]);
  });

  it("finds none in src", () => {
    const offenders = vueFiles(SRC).flatMap((file) => backgroundConflicts(readFileSync(file, "utf8")).map((line) => `${path.relative(SRC, file)}:${line}`));
    expect(offenders).toEqual([]);
  });
});

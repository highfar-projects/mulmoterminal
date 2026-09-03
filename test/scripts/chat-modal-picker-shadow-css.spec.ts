// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `ChatModalAgentPicker` renders inside the collection plugin's SHADOW ROOT, and a class rule does
// not pierce a shadow boundary. What is injected there is the PLUGIN's Tailwind sheet
// (src/collectionShadowCss.ts) — so a MulmoTerminal utility written into that component paints
// nothing, and the control comes out as a bare `<select>` on a white card.
//
// Nothing in the type system says so, and no component test can: the markup is correct either
// way, and the failure is only visible to an eye looking at the real modal. This is the guard.
//
// It lives here rather than beside the component's own spec because it needs `node:fs`, and
// `test/src/**` is type-checked by the DOM program (tsconfig.test.json) which has no node types —
// the same reason `test/config/**` sits in the node-typed project. `tailwind-font-mono.spec.ts`
// next door is the same shape of check: our source against a stylesheet it cannot import.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const componentFile = path.join(repoRoot, "src", "components", "ChatModalAgentPicker.vue");
const pluginSheet = path.join(repoRoot, "node_modules", "@mulmoclaude", "collection-plugin", "dist", "style.css");

/** Every class the component's template puts on an element. */
function classesUsed(): string[] {
  const template = readFileSync(componentFile, "utf8").split("<template>")[1] ?? "";
  const found = new Set<string>();
  for (const match of template.matchAll(/\sclass="([^"]*)"/g)) {
    (match[1] ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => found.add(c));
  }
  return [...found];
}

/** Tailwind escapes `.` `:` `/` `[` `]` in the selector it emits (`.px-2\.5`, `.hover\:x`). */
function sheetHas(css: string, className: string): boolean {
  const escaped = className.replace(/[.:/[\]]/g, (ch) => `\\${ch}`);
  return new RegExp(`\\.${escaped}(?=[\\s,{:.\\\\])`).test(css);
}

describe("ChatModalAgentPicker styling survives the plugin's shadow root", () => {
  it("uses only classes the plugin's shipped stylesheet defines", () => {
    const css = readFileSync(pluginSheet, "utf8");
    // Read, not assumed: an empty or moved sheet would make every class below "present" and the
    // check would pass while proving nothing.
    expect(css.length).toBeGreaterThan(1000);

    const used = classesUsed();
    expect(used.length).toBeGreaterThan(5);

    const missing = used.filter((c) => !sheetHas(css, c));
    expect(missing, `absent from the plugin sheet, so they paint nothing inside its shadow root: ${missing.join(", ")}`).toEqual([]);
  });

  // The trap this guard exists for, stated as a fact rather than as prose: MulmoTerminal's own
  // theme utilities really are missing from that sheet.
  it("confirms MulmoTerminal's theme utilities are the ones that would silently vanish", () => {
    const css = readFileSync(pluginSheet, "utf8");
    ["bg-input", "text-fg", "border-border", "text-dim"].forEach((c) => expect(sheetHas(css, c), `${c} unexpectedly present`).toBe(false));
  });
});

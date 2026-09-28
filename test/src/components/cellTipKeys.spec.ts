// The cell's hover tips and aria-labels are translated (#2408), and stay that way.
//
// A key is just a `string` to the type checker, so `tips.cell.moveLefft` compiles and renders the
// key path on screen; and a new button written with `data-tip="Foo"` compiles too, in English
// for every locale. Both are caught here by reading the component sources, the way
// attentionStatusWords.spec.ts reads the status tables — against the real bundles, since a stub
// that echoes the key back would make every wrong key correct.
import { describe, it, expect } from "vitest";
import { en } from "../../../src/i18n/en";
import { ja } from "../../../src/i18n/ja";
import { zhCN } from "../../../src/i18n/zh-CN";
import { zhTW } from "../../../src/i18n/zh-TW";
import { ko } from "../../../src/i18n/ko";
import TerminalCellSource from "../../../src/components/TerminalCell.vue?raw";
import CellShellSource from "../../../src/components/CellShell.vue?raw";
import CellChromeButtonsSource from "../../../src/components/CellChromeButtons.vue?raw";
import CommandCellSource from "../../../src/components/CommandCell.vue?raw";
import LauncherCellSource from "../../../src/components/LauncherCell.vue?raw";
import TerminalSource from "../../../src/components/Terminal.vue?raw";
import TerminalGridSource from "../../../src/components/TerminalGrid.vue?raw";
import CellTidyPromptSource from "../../../src/components/CellTidyPrompt.vue?raw";
import WorkCommentNoticeSource from "../../../src/components/WorkCommentNotice.vue?raw";
import IssueStartButtonSource from "../../../src/components/IssueStartButton.vue?raw";
import PinToggleSource from "../../../src/components/PinToggle.vue?raw";
import AccountMarkSource from "../../../src/components/AccountMark.vue?raw";
import CollectionMarkSource from "../../../src/components/CollectionMark.vue?raw";
import workCommentNoticeSource from "../../../src/composables/workCommentNotice.ts?raw";

const BUNDLES = { en, ja, "zh-CN": zhCN, "zh-TW": zhTW, ko };

// The surface this section covers. A file added to the cell's chrome belongs here too.
const CELL_SOURCES: Record<string, string> = {
  "TerminalCell.vue": TerminalCellSource,
  "CellShell.vue": CellShellSource,
  "CellChromeButtons.vue": CellChromeButtonsSource,
  "CommandCell.vue": CommandCellSource,
  "LauncherCell.vue": LauncherCellSource,
  "Terminal.vue": TerminalSource,
  "TerminalGrid.vue": TerminalGridSource,
  "CellTidyPrompt.vue": CellTidyPromptSource,
  "WorkCommentNotice.vue": WorkCommentNoticeSource,
  "IssueStartButton.vue": IssueStartButtonSource,
  "PinToggle.vue": PinToggleSource,
  "AccountMark.vue": AccountMarkSource,
  "CollectionMark.vue": CollectionMarkSource,
  "workCommentNotice.ts": workCommentNoticeSource,
};

const lookUp = (bundle: unknown, key: string): unknown =>
  key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), bundle);

/** Every `tips.cell.…` string literal the sources name, whether passed to t() or kept in a table. */
const namedKeys = (): string[] => [
  ...new Set(Object.values(CELL_SOURCES).flatMap((text) => [...text.matchAll(/["'](tips\.cell\.[\w.]+)["']/g)].map((match) => match[1] ?? ""))),
];

const leafKeys = (node: unknown, prefix: string): string[] =>
  typeof node === "string" ? [prefix] : Object.entries(node as Record<string, unknown>).flatMap(([key, child]) => leafKeys(child, `${prefix}.${key}`));

// An English literal where a message belongs: a plain attribute, or a quoted capitalised string
// inside a bound one (`:data-tip="x ? 'Foo' : …"`). Lower-case literals such as the
// `'git push -u origin'` command are not words to translate.
const HARDCODED_TIP = /(?:^|\s)(?:data-tip|aria-label)="[^"]+"|:(?:data-tip|aria-label)="[^"]*(?:'[A-Z]|`[A-Z])/g;

describe("the cell's tips and aria-labels", () => {
  it("name keys at all, so the census below is reading the right files", () => {
    expect(namedKeys().length).toBeGreaterThan(0);
  });

  it.each(Object.keys(BUNDLES))("resolve every named key in %s", (locale) => {
    const bundle = BUNDLES[locale as keyof typeof BUNDLES];
    expect(namedKeys().filter((key) => typeof lookUp(bundle, key) !== "string")).toEqual([]);
  });

  it("leave no English key unused", () => {
    const named = new Set(namedKeys());
    expect(leafKeys(en.tips.cell, "tips.cell").filter((key) => !named.has(key))).toEqual([]);
  });

  it.each(Object.keys(CELL_SOURCES).filter((file) => file.endsWith(".vue")))("keep no English written into %s", (file) => {
    expect(CELL_SOURCES[file]?.match(HARDCODED_TIP) ?? []).toEqual([]);
  });

  // The pattern has to see the two shapes it exists for, or the test above passes by matching nothing.
  it.each([
    ['<button data-tip="Close terminal">', true],
    [`<button :data-tip="open ? 'Restore' : t('x')">`, true],
    ['<button :aria-label="`Close ${dir}`">', true],
    [`<button :data-tip="t('tips.cell.closeTerminal')">`, false],
    [`<button :data-tip="ahead === 0 ? t('a') : 'git push -u origin'">`, false],
  ])("the pattern judges %s as hard-coded: %s", (markup, hardcoded) => {
    expect((markup.match(HARDCODED_TIP) ?? []).length > 0).toBe(hardcoded);
  });
});

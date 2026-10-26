// Give a headless emulator the same character widths as the browser's xterm (applyCellWidths in
// src/composables/useTerminalConnections.ts): the table measured from the tmux on this server when
// there is one (#3173), else DEFAULT_TERMINAL_UNICODE_VERSION. A screen rebuilt here on a different
// table than the browser's would put everything after an emoji one column off.
//
// Required rather than imported for the reason headlessMirror.ts gives for `@xterm/addon-serialize`:
// the addon's typings import `@xterm/xterm`, which pulls the browser's globals into the whole server
// program.
import type headless from "@xterm/headless";
import { createRequire } from "node:module";
import { DEFAULT_TERMINAL_UNICODE_VERSION } from "../../common/terminalUnicode.js";
import { tmuxUnicodeProvider, TMUX_UNICODE_VERSION } from "../../common/tmuxUnicodeProvider.js";
import type { TmuxWidthTable } from "../../common/tmuxWidthTable.js";
import { tmuxWidthTable } from "../infra/process/tmuxWidthProbe.js";

type HeadlessTerminal = InstanceType<typeof headless.Terminal>;
type HeadlessAddon = Parameters<HeadlessTerminal["loadAddon"]>[0];
interface Unicode11AddonModule {
  Unicode11Addon: new () => HeadlessAddon;
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- `require` is untyped by design here; the annotation above is the contract.
const { Unicode11Addon }: Unicode11AddonModule = createRequire(import.meta.url)("@xterm/addon-unicode11");

// `unicode` is proposed API, so the terminal must have been built with `allowProposedApi: true`.
export function useUnicode11Widths(term: HeadlessTerminal, table: TmuxWidthTable | null = tmuxWidthTable()): void {
  term.loadAddon(new Unicode11Addon());
  if (table) term.unicode.register(tmuxUnicodeProvider(table));
  term.unicode.activeVersion = table ? TMUX_UNICODE_VERSION : DEFAULT_TERMINAL_UNICODE_VERSION;
}

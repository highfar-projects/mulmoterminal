// Give a headless emulator the same character widths as the browser's xterm (see buildTerminal in
// src/composables/useTerminalConnections.ts). Which table that is is the server's answer, from
// common/terminalUnicode.ts: Unicode 11 where the tmux counts an emoji such as `✅` two cells wide
// (psmux, and a real tmux whose locale says so), xterm's default Unicode 6 where it counts one. A screen rebuilt here on a
// different table than the browser's would put everything after an emoji one column off.
//
// Required rather than imported for the reason headlessMirror.ts gives for `@xterm/addon-serialize`:
// the addon's typings import `@xterm/xterm`, which pulls the browser's globals into the whole server
// program.
import type headless from "@xterm/headless";
import { createRequire } from "node:module";
import { terminalUnicodeVersionFor } from "../../common/terminalUnicode.js";
import { tmuxCountsEmojiWide } from "../infra/process/tmux.js";

type HeadlessTerminal = InstanceType<typeof headless.Terminal>;
type HeadlessAddon = Parameters<HeadlessTerminal["loadAddon"]>[0];
interface Unicode11AddonModule {
  Unicode11Addon: new () => HeadlessAddon;
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- `require` is untyped by design here; the annotation above is the contract.
const { Unicode11Addon }: Unicode11AddonModule = createRequire(import.meta.url)("@xterm/addon-unicode11");

// `unicode` is proposed API, so the terminal must have been built with `allowProposedApi: true`.
export function useUnicode11Widths(term: HeadlessTerminal, emojiWide: boolean = tmuxCountsEmojiWide()): void {
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = terminalUnicodeVersionFor(emojiWide);
}

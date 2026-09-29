// The command that starts THIS fork, for every line MulmoTerminal prints or shows telling someone
// how to start it, stop it or run a subcommand. Upstream's text says `npx mulmoterminal@latest`,
// which starts upstream's npm package and would replace the fork. Fork-only.
//
// The UI cannot import from bin/, so common/launchCommand.ts carries the same value; a spec pins the two.
export const LAUNCH_COMMAND = "npx github:highfar-projects/mulmoterminal";

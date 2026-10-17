// The directory the user ran `npx mulmoterminal` in. The launcher spawns the server with the
// package directory as its cwd, so it hands the real one over on the command line (argv is not
// inherited by the PTYs the server spawns, which the environment would be). `yarn dev` runs the
// server directly, where the process's own cwd already is that directory.
export const launchDirFromArgv = (argv: readonly string[], fallback: string): string => {
  const at = argv.indexOf("--launch-dir");
  const value = at === -1 ? undefined : argv[at + 1];
  return value && !value.startsWith("--") ? value : fallback;
};

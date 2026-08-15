// The decisions spawn-shell.ts and the launch route make before they touch a PTY: which shell
// invocation runs a command, what a Shell cell runs when no launcher is configured, and which
// configured launcher an index refers to. All pure and all load-bearing — the invocation differs
// per platform (and only Windows CI would catch a mistake), and the index guard is what stops a
// browser-supplied number from reaching outside the configured allowlist.
import { envValue } from "../infra/pty-env.js";
import { runExecutableCommand } from "../infra/shell-quote.js";

export interface ShellInvocation {
  shell: string;
  args: string[];
}

/** How to run `command` through the platform's shell. `replaceShell` runs it under `exec`
 *  so the program becomes the PTY's foreground process rather than a child of the shell —
 *  POSIX only, since `powershell -Command` already runs exactly the one command. The
 *  command stays a single argv element, so nothing in it is re-split into arguments.
 *  `platform` and `shellPath` are passed in rather than read here, so the choice is a
 *  function of its arguments and both arms can be checked from any host. */
export function shellInvocation(command: string, replaceShell: boolean, platform: string, shellPath: string | undefined): ShellInvocation {
  if (platform === "win32") return { shell: "powershell.exe", args: ["-NoLogo", "-Command", command] };
  return { shell: shellPath || "/bin/bash", args: ["-lc", replaceShell ? `exec ${command}` : command] };
}

const POSIX_FALLBACK_SHELL = "/bin/sh";
// Not `/bin/sh`: on Windows that resolves to `<drive>:\bin\sh` and names nothing, so the fallback
// looked present and protected nobody. ComSpec is where Windows itself records its command
// processor; powershell.exe is the last resort because it is what runs the command anyway.
const WINDOWS_FALLBACK_SHELL = "powershell.exe";

/** What a launch starts. The two arms differ in WHO wrote the thing being started, which is what
 *  decides whether a shell may parse it:
 *
 *  - `command` is the user's own launcher line. It has to reach a shell as text, because that is
 *    what it is — a pipeline, a `&&`, a `$VAR` the user expects to expand. Run verbatim.
 *  - `program` is a file WE chose. Nothing about it needs parsing, so it is spawned directly and
 *    no shell sees it. A path with a space cannot be mis-split if nothing splits it. */
export type LaunchTarget = { kind: "command"; command: string } | { kind: "program"; file: string; args: string[] };

/** Which executable a Shell cell starts when no launcher is configured. Case-insensitive because
 *  Windows spells these names however it likes. */
export function defaultShellPath(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
  const configured = envValue(env, "SHELL");
  if (configured) return configured;
  return platform === "win32" ? envValue(env, "ComSpec") || WINDOWS_FALLBACK_SHELL : POSIX_FALLBACK_SHELL;
}

/** What a Shell cell runs when no launcher is configured — and the reason the two platforms differ
 *  is not symmetry, it is what the wrapper is FOR.
 *
 *  On Windows the wrapper bought nothing. `powershell -Command "& '<path>'"` starts PowerShell only
 *  to have it start the real shell, and the string in between is a parser that split
 *  `C:\Program Files\Git\usr\bin\bash.exe` at the first space (#1717). Spawning the file removes
 *  the parser rather than satisfying it, and costs one process less.
 *
 *  On POSIX the wrapper is LOAD-BEARING and stays. `shellInvocation` runs the command under
 *  `$SHELL -lc`, and the `-l` is a login shell: it sources `.zprofile` / `.bash_profile`, whose
 *  PATH edits the interactive shell then inherits across the `exec`. Spawning `/bin/zsh` directly
 *  would source only `.zshrc`, so a user's login PATH would quietly go missing — a regression no
 *  test here would catch, because it depends on the developer's own dotfiles. */
export function defaultShellTarget(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): LaunchTarget {
  const path = defaultShellPath(platform, env);
  if (platform === "win32") return { kind: "program", file: path, args: [] };
  return { kind: "command", command: runExecutableCommand(path, platform) };
}

/** How to start a `LaunchTarget`. A program is handed to the PTY as file + argv; a command goes
 *  through the platform's shell under `exec`, the way a launcher chip always has. */
export function launchInvocation(target: LaunchTarget, platform: string, shellPath: string | undefined): ShellInvocation {
  if (target.kind === "program") return { shell: target.file, args: target.args };
  return shellInvocation(target.command, true, platform, shellPath);
}

/** What the start/exit log line names. A launcher's own text, or the file we picked for it. */
export const launchTargetLabel = (target: LaunchTarget): string => (target.kind === "program" ? target.file : target.command);

/** The entry at `index`, or null when the index is not a real position in the list. The
 *  browser sends only an index — the configured list is the allowlist — so a fractional,
 *  negative, or past-the-end index has to resolve to nothing rather than to undefined. */
export function launcherAt<T>(list: readonly T[], index: number): T | null {
  return Number.isInteger(index) && index >= 0 && index < list.length ? (list[index] ?? null) : null;
}

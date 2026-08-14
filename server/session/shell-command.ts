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

/** What a Shell cell runs when no launcher is configured.
 *
 *  `$SHELL` is an executable PATH, and the value it feeds is parsed AGAIN by the shell that runs
 *  it — so it has to arrive as one quoted, invoked thing. Git for Windows sets it to
 *  `C:\Program Files\Git\usr\bin\bash.exe`, which PowerShell split at the first space and reported
 *  as an unknown command `C:\Program` (#1717). POSIX only escaped that by the accident of `$SHELL`
 *  having no space in it.
 *
 *  The shell itself is unchanged — a configured `$SHELL` is still honoured on both platforms.
 *  `env` and `platform` are parameters so both arms are checkable from any host, and the lookup is
 *  case-insensitive because Windows spells these names however it likes. */
export function defaultShellCommand(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
  const configured = envValue(env, "SHELL");
  if (platform !== "win32") return runExecutableCommand(configured || POSIX_FALLBACK_SHELL, platform);
  return runExecutableCommand(configured || envValue(env, "ComSpec") || WINDOWS_FALLBACK_SHELL, platform);
}

/** The entry at `index`, or null when the index is not a real position in the list. The
 *  browser sends only an index — the configured list is the allowlist — so a fractional,
 *  negative, or past-the-end index has to resolve to nothing rather than to undefined. */
export function launcherAt<T>(list: readonly T[], index: number): T | null {
  return Number.isInteger(index) && index >= 0 && index < list.length ? (list[index] ?? null) : null;
}

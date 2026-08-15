// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  shellInvocation,
  launcherAt,
  defaultShellPath,
  defaultShellTarget,
  launchInvocation,
  launchTargetLabel,
} from "../../../server/session/shell-command.js";

// platform and SHELL are parameters, so both branches are exercised on every runner —
// otherwise the Windows arm would only ever be checked by the Windows CI job.
describe("shellInvocation", () => {
  describe("posix", () => {
    it("runs the command through the login shell", () => {
      expect(shellInvocation("ls -la", false, "darwin", "/bin/zsh")).toEqual({ shell: "/bin/zsh", args: ["-lc", "ls -la"] });
    });

    it("execs the command when it must become the foreground process", () => {
      // Without exec the launcher's program is a CHILD of the shell, so the pty's
      // foreground process is the shell and the program never owns the terminal.
      expect(shellInvocation("codex", true, "linux", "/bin/zsh")).toEqual({ shell: "/bin/zsh", args: ["-lc", "exec codex"] });
    });

    it("falls back to /bin/bash when SHELL is unset or empty", () => {
      expect(shellInvocation("ls", false, "darwin", undefined).shell).toBe("/bin/bash");
      expect(shellInvocation("ls", false, "darwin", "").shell).toBe("/bin/bash");
    });

    it("keeps the whole command as one argv element", () => {
      // The shell parses it, not execve — so quotes, spaces and operators survive
      // intact rather than being split into separate arguments.
      const { args } = shellInvocation("echo 'a b' && ls | wc -l", false, "linux", "/bin/zsh");
      expect(args).toEqual(["-lc", "echo 'a b' && ls | wc -l"]);
    });
  });

  describe("windows", () => {
    it("runs the command through powershell", () => {
      expect(shellInvocation("dir", false, "win32", undefined)).toEqual({ shell: "powershell.exe", args: ["-NoLogo", "-Command", "dir"] });
    });

    it("ignores SHELL, which is a posix concept", () => {
      expect(shellInvocation("dir", false, "win32", "/bin/zsh").shell).toBe("powershell.exe");
    });

    it("has no exec form — powershell -Command already runs the one command", () => {
      expect(shellInvocation("codex", true, "win32", undefined)).toEqual(shellInvocation("codex", false, "win32", undefined));
    });
  });
});

// What a Shell cell runs with no launcher configured. The value is an executable PATH, and the
// two platforms reach it differently on purpose: Windows spawns the file, POSIX keeps the login
// shell wrapper because `-l` is what sources the user's profile (#1717, #1720).
describe("defaultShellPath", () => {
  const GIT_BASH = "C:\\Program Files\\Git\\usr\\bin\\bash.exe";

  it("honours a configured SHELL on either platform", () => {
    expect(defaultShellPath("win32", { SHELL: GIT_BASH })).toBe(GIT_BASH);
    expect(defaultShellPath("darwin", { SHELL: "/bin/zsh" })).toBe("/bin/zsh");
  });

  it("falls back to ComSpec on Windows, never to /bin/sh", () => {
    // `/bin/sh` resolves to <drive>:\bin\sh on Windows and names nothing.
    const path = defaultShellPath("win32", { ComSpec: "C:\\Windows\\system32\\cmd.exe" });
    expect(path).toBe("C:\\Windows\\system32\\cmd.exe");
    expect(path).not.toContain("/bin/sh");
  });

  it("reads the environment case-insensitively, the way Windows spells it", () => {
    expect(defaultShellPath("win32", { COMSPEC: "C:\\Windows\\system32\\cmd.exe" })).toBe("C:\\Windows\\system32\\cmd.exe");
  });

  it("falls back to powershell.exe when the Windows environment names nothing", () => {
    expect(defaultShellPath("win32", {})).toBe("powershell.exe");
  });

  it("falls back to /bin/sh off Windows", () => {
    expect(defaultShellPath("linux", {})).toBe("/bin/sh");
  });

  // Set-but-empty, not absent: envValue answers "" for that, and "" as a shell path spawns nothing.
  it("treats an empty value as unset", () => {
    expect(defaultShellPath("win32", { SHELL: "", ComSpec: "C:\\Windows\\system32\\cmd.exe" })).toBe("C:\\Windows\\system32\\cmd.exe");
    expect(defaultShellPath("win32", { SHELL: "", ComSpec: "" })).toBe("powershell.exe");
    expect(defaultShellPath("linux", { SHELL: "" })).toBe("/bin/sh");
  });

  it("prefers a configured SHELL over ComSpec", () => {
    expect(defaultShellPath("win32", { SHELL: GIT_BASH, ComSpec: "C:\\Windows\\system32\\cmd.exe" })).toBe(GIT_BASH);
  });
});

describe("defaultShellTarget", () => {
  const GIT_BASH = "C:\\Program Files\\Git\\usr\\bin\\bash.exe";

  // The point of the whole change: on Windows nothing parses the path, so a space in it cannot be
  // mis-split. PowerShell used to sit in the middle and split it at `C:\Program` (#1717).
  it("spawns the file itself on Windows, with no shell in between", () => {
    expect(defaultShellTarget("win32", { SHELL: GIT_BASH })).toEqual({ kind: "program", file: GIT_BASH, args: [] });
  });

  // POSIX keeps the wrapper because `-l` sources the login profile; spawning the shell directly
  // would drop the user's `.zprofile` PATH. Quoted, so a space there is safe too.
  it("keeps the login shell wrapper off Windows", () => {
    expect(defaultShellTarget("darwin", { SHELL: "/opt/my shell/bash" })).toEqual({ kind: "command", command: "'/opt/my shell/bash'" });
  });
});

describe("launchInvocation", () => {
  it("hands a program to the PTY as file and argv, untouched", () => {
    const target = defaultShellTarget("win32", { SHELL: "C:\\Program Files\\Git\\usr\\bin\\bash.exe" });
    expect(launchInvocation(target, "win32", undefined)).toEqual({ shell: "C:\\Program Files\\Git\\usr\\bin\\bash.exe", args: [] });
  });

  it("runs a launcher's own command line through the login shell under exec", () => {
    // A chip is the user's text and must stay text — a pipeline, a `&&`, a `$VAR` to expand.
    const target = { kind: "command", command: "yarn dev | tee log" } as const;
    expect(launchInvocation(target, "darwin", "/bin/zsh")).toEqual({ shell: "/bin/zsh", args: ["-lc", "exec yarn dev | tee log"] });
  });

  it("still routes a POSIX default shell through the wrapper", () => {
    const target = defaultShellTarget("linux", { SHELL: "/bin/zsh" });
    expect(launchInvocation(target, "linux", "/bin/zsh")).toEqual({ shell: "/bin/zsh", args: ["-lc", "exec '/bin/zsh'"] });
  });
});

describe("launchTargetLabel", () => {
  it("names the file for a program and the text for a command", () => {
    expect(launchTargetLabel({ kind: "program", file: "C:\\sh.exe", args: [] })).toBe("C:\\sh.exe");
    expect(launchTargetLabel({ kind: "command", command: "yarn dev" })).toBe("yarn dev");
  });
});

// The browser sends only an index; the configured list IS the allowlist. Anything that is
// not a real position must resolve to null rather than to undefined, which would spawn a
// launcher with no command.
describe("launcherAt", () => {
  const list = [
    { label: "shell", command: "$SHELL" },
    { label: "codex", command: "codex" },
    { label: "top", command: "top" },
  ];

  it("returns the entry at a valid index", () => {
    expect(launcherAt(list, 1)).toEqual({ label: "codex", command: "codex" });
  });

  it("accepts the first and last positions", () => {
    expect(launcherAt(list, 0)).toBe(list[0]);
    expect(launcherAt(list, 2)).toBe(list[2]);
  });

  it("rejects one past either end", () => {
    expect(launcherAt(list, -1)).toBeNull();
    expect(launcherAt(list, 3)).toBeNull();
  });

  it("rejects a wildly out-of-range index", () => {
    expect(launcherAt(list, 9999)).toBeNull();
    expect(launcherAt(list, -9999)).toBeNull();
  });

  it("rejects a non-integer index", () => {
    expect(launcherAt(list, 1.5)).toBeNull();
    expect(launcherAt(list, NaN)).toBeNull();
    expect(launcherAt(list, Infinity)).toBeNull();
    expect(launcherAt(list, -Infinity)).toBeNull();
  });

  it("resolves nothing when no launcher is configured", () => {
    expect(launcherAt([], 0)).toBeNull();
  });
});

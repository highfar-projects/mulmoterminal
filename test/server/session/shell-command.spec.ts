// @vitest-environment node
import { describe, it, expect } from "vitest";
import { shellInvocation, launcherAt, defaultShellCommand } from "../../../server/session/shell-command.js";

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

// What a Shell cell runs with no launcher configured. The value is an executable PATH that the
// shell parses again, so the only thing under test is that it arrives as one invoked thing —
// #1717, where `C:\Program Files\Git\usr\bin\bash.exe` reached PowerShell bare and was reported
// as an unknown command `C:\Program`.
describe("defaultShellCommand", () => {
  const GIT_BASH = "C:\\Program Files\\Git\\usr\\bin\\bash.exe";

  describe("windows", () => {
    it("quotes AND invokes a shell path containing a space", () => {
      // The `&` is not decoration: without it PowerShell evaluates the quoted path as a string
      // expression, prints it, and starts no shell at all — a worse failure than the bug, because
      // nothing errors.
      expect(defaultShellCommand("win32", { SHELL: GIT_BASH })).toBe(`& 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'`);
    });

    it("invokes a path with no space the same way", () => {
      // No branch on "does it look like it needs quoting" — that is a guess about text.
      expect(defaultShellCommand("win32", { SHELL: "C:\\tools\\bash.exe" })).toBe(`& 'C:\\tools\\bash.exe'`);
    });

    it("closes a single quote in the path instead of letting it end the literal", () => {
      expect(defaultShellCommand("win32", { SHELL: "C:\\o'brien\\sh.exe" })).toBe(`& 'C:\\o''brien\\sh.exe'`);
    });

    it("falls back to ComSpec, never to /bin/sh", () => {
      // `/bin/sh` resolves to <drive>:\bin\sh on Windows and names nothing.
      const command = defaultShellCommand("win32", { ComSpec: "C:\\Windows\\system32\\cmd.exe" });
      expect(command).toBe(`& 'C:\\Windows\\system32\\cmd.exe'`);
      expect(command).not.toContain("/bin/sh");
    });

    it("falls back to powershell.exe when the environment names nothing", () => {
      expect(defaultShellCommand("win32", {})).toBe(`& 'powershell.exe'`);
    });

    // Set-but-empty, not absent: `envValue` answers "" for that, and "" as a shell path would
    // spawn nothing. The sibling shellInvocation spec pins the same case, so this one does too.
    it("treats an empty SHELL as unset and moves on to ComSpec", () => {
      expect(defaultShellCommand("win32", { SHELL: "", ComSpec: "C:\\Windows\\system32\\cmd.exe" })).toBe(`& 'C:\\Windows\\system32\\cmd.exe'`);
    });

    it("treats an empty ComSpec as unset too", () => {
      expect(defaultShellCommand("win32", { SHELL: "", ComSpec: "" })).toBe(`& 'powershell.exe'`);
    });

    it("reads the environment case-insensitively, the way Windows spells it", () => {
      expect(defaultShellCommand("win32", { COMSPEC: "C:\\Windows\\system32\\cmd.exe" })).toBe(`& 'C:\\Windows\\system32\\cmd.exe'`);
    });

    it("prefers a configured SHELL over ComSpec", () => {
      expect(defaultShellCommand("win32", { SHELL: GIT_BASH, ComSpec: "C:\\Windows\\system32\\cmd.exe" })).toContain("bash.exe");
    });
  });

  describe("posix", () => {
    it("quotes the shell path", () => {
      // POSIX had the same hole and only escaped it because $SHELL has no space in practice.
      expect(defaultShellCommand("darwin", { SHELL: "/bin/zsh" })).toBe("'/bin/zsh'");
    });

    it("has no call operator — quoting alone runs it", () => {
      expect(defaultShellCommand("linux", { SHELL: "/opt/my shell/bash" })).toBe("'/opt/my shell/bash'");
    });

    it("falls back to /bin/sh", () => {
      expect(defaultShellCommand("linux", {})).toBe("'/bin/sh'");
    });

    it("treats an empty SHELL as unset", () => {
      expect(defaultShellCommand("linux", { SHELL: "" })).toBe("'/bin/sh'");
    });
  });

  // The whole point is what shellInvocation then does with it: the command must stay ONE argv
  // element on both platforms, or the space is re-split a layer later.
  it("survives shellInvocation as a single argument", () => {
    const windows = shellInvocation(defaultShellCommand("win32", { SHELL: GIT_BASH }), true, "win32", undefined);
    expect(windows.args).toEqual(["-NoLogo", "-Command", `& 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'`]);

    const posix = shellInvocation(defaultShellCommand("darwin", { SHELL: "/bin/zsh" }), true, "darwin", "/bin/zsh");
    expect(posix.args).toEqual(["-lc", "exec '/bin/zsh'"]);
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

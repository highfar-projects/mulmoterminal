// Is this command present and runnable?
//
// Its own module so the rule can be TESTED. It was inline in mulmoterminal.js, where the only way
// to exercise it was to start the launcher, and the defect below shipped because of that.
//
// `execFileSync`, NOT `execSync`. The command can be a `<AGENT>_BIN` the user set, and a shell both
// SPLITS it and INTERPRETS it. Measured on the shell version (Codex review on #2084):
//
//   CLAUDE_BIN="/…/My Tools/claude"  -> REFUSED; the shell split the path at the space
//   CLAUDE_BIN="true; touch /tmp/X"  -> the `touch` RAN
//
// The first is the case that actually bites — `/Applications/…` has a space — and it broke the very
// override the start-up gate exists to honour (#2082).
//
// The args are an ARRAY for the same reason: `powershell.exe -NoProfile -Command exit` is three
// arguments, and one string would hand it one.
import { execFileSync } from "node:child_process";

/** True when `cmd` runs and exits 0. A bare name still resolves from PATH, which is the point —
 *  detecting the user's installed tools is what the pre-flight and `init` checks are for. */
export function hasCommand(cmd, versionArgs = ["--version"], run = execFileSync) {
  try {
    run(cmd, versionArgs, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

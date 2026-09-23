// @vitest-environment node
//
// ONE invariant, in both directions: the CLI start-up gate (`bin/has-command.js`) and the server's
// pre-spawn check (`server/infra/has-binary.ts`) must answer the SAME question about the SAME
// machine. The gate refuses start-up; the server decides what is launched. When they disagree the
// user gets one of exactly two bad days, and this PR's review produced one of each:
//
//   - gate stricter than the spawn -> start-up refused on a machine that would have run fine
//     (round 6: a quoted Windows PATH entry, an unenumerable POSIX PATH)
//   - gate looser than the spawn  -> start-up says the declared agent is present, then every
//     session dies with node-pty's empty `File not found:` (round 7: the gate honoured PATHEXT,
//     so a `codex.PS1` passed a gate whose spawn path can only run `.exe`/`.com`/`.cmd`/`.bat`)
//
// The two cannot share code — `bin/` is plain JS loaded before anything is built, `server/` is TS
// run through tsx — so they are pinned by COMPARISON instead. This is the same anti-drift shape as
// `bin/agent-bins.js` against its server copy, and it is what makes the extension list in
// has-command.js checkable rather than merely commented.
import { describe, it, expect } from "vitest";
import { hasCommand } from "../../bin/has-command.js";
import { hasBinary, type BinaryProbe } from "../../server/infra/has-binary";

/** A fake disk holding exactly these paths. Case-insensitive on Windows, where the two sides build
 *  `codex.cmd` while npm wrote `codex.CMD` and the volume calls those one file — a case-sensitive
 *  double reports that as a disagreement the real machine does not have. */
const diskWith = (files: readonly string[], platform: NodeJS.Platform): BinaryProbe => {
  const known = new Set(platform === "win32" ? files.map((f) => f.toLowerCase()) : files);
  const here = (candidate: string) => known.has(platform === "win32" ? candidate.toLowerCase() : candidate);
  return { isFile: here, isExecutable: here };
};

type Case = { query: string; disk: readonly string[]; env: NodeJS.ProcessEnv };

const disagreements = (cases: readonly Case[], platform: NodeJS.Platform): string[] =>
  cases.flatMap(({ query, disk, env }) => {
    const probe = diskWith(disk, platform);
    const gate = hasCommand(query, { platform, env, probe });
    const spawn = hasBinary(query, env, platform, probe);
    if (gate === spawn) return [];
    return [`${platform} ${JSON.stringify(query)} on ${JSON.stringify(disk)} with ${JSON.stringify(env)}: gate=${gate} spawn=${spawn}`];
  });

// Every extension a stock Windows PATHEXT carries, plus the two casings npm and Windows disagree
// about. `.ps1`/`.vbs`/`.js`/`.msc`/`.wsf` are the ones that separate "Windows associates it" from
// "CreateProcessW can run it" — exactly the gap round 7 found.
const WINDOWS_EXTENSIONS = ["", ".exe", ".EXE", ".com", ".cmd", ".CMD", ".bat", ".ps1", ".vbs", ".js", ".msc", ".wsf"];
const WINDOWS_DIRS = ["C:\\tools", "C:\\npm"];
// Bare names, names already carrying an extension, and absolute paths both with and without one.
// Relative path-names are deliberately absent — see the docblock on hasCommand for why the two
// sides answer those differently on purpose.
const WINDOWS_QUERIES = ["claude", "codex", "claude.exe", "codex.cmd", "absent", "C:\\tools\\claude.exe", "C:\\tools\\claude"];
// A PATHEXT the gate must now IGNORE. The long one is the real Windows default; `.PS1` alone is
// round 7's reported case; unset and empty are the environments a stripped launcher hands over.
const PATHEXTS = [undefined, ".COM;.EXE;.BAT;.CMD", ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC", ".PS1", ""];

const windowsCases = (): Case[] => {
  const disks = [
    [] as string[],
    ...WINDOWS_DIRS.flatMap((dir) => ["claude", "codex"].flatMap((name) => WINDOWS_EXTENSIONS.map((ext) => [`${dir}\\${name}${ext}`]))),
  ];
  return disks.flatMap((disk) =>
    WINDOWS_QUERIES.flatMap((query) =>
      PATHEXTS.map((PATHEXT) => {
        const env: NodeJS.ProcessEnv = { PATH: WINDOWS_DIRS.join(";") };
        if (PATHEXT !== undefined) env.PATHEXT = PATHEXT;
        return { query, disk, env };
      }),
    ),
  );
};

const POSIX_DIRS = ["/usr/bin", "/opt/bin"];
const POSIX_QUERIES = ["claude", "codex", "absent", "/opt/bin/claude", "/opt/bin/absent"];
// The PATHs the gate must not refuse on because it cannot enumerate them, beside ones it can.
const POSIX_PATHS = [POSIX_DIRS.join(":"), ":/usr/bin", "/usr/bin:", "/a::/b", "tools", "", undefined];

const posixCases = (): Case[] => {
  const disks = [[] as string[], ...POSIX_DIRS.flatMap((dir) => ["claude", "codex"].map((name) => [`${dir}/${name}`]))];
  return disks.flatMap((disk) => POSIX_QUERIES.flatMap((query) => POSIX_PATHS.map((PATH) => ({ query, disk, env: PATH === undefined ? {} : { PATH } }))));
};

describe("the start-up gate answers the same question as the spawn", () => {
  it("agrees with the server on every generated Windows machine", () => {
    const cases = windowsCases();
    expect(cases.length).toBeGreaterThan(1000);
    expect(disagreements(cases, "win32")).toEqual([]);
  });

  it("agrees with the server on every generated POSIX machine", () => {
    const cases = posixCases();
    expect(cases.length).toBeGreaterThan(100);
    expect(disagreements(cases, "linux")).toEqual([]);
  });

  // The generators above are worthless if every case answers the same way. Both verdicts have to
  // appear, or a bug that makes one side constant would read as perfect agreement.
  it("generates machines where the answer is yes and machines where it is no", () => {
    const answers = (cases: readonly Case[], platform: NodeJS.Platform) =>
      new Set(cases.map(({ query, disk, env }) => hasBinary(query, env, platform, diskWith(disk, platform))));
    expect(answers(windowsCases(), "win32")).toEqual(new Set([true, false]));
    expect(answers(posixCases(), "linux")).toEqual(new Set([true, false]));
  });
});

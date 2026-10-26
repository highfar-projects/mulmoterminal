// @vitest-environment node
//
// A bot job's run.sh (plans/feat-bot-gpu-jobs.md). The approval prompt is the only thing standing
// between another machine's code and this one, so the script is RUN here under /bin/sh rather than
// only read: a typed `y` runs it, anything else does not, and the outcome lands where the waiting
// handler looks for it.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DECLINED_FILE,
  EXIT_CODE_FILE,
  JOB_FILE,
  MAX_OUTPUT_BYTES,
  MAX_SCRIPT_BYTES,
  OUTPUT_FILE,
  RUN_FILE,
  buildRunScript,
  expandHome,
  outputTail,
  parseBotJobRequest,
  parseExitCode,
  printable,
  shellQuote,
  visible,
  type BotJobRequest,
} from "../../../../server/backends/botJobs/jobScript.js";

const job = (over: Partial<BotJobRequest> = {}): BotJobRequest => ({ script: "print('hi')", args: [], name: null, from: "GrokBot", ...over });

describe("parseBotJobRequest", () => {
  it("reads what submitBotJob writes, naming the sender from `from`", () => {
    expect(parseBotJobRequest({ script: "print(1)", args: ["--n", "3"], name: "sdxl", from: { tokenId: "t", name: "GrokBot" } })).toEqual({
      script: "print(1)",
      args: ["--n", "3"],
      name: "sdxl",
      from: "GrokBot",
    });
  });

  it("does not trust a sender it cannot read", () => {
    expect(parseBotJobRequest({ script: "print(1)" }).from).toBe("an unnamed bot");
  });

  it("refuses what it must not run, even though mulmoserver checked it", () => {
    for (const params of [
      {},
      { script: "  " },
      { script: "x".repeat(MAX_SCRIPT_BYTES + 1) },
      { script: "p", args: "x" },
      { script: "p", args: [1] },
      { script: "p", name: 3 },
    ]) {
      expect(() => parseBotJobRequest(params as never)).toThrow();
    }
  });
});

describe("the pieces run.sh is built from", () => {
  it.skipIf(process.platform === "win32")("quotes an argument so nothing in it is expanded", () => {
    const out = spawnSync("/bin/sh", ["-c", `printf '%s' ${shellQuote('it\'s $HOME `id` "x"')}`], { encoding: "utf8" });
    expect(out.stdout).toBe('it\'s $HOME `id` "x"');
  });

  it("turns control bytes in a label into spaces", () => {
    expect(printable("Grok\u001b[2J\u001b[HBot\n")).toBe("Grok [2J [HBot");
  });

  it("draws control bytes the way cat -v does", () => {
    expect(visible("a\u001b[1mb\tc\u007f\u009b")).toBe("a^[[1mb^Ic^?<U+009B>");
  });

  it("expands only a leading ~/", () => {
    expect(expandHome("~/venv/bin/python", "/Users/u")).toBe("/Users/u/venv/bin/python");
    expect(expandHome("/opt/python", "/Users/u")).toBe("/opt/python");
    expect(expandHome("python3", "/Users/u")).toBe("python3");
  });

  it("caps the output it sends, not the bytes it read, when the job printed invalid UTF-8", () => {
    const { output, truncated } = outputTail(Buffer.alloc(1000, 0xff), 100);
    expect(truncated).toBe(true);
    expect(Buffer.byteLength(output, "utf8")).toBeLessThanOrEqual(100);
  });

  it("keeps the tail of a long output and says so", () => {
    expect(outputTail(Buffer.from("abc"), 10)).toEqual({ output: "abc", truncated: false });
    expect(outputTail(Buffer.from("0123456789"), 4)).toEqual({ output: "6789", truncated: true });
    // A cut inside a three-byte character drops the broken half rather than showing U+FFFD.
    expect(outputTail(Buffer.from("aあい"), 4)).toEqual({ output: "い", truncated: true });
  });

  it("reads the exit code the shell wrote", () => {
    expect(parseExitCode("0\n")).toBe(0);
    expect(parseExitCode("130\n")).toBe(130);
    expect(parseExitCode("")).toBeNull();
  });
});

// Bot jobs are not offered on Windows (the handler refuses), and there is no /bin/sh to run this with.
describe.skipIf(process.platform === "win32")("run.sh, run", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "bot-job-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // `python` is replaced by /bin/sh, so job.py is a shell script here; the script's last line execs
  // $SHELL, which is pointed at `true` so the run ends.
  const run = (script: string, answer: string, over: Partial<BotJobRequest> = {}) => {
    writeFileSync(path.join(dir, JOB_FILE), script);
    writeFileSync(path.join(dir, RUN_FILE), buildRunScript(job({ script, ...over }), "/bin/sh"));
    return spawnSync("/bin/sh", [path.join(dir, RUN_FILE)], {
      input: answer,
      encoding: "utf8",
      env: { ...process.env, SHELL: "/usr/bin/true" },
      cwd: os.tmpdir(),
    });
  };

  it("runs on y, with the args, and records the exit code and the output", () => {
    const out = run('echo "args: $1 $2"; echo oops >&2; exit 3', "y\n", { args: ["one", "two words"] });
    expect(out.stdout).toContain("Run this job? [y/N]");
    expect(readFileSync(path.join(dir, EXIT_CODE_FILE), "utf8").trim()).toBe("3");
    const output = readFileSync(path.join(dir, OUTPUT_FILE), "utf8");
    expect(output).toContain("args: one two words");
    expect(output).toContain("oops");
    expect(existsSync(path.join(dir, DECLINED_FILE))).toBe(false);
  });

  it("keeps only the tail of a long output on disk, one byte past what is sent back", () => {
    run(`head -c ${MAX_OUTPUT_BYTES * 2} /dev/zero | tr '\\0' x; printf END`, "y\n");
    const kept = readFileSync(path.join(dir, OUTPUT_FILE), "utf8");
    expect(kept.length).toBe(MAX_OUTPUT_BYTES + 1);
    expect(kept.endsWith("xEND")).toBe(true);
  });

  it.each(["n\n", "\n", "yes please\n", ""])("declines and runs nothing on %j", (answer) => {
    run("touch ran", answer);
    expect(existsSync(path.join(dir, DECLINED_FILE))).toBe(true);
    expect(existsSync(path.join(dir, "ran"))).toBe(false);
    expect(existsSync(path.join(dir, EXIT_CODE_FILE))).toBe(false);
  });

  it("shows the script with its control characters visible, so it cannot repaint the prompt", () => {
    const out = run("# \u001b[2J\u001b[Hharmless\n", "n\n");
    expect(out.stdout).toContain("^[[2J^[[H");
    expect(out.stdout).not.toContain("\u001b[2J");
  });

  // An argument is the bot's text too: printed raw on the Command line it could clear the preview
  // and redraw it. It is drawn visibly there and still reaches the job unchanged.
  it("draws an argument's control bytes visibly on the command line, and runs it as sent", () => {
    const out = run('printf "%s" "$1" > arg', "y\n", { args: ["a\u001b[2Jb\nc"] });
    expect(out.stdout).toContain("'a^[[2Jb^Jc'");
    expect(out.stdout).not.toContain("\u001b[2J");
    expect(readFileSync(path.join(dir, "arg"), "utf8")).toBe("a\u001b[2Jb\nc");
  });

  it("shows the bot's name and the job's name, stripped of control bytes", () => {
    const out = run("true", "n\n", { from: "Grok\u001b[2JBot", name: "sdxl" });
    expect(out.stdout).toContain("Bot job from Grok [2JBot: sdxl");
  });
});

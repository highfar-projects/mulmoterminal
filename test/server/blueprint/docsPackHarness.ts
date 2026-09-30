// A scratch folder for the document packs' checks, with a stand-in chaff (CHAFF_BIN) that answers from
// files in a second folder. The checks are judged on what they do with chaff's output — never on the
// network or on whichever chaff version is published today.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isRecord } from "../../../common/isRecord";

export const PACKS = join(import.meta.dirname, "..", "..", "..", "blueprints");
export const BASE = join(PACKS, "docs");

// `rules --json` prints rules.json (exit code from rules.code). `tree <file> --format json` prints
// tree.json[<path as given>] or tree.json[<file name>] (an empty tree when absent). `cite <source> <claims>` appends the claims
// to cite.log and exits with cite.json[<source file name>] (0 when absent). `--help` prints help.txt (a chaff
// without `feedback` when absent). `feedback <args>` appends its args to feedback.log, writes .chaff-feedback.md in
// the folder, and exits with feedback.code (0 when absent). Anything else is a lint run:
// `<target> --sarif <path>` writes findings.json[<target>] as SARIF (line 1 unless an entry names one), and
// appends its arguments to lint.log.
const FAKE_CHAFF = `
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
const dir = process.env.FAKE_CHAFF;
const args = process.argv.slice(2);
const json = (file, fallback) => (existsSync(join(dir, file)) ? JSON.parse(readFileSync(join(dir, file), "utf8")) : fallback);
if (args[0] === "rules") {
  const code = existsSync(join(dir, "rules.code")) ? Number(readFileSync(join(dir, "rules.code"), "utf8")) : 0;
  if (code !== 0) { console.error("chaff: broken config"); process.exit(code); }
  process.stdout.write(readFileSync(join(dir, "rules.json"), "utf8"));
  process.exit(0);
}
if (args[0] === "tree") {
  const trees = json("tree.json", {});
  const tree = trees[args[1]] ?? trees[basename(args[1])] ?? { address: "", children: [] };
  process.stdout.write(JSON.stringify(tree));
  process.exit(0);
}
if (args[0] === "--help") {
  process.stdout.write(existsSync(join(dir, "help.txt")) ? readFileSync(join(dir, "help.txt"), "utf8") : "chaff <file|dir|glob>...\\n");
  process.exit(0);
}
if (args[0] === "feedback") {
  appendFileSync(join(dir, "feedback.log"), args.slice(1).join(" ") + "\\n");
  const code = existsSync(join(dir, "feedback.code")) ? Number(readFileSync(join(dir, "feedback.code"), "utf8")) : 0;
  // A failing chaff may still have written a draft; failline.txt names the one call (its --line) that fails.
  const failLine = existsSync(join(dir, "failline.txt")) ? readFileSync(join(dir, "failline.txt"), "utf8").trim() : "";
  writeFileSync(".chaff-feedback.md", "draft for " + args.slice(1).join(" "));
  if (failLine !== "" && args.includes(failLine)) process.exit(1);
  process.exit(code);
}
if (args[0] === "cite") {
  appendFileSync(join(dir, "cite.log"), basename(args[1]) + " " + readFileSync(args[2], "utf8") + "\\n");
  const code = json("cite.json", {})[basename(args[1])] ?? 0;
  if (code !== 0) console.log("✗ quote not found in " + basename(args[1]));
  process.exit(code);
}
appendFileSync(join(dir, "lint.log"), args.join(" ") + "\\n");
const listed = json("findings.json", {})[args[0]] ?? [];
const results = listed.map((f) => ({ ruleId: "chaff/" + f.rule, level: f.level, message: { text: f.message ?? "" }, locations: [{ physicalLocation: { artifactLocation: { uri: f.file }, region: { startLine: f.line ?? 1 } } }] }));
writeFileSync(args[args.indexOf("--sarif") + 1], JSON.stringify({ runs: [{ tool: {}, results }] }));
`;

export type Harness = {
  readonly dir: () => string;
  readonly fake: () => string;
  readonly write: (file: string, content: unknown) => void;
  readonly writeFake: (file: string, content: unknown) => void;
  readonly run: (command: string, args: string[]) => { code: number; stderr: string };
  readonly node: (script: string, args?: string[]) => { code: number; stderr: string };
  readonly setUp: () => void;
  readonly tearDown: () => void;
};

const text = (content: unknown): string => (typeof content === "string" ? content : JSON.stringify(content));

/** One harness per spec file: setUp in beforeEach, tearDown in afterEach. */
export function docsPackHarness(usecase: string): Harness {
  const usecaseDir = join(PACKS, usecase);
  const state = { dir: "", fake: "" };
  const run = (command: string, args: string[]): { code: number; stderr: string } => {
    try {
      execFileSync(command, args, {
        cwd: state.dir,
        env: {
          ...process.env,
          BLUEPRINT_BASE: BASE,
          BLUEPRINT_USECASE: usecaseDir,
          FAKE_CHAFF: state.fake,
          CHAFF_BIN: `node ${join(state.fake, "chaff.mjs")}`,
        },
        stdio: "pipe",
      });
      return { code: 0, stderr: "" };
    } catch (err) {
      if (!isRecord(err)) return { code: 1, stderr: String(err) };
      return { code: typeof err.status === "number" ? err.status : 1, stderr: Buffer.isBuffer(err.stderr) ? err.stderr.toString() : "" };
    }
  };
  return {
    dir: () => state.dir,
    fake: () => state.fake,
    write: (file, content) => writeFileSync(join(state.dir, file), text(content)),
    writeFake: (file, content) => writeFileSync(join(state.fake, file), text(content)),
    run,
    node: (script, args = []) => run(process.execPath, [join(usecaseDir, "checks", script), ...args]),
    setUp: () => {
      state.dir = mkdtempSync(join(tmpdir(), `bp-${usecase}-`));
      state.fake = mkdtempSync(join(tmpdir(), "bp-chaff-"));
      mkdirSync(join(state.dir, ".blueprint"));
      writeFileSync(join(state.fake, "chaff.mjs"), FAKE_CHAFF);
    },
    tearDown: () => {
      rmSync(state.dir, { recursive: true, force: true });
      rmSync(state.fake, { recursive: true, force: true });
    },
  };
}

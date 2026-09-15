// @vitest-environment node
//
// WHO MAY READ THE DEFAULT-AGENT SETTING. An allowlist, not a list of bad shapes.
//
// Three rounds of this PR's review found the same mistake at three different controls: the value
// arrives over HTTP, and a control that SAMPLES it at setup shows whatever was true when that
// request happened to finish. Each was fixed on its own, and the third still existed. So the rule
// was inverted — `launchAgentPick` follows the late arrival, and a control gets its value from
// there rather than remembering to watch.
//
// This guard fails CLOSED: a new reader is reported until someone adds it here and says why. It
// deliberately rejects readers that would have been fine, which is the trade being made — the
// alternative is a list of forbidden spellings, and there is always one more spelling.
//
// LIMIT, stated so nobody trusts it further than it goes: it matches the IMPORT, so a module that
// reaches the setting some other way — re-exported, passed in as a prop, read off the config
// payload directly — is invisible here.
//
// Under test/scripts because it reads the filesystem: test/src is type-checked by the app project,
// which has no node types (tsconfig.test.json extends tsconfig.app.json).
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dirname, "../../src");

/** Every module permitted to import from composables/defaultAgent, and the reason it is allowed. */
const PERMITTED = new Map([
  ["composables/launchAgentPick.ts", "owns the rule: seeds a control and follows the late arrival"],
  ["composables/useAppConfig.ts", "hydrates it from /api/config"],
  ["components/LaunchAgentPicker.vue", "compares inside a computed, which re-evaluates when it lands"],
]);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

// RESOLVED, not matched by spelling: `./defaultAgent` and `../composables/defaultAgent` are the
// same module, and `../../common/defaultAgent` is a DIFFERENT one that everything may read. A
// regex over the text alone gets both of those wrong.
const SETTING = path.join(SRC, "composables", "defaultAgent");

const importsTheSetting = (file: string, source: string): boolean =>
  [...source.matchAll(/from "([^"]*defaultAgent)"/g)].some(
    ([, specifier]) => specifier.startsWith(".") && path.resolve(path.dirname(file), specifier) === SETTING,
  );

const readers = (): string[] =>
  walk(SRC)
    .filter((file) => /\.(ts|vue)$/.test(file))
    .filter((file) => importsTheSetting(file, readFileSync(file, "utf8")))
    .map((file) => path.relative(SRC, file).split(path.sep).join("/"));

describe("who may read the configured default agent", () => {
  it("is exactly the permitted list, so a new control cannot sample it by accident", () => {
    expect(readers().sort()).toEqual([...PERMITTED.keys()].sort());
  });

  // The allowlist is worthless if it names files that no longer import it: the assertion above
  // would then be satisfied by a stale entry rather than by a real reader.
  it("names no module that has stopped reading it", () => {
    const actual = new Set(readers());
    expect([...PERMITTED.keys()].filter((file) => !actual.has(file))).toEqual([]);
  });

  // And worthless if the matcher finds nothing at all, which is how a guard quietly stops guarding.
  it("finds the readers it is scanning for", () => {
    expect(readers().length).toBeGreaterThan(0);
  });

  // The near-miss half. `common/defaultAgent.ts` is the shared RULE, which anything may read; only
  // the composable holding the hydrated ref is restricted. A matcher that confused the two would
  // report a long list of violations and look like it was working hard.
  it("does not mistake the shared rule module for the setting", () => {
    expect(importsTheSetting(path.join(SRC, "components/Foo.vue"), 'import { newSessionAgent } from "../../common/defaultAgent";')).toBe(false);
    expect(importsTheSetting(path.join(SRC, "components/Foo.vue"), 'import { defaultAgent } from "../composables/defaultAgent";')).toBe(true);
    expect(importsTheSetting(path.join(SRC, "composables/Bar.ts"), 'import { defaultAgent } from "./defaultAgent";')).toBe(true);
  });
});

// Fakes for the executor specs: sessions are recorded instead of spawned, a turn ends when the test says so,
// and checks answer from a table (held back while `checkGate` is set). Shared by every executor spec.
import type { ExecutorDeps } from "../../../server/blueprint/executor";
import type { RunStore } from "../../../server/blueprint/runStore";
import type { BlueprintRun } from "../../../common/blueprint/run";
import type { BlueprintState } from "../../../common/blueprint/state";
import type { ComposedStep } from "../../../common/blueprint/plan";

export const step = (id: string, gates: ComposedStep["gates"] = []): ComposedStep => ({
  id,
  title: id,
  description: "",
  skill: `skills/${id}`,
  check: `check-${id}`,
  gates,
  origin: "base",
});

export function memoryStore(): RunStore & { saved: Map<string, { run: BlueprintRun; state: BlueprintState }> } {
  const saved = new Map<string, { run: BlueprintRun; state: BlueprintState }>();
  return {
    saved,
    list: async () => [...saved.keys()],
    load: async (id) => structuredClone(saved.get(id) ?? null),
    save: async (run, state) => void saved.set(run.id, structuredClone({ run, state })),
  };
}

export type ExecutorFakes = {
  readonly spawned: { cwd: string; prompt: string; sessionId: string }[];
  readonly turnHooks: Map<string, (outcome: { didError: boolean }) => Promise<void>>;
  readonly checkResults: Record<string, boolean[]>;
  readonly checksRun: string[];
  readonly files: Map<string, string>;
  readonly closed: string[];
  readonly store: ReturnType<typeof memoryStore>;
  checkGate: Promise<void> | null;
  deps: ExecutorDeps;
  /** The last time `now` handed out. */
  readonly clockNow: () => number;
};

const FIRST_CLOCK_MS = 1000;

export function executorFakes(): ExecutorFakes {
  let clock = FIRST_CLOCK_MS;
  const fakes: Omit<ExecutorFakes, "deps" | "clockNow"> = {
    spawned: [],
    turnHooks: new Map(),
    checkResults: {},
    checksRun: [],
    files: new Map(),
    closed: [],
    store: memoryStore(),
    checkGate: null,
  };
  const deps: ExecutorDeps = {
    store: fakes.store,
    spawnStepSession: (cwd, prompt, sessionId) => void fakes.spawned.push({ cwd, prompt, sessionId }),
    newSessionId: () => `s${fakes.spawned.length + 1}`,
    closeSession: (sessionId) => void fakes.closed.push(sessionId),
    projectFiles: {
      read: async (_dir, relativePath) => fakes.files.get(relativePath) ?? null,
      remove: async (_dir, relativePath) => void fakes.files.delete(relativePath),
    },
    onTurnEnded: (sessionId, callback) => void fakes.turnHooks.set(sessionId, callback),
    runCheck: async ({ command }) => {
      fakes.checksRun.push(command);
      if (fakes.checkGate) await fakes.checkGate;
      const ok = fakes.checkResults[command]?.shift() ?? true;
      return { ok, output: ok ? "" : `${command} failed` };
    },
    askCommand: (runId, stepId, sessionId) => `ask ${runId} ${stepId} ${sessionId}`,
    newRunId: () => "run-00000001",
    now: () => ++clock,
  };
  return Object.assign(fakes, { deps, clockNow: () => clock });
}

/** Ends a session's turn the way Claude Code's Stop hook would. */
export const endTurnOf =
  (fakes: ExecutorFakes) =>
  async (sessionId: string, didError = false): Promise<void> => {
    const hook = fakes.turnHooks.get(sessionId);
    if (!hook) throw new Error(`no hook for ${sessionId}`);
    await hook({ didError });
  };

// Drives a blueprint build: start the current step, hand it to a fresh agent session, run its
// check when that session's turn ends, and move on — stopping only where the state says a person
// is needed. The decisions are `nextAction` (common/blueprint/executorPolicy.ts) and the rules are
// `applyEvent`; this file only performs what they say and records the outcome.
//
// One run's work is serialised: a turn ending and a person approving at the same moment must not
// both read the same state and each write their own successor.
import path from "node:path";
import { realpath } from "node:fs/promises";
import { applyEvent, currentStep, initialState, type BlueprintState, type StepEvent } from "../../common/blueprint/state.js";
import { OPEN_QUESTIONS_FILE, SPEC_FILE, replyFile, specRevisionPrompt } from "../../common/blueprint/specRevisionPrompt.js";
import { lastRevisionCheckFailed } from "../../common/blueprint/revisionCheck.js";
import type { Refusal } from "../../common/blueprint/refusal.js";
import type { AskChoice } from "../../common/blueprint/askChoices.js";
import { Refused } from "./refused.js";
import { englishStepNotice, type StepNotice } from "../../common/blueprint/stepNotice.js";
import { changedFiles, type FolderListing, type ChangedFiles } from "../../common/blueprint/changedFiles.js";
import {
  atRoundLimit,
  MAX_FAILED_CHECKS,
  MAX_ROUNDS,
  nextAction,
  shouldRepeat,
  waitsOnBusyFolder,
  type ExecutorAction,
} from "../../common/blueprint/executorPolicy.js";
import { earlierAnswers, stepPrompt } from "../../common/blueprint/stepPrompt.js";
import { localizedManifest } from "../../common/blueprint/packLocale.js";
import { localizedRunSteps, overlayReader } from "./packLocales.js";
import { summarizeRun, type BlueprintRun, type BlueprintRunSummary } from "../../common/blueprint/run.js";
import type { ComposedStep } from "../../common/blueprint/plan.js";
import type { HearingAnswers } from "../../common/blueprint/hearing.js";
import type { PersonLanguage } from "../../common/blueprint/personLanguage.js";
import type { RunStore } from "./runStore.js";
import { declaredRevises, readManifest } from "./packs.js";
import { reportOf } from "../../common/blueprint/manifest.js";
import type { CheckRequest, CheckResult } from "./checkRunner.js";

export interface ExecutorDeps {
  store: RunStore;
  /** Start agent session `sessionId` in `cwd`, running `prompt`. */
  spawnStepSession: (cwd: string, prompt: string, sessionId: string) => void;
  newSessionId: () => string;
  /** Call `callback` once when that session's turn ends — `didError` when it ended without one
   *  (killed, reaped, crashed) rather than by finishing a turn. */
  onTurnEnded: (sessionId: string, callback: (outcome: { didError: boolean }) => Promise<void>) => void;
  runCheck: (request: CheckRequest) => Promise<CheckResult>;
  /** The shell command a step's agent runs to ask the user `$QUESTION` — carrying its session id,
   *  so only the session working on the step can ask. */
  askCommand: (runId: string, stepId: string, sessionId: string) => string;
  newRunId: () => string;
  now: () => number;
  /** Whether an agent can start in the project without a trust prompt nobody is there to answer.
   *  Asked before EVERY session: a step can make the folder a git repository, which takes the
   *  trust it had from its parent away. */
  isTrusted?: (dir: string) => Promise<boolean>;
  /** Files the build keeps in the project (the spec, the agent's reply), read and removed by path. */
  projectFiles: ProjectFiles;
  /** End a session this build started and no longer needs (its terminal closes). Closing one that
   *  is already gone does nothing. */
  closeSession: (sessionId: string) => void;
  /** Writes a build's interview answers to the project's .blueprint/answers.json. */
  writeAnswers?: (dir: string, answers: HearingAnswers) => Promise<void>;
}

export interface ProjectFiles {
  read: (dir: string, relativePath: string) => Promise<string | null>;
  remove: (dir: string, relativePath: string) => Promise<void>;
  list: (dir: string) => Promise<FolderListing>;
}

type ChatOutcome = NonNullable<BlueprintRun["specChat"][number]["outcome"]>;

function replyOutcome(didError: boolean, reply: string | null): ChatOutcome {
  if (didError) return "lost";
  return reply ? "reply" : "no-reply";
}

export interface SpecView {
  spec: string | null;
  openQuestions: string | null;
  chat: BlueprintRun["specChat"];
  revising: boolean;
}

// The spec may be talked over only while the build waits for a person to read it: at a review gate,
// with no agent working and no earlier message still being answered.
function specChatRefusal({ run, state }: { run: BlueprintRun; state: BlueprintState }): Refusal | null {
  const step = currentStep(run.steps, state);
  if (!step || state.steps[step.id]?.status !== "awaiting-approval" || !step.gates.includes("review")) return { code: "spec-not-at-review" };
  if (run.revisionSessionId !== null) return { code: "message-pending" };
  return run.activeSessionId === null ? null : { code: "agent-working" };
}

// A person's events. The agent has its own door (`ask`), and checks are run here, never reported.
export type HumanEvent = Extract<StepEvent, { type: "approve" } | { type: "reject" } | { type: "answer" } | { type: "retry" }>;

// Each pass either changes the state or stops, and a plan has a bounded number of states to pass
// through; the cap only turns a bug in that reasoning into an error instead of a hung server.
const MAX_PASSES_PER_ADVANCE = 64;

export class BlueprintRefusal extends Refused {}

// A session that asked, and was answered before its turn ended, stopped to wait for that answer —
// its work is not finished, so checking it would only burn an attempt. The answer goes to a new
// session instead.
function needsCheck(state: BlueprintState, session: { stepId: string; atMs: number; answersAtStart?: number | undefined }): boolean {
  const stepState = state.steps[session.stepId];
  if (stepState?.status !== "running") return false;
  // Runs recorded before the count existed fall back to comparing times.
  if (session.answersAtStart === undefined) return !stepState.answers.some((entry) => entry.atMs >= session.atMs);
  return stepState.answers.length <= session.answersAtStart;
}

type Loaded = { run: BlueprintRun; state: BlueprintState };

/** A build whose agent or check is working now: a step running (its session, then its check), or its spec being revised. */
const isWorking = ({ run, state }: Loaded): boolean => run.revisionSessionId !== null || Object.values(state.steps).some((step) => step.status === "running");

// Recorded when a step's session ended without finishing a turn. The check script is NOT run for such a
// session: whatever it left behind was not claimed as done.
export const LOST_SESSION_OUTPUT = englishStepNotice({ code: "session-lost" });

// A step starts counting its failures afresh: a person retried it, a round passed, or its check passed.
const withFailuresCleared = (run: BlueprintRun, stepId: string): BlueprintRun => ({
  ...run,
  failedChecks: { ...run.failedChecks, [stepId]: 0 },
  failureOutputs: { ...run.failureOutputs, [stepId]: [] },
});

export interface CreateRunRequest {
  projectDir: string;
  basePackDir: string;
  usecasePackDir: string;
  steps: ComposedStep[];
  answers?: HearingAnswers;
  language?: PersonLanguage;
}

const stepOf = (run: BlueprintRun, stepId: string): ComposedStep | undefined => run.steps.find((step) => step.id === stepId);

function applied(loaded: Loaded, stepId: string, event: StepEvent): Loaded {
  const result = applyEvent(loaded.run.steps, loaded.state, stepId, event);
  if (!result.ok) throw new BlueprintRefusal(result.reason);
  return { run: loaded.run, state: result.state };
}

const actionFor = ({ run, state }: Loaded): ExecutorAction =>
  nextAction({ steps: run.steps, state, failedChecks: run.failedChecks, sessionActive: run.activeSessionId !== null });

// Whether the build, as it stands, stops on this step's failure for a person (rather than retrying).
const waitsOnFailure = (loaded: Loaded, stepId: string): boolean => {
  const action = actionFor(loaded);
  return action.kind === "wait" && action.on === "failure" && action.stepId === stepId;
};

class Executor {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: ExecutorDeps) {}

  async create(request: CreateRunRequest): Promise<string> {
    const run: BlueprintRun = {
      id: this.deps.newRunId(),
      ...request,
      answers: request.answers ?? {},
      failedChecks: {},
      failureOutputs: {},
      activeSessionId: null,
      sessions: [],
      createdAtMs: this.deps.now(),
      specChat: [],
      revisionSessionId: null,
      archivedAtMs: null,
      language: request.language ?? null,
    };
    const state = initialState(request.steps);
    await this.deps.store.save(run, state);
    await this.serially(run.id, () => this.advance({ run, state }));
    return run.id;
  }

  view(runId: string): Promise<Loaded> {
    return this.mustLoad(runId);
  }

  /** The report the usecase (or, failing that, the base) names in its manifest, as the project holds it now; nulls when there is none. */
  async reportView(runId: string): Promise<ReportView> {
    const { run } = await this.mustLoad(runId);
    const [manifest, baseManifest] = await Promise.all([run.usecasePackDir, run.basePackDir].map((dir) => readManifest(dir).catch(() => null)));
    const report = reportOf(manifest ?? null, baseManifest ?? null);
    const changed = changedFiles(await this.deps.projectFiles.list(run.projectDir), run.createdAtMs);
    // Which packs this build ran, by slug, so the view can offer the usecase's next steps; null when either is unreadable.
    const pair = manifest?.kind === "usecase" && baseManifest?.kind === "base" ? { base: baseManifest.slug, usecase: manifest.slug } : null;
    if (report === null) return { path: null, markdown: null, changed, pair };
    return { path: path.join(run.projectDir, report), markdown: await this.deps.projectFiles.read(run.projectDir, report), changed, pair };
  }

  /**
   * Every build, newest first, its words in the screen's language (`localizedRunSteps`). One that cannot be read is left
   * out rather than failing the list.
   */
  async list(screenLanguage?: string): Promise<BlueprintRunSummary[]> {
    const loaded = (await Promise.all((await this.deps.store.list()).map((runId) => this.deps.store.load(runId).catch(() => null)))).filter(
      (entry): entry is Loaded => entry !== null,
    );
    // Each usecase pack read once per listing, however many builds share it.
    const dirs = [...new Set(loaded.map((entry) => entry.run.usecasePackDir))];
    const read = overlayReader(screenLanguage);
    const titleOf = async (dir: string): Promise<[string, string | null]> => [
      dir,
      await readManifest(dir).then(
        async (manifest) => (manifest.kind === "usecase" ? localizedManifest(manifest, await read(dir)).title : null),
        () => null,
      ),
    ];
    const titles = new Map(await Promise.all(dirs.map(titleOf)));
    const summaries = await Promise.all(
      loaded.map(async (entry) =>
        summarizeRun({ ...entry.run, steps: await localizedRunSteps(entry.run, read) }, entry.state, titles.get(entry.run.usecasePackDir) ?? null),
      ),
    );
    return summaries.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  /** A person approved, rejected, answered or asked to retry. */
  humanEvent(runId: string, stepId: string, event: HumanEvent): Promise<Loaded> {
    return this.serially(runId, async () => {
      const before = await this.mustLoad(runId);
      if (before.run.revisionSessionId !== null) throw new BlueprintRefusal({ code: "revision-pending" });
      if (event.type === "approve" && lastRevisionCheckFailed(before.run.specChat)) throw new BlueprintRefusal({ code: "revision-check-failed" });
      const loaded = applied(before, stepId, event);
      if (event.type === "retry") this.closeSessionsOf(before.run, stepId);
      // A person's retry is a fresh start for the automatic retries, too.
      const run = event.type === "retry" ? withFailuresCleared(loaded.run, stepId) : loaded.run;
      await this.deps.store.save(run, loaded.state);
      return this.advance({ run, state: loaded.state });
    });
  }

  /**
   * Puts the build away from the list, or brings it back. Nothing is deleted, and a build put away while it waits for
   * a person waits on. Refused while an agent works on it — a step's session or a spec revision — so a running build
   * cannot drop out of sight.
   */
  archive(runId: string, archived: boolean): Promise<Loaded> {
    return this.serially(runId, async () => {
      const loaded = await this.mustLoad(runId);
      if (archived && (loaded.run.activeSessionId !== null || loaded.run.revisionSessionId !== null)) throw new BlueprintRefusal({ code: "agent-working" });
      const run = { ...loaded.run, archivedAtMs: archived ? this.deps.now() : null };
      await this.deps.store.save(run, loaded.state);
      return { run, state: loaded.state };
    });
  }

  /** The agent working on `stepId` needs a decision. Only that session may ask. */
  ask(runId: string, stepId: string, question: string, sessionId: string, choices: AskChoice[] = []): Promise<Loaded> {
    return this.serially(runId, async () => {
      const loaded = await this.mustLoad(runId);
      if (loaded.run.activeSessionId === null) throw new BlueprintRefusal("no agent is working on this build");
      if (loaded.run.activeSessionId !== sessionId) throw new BlueprintRefusal("this session is not the one working on the step");
      const asked = applied(loaded, stepId, { type: "ask", question, choices });
      await this.deps.store.save(asked.run, asked.state);
      return asked;
    });
  }

  /** After a restart the in-memory turn hooks are gone, and a Stop that fired while the server was
   *  down is gone with them — so a surviving session cannot be trusted to report again. Each one is
   *  ended and settled as a session that never finished; the retry that follows starts a fresh
   *  session with the check's context, and two sessions never work on one step. */
  async recover(endSession: (sessionId: string) => void): Promise<void> {
    const loadedRuns = await Promise.all((await this.deps.store.list()).map((runId) => this.deps.store.load(runId).catch(() => null)));
    const active = loadedRuns.flatMap((loaded) => (loaded?.run.activeSessionId ? [{ runId: loaded.run.id, sessionId: loaded.run.activeSessionId }] : []));
    await Promise.all(
      active.map(({ runId, sessionId }) => {
        endSession(sessionId);
        return this.turnEnded(runId, sessionId, true);
      }),
    );
    // A spec reply cut off by the restart is recorded as lost; the person can simply send again.
    const revising = loadedRuns.flatMap((loaded) => (loaded?.run.revisionSessionId ? [{ runId: loaded.run.id, sessionId: loaded.run.revisionSessionId }] : []));
    await Promise.all(
      revising.map(({ runId, sessionId }) => {
        endSession(sessionId);
        return this.revisionEnded(runId, sessionId, true);
      }),
    );
    // A run the server stopped mid-advance (a step started, no session yet) is picked up again.
    const idle = loadedRuns.flatMap((loaded) => (loaded && !loaded.run.activeSessionId ? [loaded.run.id] : []));
    await Promise.all(idle.map((runId) => this.serially(runId, async () => this.advance(await this.mustLoad(runId)))));
    // A build left waiting on a busy folder across the restart: that folder may be free now.
    const folders = [...new Set(loadedRuns.flatMap((loaded) => (loaded && waitsOnBusyFolder(loaded.run.steps, loaded.state) ? [loaded.run.projectDir] : [])))];
    await folders.reduce((done, folder) => done.then(() => this.wakeBuildsWaitingOn(folder, null)), Promise.resolve());
  }

  /** The spec as it stands, its open questions, and the conversation about it. */
  async specView(runId: string): Promise<SpecView> {
    const { run } = await this.mustLoad(runId);
    const [spec, openQuestions] = await Promise.all([
      this.deps.projectFiles.read(run.projectDir, SPEC_FILE),
      this.deps.projectFiles.read(run.projectDir, OPEN_QUESTIONS_FILE),
    ]);
    return { spec, openQuestions, chat: run.specChat, revising: run.revisionSessionId !== null };
  }

  /** A person's message about the spec: a fresh session changes the spec and writes a reply. */
  say(runId: string, message: string): Promise<Loaded> {
    return this.serially(runId, async () => {
      const loaded = await this.mustLoad(runId);
      const refusal = specChatRefusal(loaded);
      if (refusal) throw new BlueprintRefusal(refusal);
      const { run } = loaded;
      if (!(await this.trusted(run))) throw new BlueprintRefusal({ code: "untrusted", dir: run.projectDir, trustIn: run.projectDir });
      const sessionId = this.deps.newSessionId();
      const gate = currentStep(run.steps, loaded.state);
      const prompt = specRevisionPrompt({
        chat: run.specChat,
        message,
        packDirs: { base: run.basePackDir, usecase: run.usecasePackDir },
        replyPath: replyFile(sessionId),
        language: run.language,
        reads: gate?.reads ?? [],
        revises: await this.revisesOf(run, gate),
      });
      const specChat = [...run.specChat, { role: "person" as const, text: message, atMs: this.deps.now() }];
      const next: Loaded = { run: { ...run, revisionSessionId: sessionId, specChat }, state: loaded.state };
      // Saved BEFORE the spawn: a crash in between leaves a recorded revision that recovery settles as
      // lost, rather than a session running that no record knows about.
      // Under the folder's lock, like a step's session: no other build may be working in the folder.
      const folder = await this.folderOf(run.projectDir);
      await this.serially(`folder:${folder}`, async () => {
        const other = await this.workingIn(folder, run.id);
        if (other) throw new BlueprintRefusal({ code: "folder-busy", dir: run.projectDir, runId: other });
        // Answers first: a failed write must not leave a revision recorded that no session will ever answer.
        await this.ownAnswers(run);
        await this.deps.store.save(next.run, next.state);
        this.deps.spawnStepSession(run.projectDir, prompt, sessionId);
      });
      this.deps.onTurnEnded(sessionId, ({ didError }) => this.revisionEnded(runId, sessionId, didError));
      return next;
    });
  }

  private revisionEnded(runId: string, sessionId: string, didError: boolean): Promise<void> {
    return this.serially(runId, async () => {
      const { run, state } = await this.mustLoad(runId);
      if (run.revisionSessionId !== sessionId) return;
      try {
        const reply = didError ? null : ((await this.deps.projectFiles.read(run.projectDir, replyFile(sessionId))) ?? "").trim();
        await this.deps.projectFiles.remove(run.projectDir, replyFile(sessionId));
        const outcome = replyOutcome(didError, reply);
        const answered = [...run.specChat, { role: "agent" as const, text: reply ?? "", atMs: this.deps.now(), outcome }];
        // Even after a lost session: it may have changed the files before it ended.
        const recheck = await this.recheckAfterRevision(run, state);
        const failed =
          recheck && !recheck.ok ? [{ role: "agent" as const, text: recheck.output.trim(), atMs: this.deps.now(), outcome: "check-failed" as const }] : [];
        await this.deps.store.save({ ...run, revisionSessionId: null, specChat: [...answered, ...failed] }, state);
      } finally {
        this.deps.closeSession(sessionId);
      }
    });
  }

  // What the conversation at `gate` may change: as the build stored it, or — for a build started before its pack
  // declared any — as the pack declares it now, so it is never left to change the views it reads.
  private async revisesOf(run: BlueprintRun, gate: { id: string } | null): Promise<string[]> {
    const stored = gate ? stepOf(run, gate.id) : undefined;
    if (!stored || stored.reads.length === 0) return [];
    if (stored.revises.length > 0) return stored.revises;
    return declaredRevises(stored.origin === "base" ? run.basePackDir : run.usecasePackDir, stored.id);
  }

  // A document gate's conversation changed the files the step before it wrote: that step's check runs again, which
  // redraws the views the person reads and says whether the files still fit. An app gate (it names nothing to read) has
  // only the spec, which no check holds.
  private async recheckAfterRevision(run: BlueprintRun, state: BlueprintState): Promise<CheckResult | null> {
    const gate = currentStep(run.steps, state);
    if (!gate || gate.reads.length === 0) return null;
    const before = run.steps[run.steps.findIndex((step) => step.id === gate.id) - 1];
    if (!before) return null;
    return this.deps.runCheck({ command: before.check, cwd: run.projectDir, basePackDir: run.basePackDir, usecasePackDir: run.usecasePackDir });
  }

  // The sessions a step used; a failed step's last one was kept open for the person to look into.
  private closeSessionsOf(run: BlueprintRun, stepId: string): void {
    run.sessions
      .filter((entry) => entry.stepId === stepId && entry.sessionId !== run.activeSessionId)
      .forEach((entry) => this.deps.closeSession(entry.sessionId));
  }

  // The agent's session stopped. If it stopped to ask, the state already says so and there is
  // nothing to check; otherwise the check — not the agent — decides whether the step is done.
  private async turnEnded(runId: string, sessionId: string, didError: boolean): Promise<void> {
    const after = await this.serially(runId, async (): Promise<Loaded | null> => {
      const loaded = await this.mustLoad(runId);
      if (loaded.run.activeSessionId !== sessionId) return null;
      const released: Loaded = { run: { ...loaded.run, activeSessionId: null }, state: loaded.state };
      const session = loaded.run.sessions.findLast((entry) => entry.sessionId === sessionId);
      // Closed BEFORE advancing: a session whose turn ended can still have background work running,
      // and a retry started beside it would have two agents rewriting one folder. Only one that failed
      // and now waits for a person stays open, to be looked into; a person's retry closes it.
      const settled = await this.settleAndSave(released, session, didError).catch((err: unknown) => {
        this.deps.closeSession(sessionId);
        throw err;
      });
      if (!session || !waitsOnFailure(settled, session.stepId)) this.deps.closeSession(sessionId);
      return this.advance(settled);
    });
    // After this build's queue: waking another build takes that build's own queue, and must not wait on this one.
    if (after && !isWorking(after)) await this.wakeBuildsWaitingOn(after.run.projectDir, after.run.id).catch(() => undefined);
  }

  private async settleAndSave(released: Loaded, session: BlueprintRun["sessions"][number] | undefined, didError: boolean): Promise<Loaded> {
    const settled = session && needsCheck(released.state, session) ? await this.settleTurn(released, session.stepId, didError) : released;
    await this.deps.store.save(settled.run, settled.state);
    return settled;
  }

  private serially<T>(runId: string, work: () => Promise<T>): Promise<T> {
    const result = (this.queues.get(runId) ?? Promise.resolve()).then(work, work);
    this.queues.set(
      runId,
      result.catch(() => undefined),
    );
    return result;
  }

  private async mustLoad(runId: string): Promise<Loaded> {
    const loaded = await this.deps.store.load(runId);
    if (!loaded) throw new BlueprintRefusal(`no blueprint run ${runId}`);
    return loaded;
  }

  // Loops rather than recursing so each pass is saved before the next one can spawn.
  private async advance(initial: Loaded): Promise<Loaded> {
    let current = initial;
    for (let pass = 0; pass < MAX_PASSES_PER_ADVANCE; pass++) {
      const action = actionFor(current);
      const next = action.kind === "spawn" ? await this.spawnGuarded(current, action.stepId) : this.perform(current, action);
      if (!next) return current;
      await this.deps.store.save(next.run, next.state);
      current = next;
    }
    throw new Error(`blueprint run ${initial.run.id} did not settle`);
  }

  /** The folder a build works in, as one identity however it is spelled (a link, a trailing slash). */
  private async folderOf(dir: string): Promise<string> {
    return realpath(dir).catch(() => path.resolve(dir));
  }

  /** Another build whose agent or check is working in `folder` now, or null. A build waiting for a person is not. */
  async workingIn(folder: string, exceptRunId: string | null = null): Promise<string | null> {
    const working = (await this.buildsIn(folder, exceptRunId)).find(isWorking);
    return working ? working.run.id : null;
  }

  /** Every other build in `folder`, however its path is spelled. */
  private async buildsIn(folder: string, exceptRunId: string | null): Promise<Loaded[]> {
    const canonical = await this.folderOf(folder);
    const loaded = await Promise.all((await this.deps.store.list()).map((runId) => this.deps.store.load(runId).catch(() => null)));
    const siblings = await Promise.all(
      loaded.map(async (entry) => (entry && entry.run.id !== exceptRunId && (await this.folderOf(entry.run.projectDir)) === canonical ? entry : null)),
    );
    return siblings.filter((entry): entry is Loaded => entry !== null);
  }

  // A build that stopped because another was working in its folder resumes by itself once that one stops working —
  // the person was only ever asked to wait and press retry, which the executor can do. Each is retried in turn: the
  // first takes the folder, and the rest — or all of them, when another build still works there — find it busy again
  // and wait in the same way.
  private async wakeBuildsWaitingOn(folder: string, exceptRunId: string | null): Promise<void> {
    const waiting = (await this.buildsIn(folder, exceptRunId)).flatMap((entry) => {
      const stepId = waitsOnBusyFolder(entry.run.steps, entry.state);
      return stepId === null ? [] : [{ runId: entry.run.id, stepId }];
    });
    await waiting.reduce(
      (done, { runId, stepId }) =>
        done.then(() =>
          this.humanEvent(runId, stepId, { type: "retry" }).then(
            () => undefined,
            () => undefined,
          ),
        ),
      Promise.resolve(),
    );
  }

  // Two builds' agents in one folder would write each other's .blueprint/ records, and every session a build
  // starts (from a create, a person's resume, or recovery after a restart) comes through here. The check and the
  // spawn happen under one lock per folder, so two builds cannot both see it free.
  private async spawnGuarded(loaded: Loaded, stepId: string): Promise<Loaded> {
    if (!(await this.trusted(loaded.run))) return this.untrusted(loaded, stepId);
    const folder = await this.folderOf(loaded.run.projectDir);
    return this.serially(`folder:${folder}`, async () => {
      const other = await this.workingIn(folder, loaded.run.id);
      if (other) return this.waitsForPerson(loaded, stepId, { code: "folder-busy", runId: other });
      // A failed write fails the step (no session starts), so the build is not left "running" and the folder free.
      const unwritten = await this.ownAnswers(loaded.run).then(
        () => null,
        (err: unknown): StepNotice => ({ code: "answers-unwritten", detail: err instanceof Error ? err.message : String(err) }),
      );
      // Most likely passing (a disk briefly full or locked): retried like a failed check, with no session to close.
      if (unwritten !== null) return this.recordNotice(loaded, stepId, unwritten);
      const next = this.spawnFor(loaded, stepId);
      // Saved inside the lock: the next build to ask must already see this one working.
      await this.deps.store.save(next.run, next.state);
      return next;
    });
  }

  // The step fails with the reason and no automatic retries left: only a person's retry moves it.
  private waitsForPerson(loaded: Loaded, stepId: string, notice: StepNotice): Loaded {
    const failed = this.recordNotice(loaded, stepId, notice);
    return { run: { ...failed.run, failedChecks: { ...failed.run.failedChecks, [stepId]: MAX_FAILED_CHECKS } }, state: failed.state };
  }

  // Another build in the same folder may have written its answers since this one last worked. Written only when a
  // session starts, under the folder's lock: while this build works nobody else can start, so its check reads the
  // same file its agent did.
  private async ownAnswers(run: BlueprintRun): Promise<void> {
    if (this.deps.writeAnswers && Object.keys(run.answers).length > 0) await this.deps.writeAnswers(run.projectDir, run.answers);
  }

  private async trusted(run: BlueprintRun): Promise<boolean> {
    return this.deps.isTrusted ? this.deps.isTrusted(run.projectDir) : true;
  }

  // The step fails with the reason, and with no automatic retries left: a retry cannot trust the
  // folder, only a person can. Their retry resets the count and asks again.
  private untrusted(loaded: Loaded, stepId: string): Loaded {
    return this.waitsForPerson(loaded, stepId, { code: "untrusted", dir: loaded.run.projectDir });
  }

  // Performs one action; null means "stop here".
  private perform(loaded: Loaded, action: ExecutorAction): Loaded | null {
    if (action.kind === "start") return applied(loaded, action.stepId, { type: "start" });
    if (action.kind === "retry") return applied(loaded, action.stepId, { type: "retry" });
    if (action.kind === "spawn") return this.spawnFor(loaded, action.stepId);
    return null;
  }

  private spawnFor({ run, state }: Loaded, stepId: string): Loaded {
    const step = stepOf(run, stepId);
    if (!step) throw new BlueprintRefusal(`no step ${stepId}`);
    const packDir = step.origin === "base" ? run.basePackDir : run.usecasePackDir;
    const skillFile = path.join(packDir, step.skill, "SKILL.md");
    const sessionId = this.deps.newSessionId();
    const prompt = stepPrompt({
      step,
      skillFile,
      packDirs: { base: run.basePackDir, usecase: run.usecasePackDir },
      stepState: state.steps[stepId],
      askCommand: this.deps.askCommand(run.id, stepId, sessionId),
      earlierAnswers: earlierAnswers(run.steps, state.steps, stepId),
      language: run.language,
      // The last failure is the step's lastCheck, already in the prompt; these are the ones before it.
      earlierFailures: (run.failureOutputs[stepId] ?? []).slice(0, -1),
      failedAttempts: run.failedChecks[stepId] ?? 0,
    });
    this.deps.spawnStepSession(run.projectDir, prompt, sessionId);
    this.deps.onTurnEnded(sessionId, ({ didError }) => this.turnEnded(run.id, sessionId, didError));
    const sessions = [...run.sessions, { stepId, sessionId, atMs: this.deps.now(), answersAtStart: state.steps[stepId]?.answers.length ?? 0 }];
    return { run: { ...run, activeSessionId: sessionId, sessions }, state };
  }

  private async settleTurn(loaded: Loaded, stepId: string, didError: boolean): Promise<Loaded> {
    const step = stepOf(loaded.run, stepId);
    if (!step) return loaded;
    if (didError) return this.recordNotice(loaded, stepId, { code: "session-lost" });
    const { run } = loaded;
    const checked = this.recordCheck(
      loaded,
      stepId,
      await this.deps.runCheck({ command: step.check, cwd: run.projectDir, basePackDir: run.basePackDir, usecasePackDir: run.usecasePackDir }),
    );
    return checked.state.steps[stepId]?.status === "passed" && step.repeatWhile ? this.nextRound(checked, step, step.repeatWhile) : checked;
  }

  // A round of a repeating step passed: ask its `repeatWhile` whether there is more, and if so start
  // the next round with the failure count cleared — a round's retries are its own.
  private async nextRound(loaded: Loaded, step: ComposedStep, repeatWhile: string): Promise<Loaded> {
    const { run } = loaded;
    const more = await this.deps.runCheck({ command: repeatWhile, cwd: run.projectDir, basePackDir: run.basePackDir, usecasePackDir: run.usecasePackDir });
    const round = loaded.state.steps[step.id]?.round ?? 0;
    if (atRoundLimit(step, round, more.ok)) {
      const notice: StepNotice = { code: "round-limit", rounds: MAX_ROUNDS };
      return applied(loaded, step.id, { type: "hold", reason: englishStepNotice(notice), notice });
    }
    if (!shouldRepeat(step, round, more.ok)) return loaded;
    const repeated = applied(loaded, step.id, { type: "repeat" });
    // The round that just passed already cleared its failures.
    return repeated;
  }

  private recordNotice(loaded: Loaded, stepId: string, notice: StepNotice): Loaded {
    return this.recordCheck(loaded, stepId, { ok: false, output: englishStepNotice(notice) }, notice);
  }

  private recordCheck(loaded: Loaded, stepId: string, result: CheckResult, notice?: StepNotice): Loaded {
    const checked = applied(loaded, stepId, { type: "check", ok: result.ok, output: result.output, atMs: this.deps.now(), ...(notice ? { notice } : {}) });
    if (result.ok) return { run: withFailuresCleared(checked.run, stepId), state: checked.state };
    const failedChecks = { ...checked.run.failedChecks, [stepId]: (checked.run.failedChecks[stepId] ?? 0) + 1 };
    const failureOutputs = {
      ...checked.run.failureOutputs,
      [stepId]: [...(checked.run.failureOutputs[stepId] ?? []), result.output].slice(-MAX_FAILED_CHECKS),
    };
    return { run: { ...checked.run, failedChecks, failureOutputs }, state: checked.state };
  }
}

export type BlueprintExecutor = Pick<
  Executor,
  "create" | "view" | "list" | "humanEvent" | "ask" | "recover" | "specView" | "say" | "reportView" | "workingIn" | "archive"
>;

/** A finished build's report: where it is, and its text (null when the usecase names none or it was not written); and the files the build wrote. */
export type ReportView = {
  readonly path: string | null;
  readonly markdown: string | null;
  readonly changed: ChangedFiles;
  readonly pair: { readonly base: string; readonly usecase: string } | null;
};

export const createExecutor = (deps: ExecutorDeps): BlueprintExecutor => new Executor(deps);

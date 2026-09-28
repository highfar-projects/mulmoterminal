// /api/blueprints — list packs, start a build, read it, and move it on. A person's decisions come
// through /events; /ask is the route the step's agent is told to use. The split is what each is FOR,
// not an authorisation: both sit behind the same-origin guard, and any local process can call either.
import path from "node:path";
import { mkdir, readFile, rm, rmdir } from "node:fs/promises";
import type { Express, Response } from "express";
import { z } from "zod";
import { listPacks, listPresets, loadPackPair, readPresets, type PackPair, type PackRoot } from "./packs.js";
import { placeSamples, readSamples } from "./samples.js";
import type { Sample } from "../../common/blueprint/samples.js";
import { answerProblems, askedQuestions, hearingAnswersSchema, unansweredQuestions, type HearingAnswers } from "../../common/blueprint/hearing.js";
import { BlueprintRefusal, type BlueprintExecutor, type HumanEvent } from "./executor.js";
import { BLUEPRINT_SLUG_RE } from "../../common/blueprint/manifest.js";
import type { Refusal } from "../../common/blueprint/refusal.js";
import { refusalBody, type RefusalBody } from "./refused.js";
import { isRecord } from "../../common/isRecord.js";
import { folderHomes, folderPlan, type FolderPlan } from "./newFolder.js";
import { presenceOf, suggestFolder } from "./folderSuggestion.js";

export interface BlueprintRouteDeps {
  executor: BlueprintExecutor;
  /** Refuses (BlueprintRefusal) when another MulmoTerminal drives the runs — asked before a create writes anything. */
  ensureOwner: () => Promise<void>;
  packRoots: readonly PackRoot[];
  now: () => number;
  /** Whether an agent can start in `dir` without a trust prompt nobody is there to answer. */
  isTrusted: (dir: string) => Promise<boolean>;
  /** Where a new folder may go when no recent build suggests a place: the server's own working folder. */
  workspace: string;
}

const createSchema = z.object({
  projectDir: z.string().min(1),
  base: z.string().regex(BLUEPRINT_SLUG_RE),
  usecase: z.string().regex(BLUEPRINT_SLUG_RE),
  answers: hearingAnswersSchema,
  /** The example the answers came from: its sample documents are placed in the folder. */
  preset: z.string().regex(BLUEPRINT_SLUG_RE).optional(),
});

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("approve"), stepId: z.string() }),
  z.object({ type: z.literal("reject"), stepId: z.string(), reason: z.string().trim().min(1) }),
  z.object({ type: z.literal("answer"), stepId: z.string(), answer: z.string().trim().min(1) }),
  z.object({ type: z.literal("retry"), stepId: z.string() }),
]);

const specMessageSchema = z.object({ message: z.string().trim().min(1) });
const askSchema = z.object({ stepId: z.string(), sessionId: z.string(), question: z.string().trim().min(1) });

type ParsedEvent = z.infer<typeof eventSchema>;

function humanEventOf(parsed: ParsedEvent, now: number): HumanEvent {
  if (parsed.type === "answer") return { type: "answer", answer: parsed.answer, atMs: now };
  if (parsed.type === "reject") return { type: "reject", reason: parsed.reason };
  return { type: parsed.type };
}

function fail(res: Response, err: unknown): void {
  if (err instanceof BlueprintRefusal) {
    res.status(409).json({ error: err.message, refusal: err.refusal });
    return;
  }
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
}

// A build writes into this directory: an absolute path — never resolved against the server's own cwd — that is not
// a filesystem root, and either a folder already or a new one inside an existing folder.
async function projectDirPlan(projectDir: string): Promise<FolderPlan> {
  const [self, parent] = await Promise.all([presenceOf(projectDir), presenceOf(path.dirname(projectDir))]);
  return folderPlan(projectDir, self, parent);
}

function mountReadRoutes(app: Express, deps: BlueprintRouteDeps): void {
  app.get("/api/blueprints/packs", async (_req, res) => {
    res.json({ packs: await listPacks(deps.packRoots) });
  });

  app.get("/api/blueprints/presets", async (_req, res) => {
    res.json({ presets: await listPresets(deps.packRoots) });
  });

  // A new folder for an example, beside the person's recent builds or in the workspace, that Claude Code would trust.
  app.get("/api/blueprints/folder-suggestion", async (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name : "";
    if (!BLUEPRINT_SLUG_RE.test(name)) return res.status(400).json({ error: "expected ?name=<slug>" });
    const recent = (await deps.executor.list().catch(() => [])).map((run) => run.projectDir);
    return res.json({ path: await suggestFolder(name, folderHomes(recent, deps.workspace), deps.isTrusted) });
  });

  app.get("/api/blueprints/runs", async (_req, res) => {
    try {
      res.json({ runs: await deps.executor.list() });
    } catch (err) {
      fail(res, err);
    }
  });

  // What the new-build form needs for a base/usecase pair: its interview and the steps it will run.
  app.get("/api/blueprints/pairs/:base/:usecase", async (req, res) => {
    const pair = await loadPackPair(deps.packRoots, req.params.base, req.params.usecase);
    if (!pair.ok) return res.status(400).json({ error: pair.problems.join("; ") });
    return res.json({ hearing: pair.hearing, steps: pair.steps });
  });

  app.get("/api/blueprints/runs/:id", async (req, res) => {
    try {
      res.json(await deps.executor.view(req.params.id));
    } catch (err) {
      fail(res, err);
    }
  });
}

type CreateRequest = { projectDir: string; create: boolean; answers: HearingAnswers; pair: Extract<PackPair, { ok: true }>; samples: readonly Sample[] };
type Checked = { ok: true; request: CreateRequest } | { ok: false; status: number; body: RefusalBody };

const refused = (status: number, reason: string | Refusal): Checked => ({ ok: false, status, body: refusalBody(reason) });

// Only the questions actually asked are kept, so an answer to a question the conditions closed off
// cannot reach the spec step.
function answersProblem(pair: Extract<PackPair, { ok: true }>, answers: HearingAnswers): string | null {
  const missing = unansweredQuestions(pair.hearing, answers);
  if (missing.length > 0) return `unanswered: ${missing.map((question) => question.id).join(", ")}`;
  const wrong = answerProblems(pair.hearing, answers);
  return wrong.length > 0 ? `invalid: ${wrong.join("; ")}` : null;
}

async function checkCreate(deps: BlueprintRouteDeps, body: unknown): Promise<Checked> {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return refused(400, "projectDir, base, usecase and answers are required");
  const { projectDir, base, usecase, answers, preset } = parsed.data;
  const plan = await projectDirPlan(projectDir);
  if (!plan.ok) return refused(400, plan.refusal);
  // Asked of the path itself, before it is made: a new folder takes its trust from where it will be.
  if (!(await deps.isTrusted(projectDir))) return refused(409, { code: "untrusted", dir: projectDir });
  // Two builds' agents working in one folder at once would write each other's .blueprint/ records. A build that
  // waits for a person does not block: it writes nothing until it resumes, and it takes its answers back then.
  const busy = await deps.executor.workingIn(projectDir);
  if (busy) return refused(409, { code: "folder-busy", dir: projectDir, runId: busy });
  const pair = await loadPackPair(deps.packRoots, base, usecase);
  if (!pair.ok) return refused(400, pair.problems.join("; "));
  const problem = answersProblem(pair, answers);
  if (problem) return refused(400, problem);
  const asked: HearingAnswers = Object.fromEntries(
    askedQuestions(pair.hearing, answers).flatMap((question) => {
      const answer = answers[question.id];
      return answer === undefined ? [] : [[question.id, answer]];
    }),
  );
  if (preset !== undefined && !(await readPresets(pair.usecasePackDir)).some((known) => known.id === preset && known.base === base)) {
    return refused(400, `${usecase} has no example "${preset}" on ${base}`);
  }
  const samples = preset === undefined ? [] : await readSamples(pair.usecasePackDir, preset);
  return { ok: true, request: { projectDir, create: plan.create, answers: asked, pair, samples } };
}

// A folder this request made and could not start in: the samples it placed go, then the folder, only if that left
// it empty — whatever else appeared in it meanwhile is not this request's to remove.
async function takeBack(projectDir: string, placed: readonly Sample[]): Promise<void> {
  await Promise.all(placed.map((sample) => removeIfUnchanged(path.join(projectDir, sample.name), sample.content)));
  await rmdir(projectDir).catch(() => undefined);
}

// A sample file is removed only while it still holds what was placed: one rewritten meanwhile is someone else's now.
async function removeIfUnchanged(file: string, content: string): Promise<void> {
  if ((await readFile(file, "utf8").catch(() => null)) === content) await rm(file, { force: true });
}

// Made alone, never recursively, never over something already there; false when something else made it first.
const madeHere = (projectDir: string): Promise<boolean> =>
  mkdir(projectDir).then(
    () => true,
    (err: unknown) => {
      if (isRecord(err) && err.code === "EEXIST") return false;
      throw err;
    },
  );

function mountCreateRoute(app: Express, deps: BlueprintRouteDeps): void {
  app.post("/api/blueprints/runs", async (req, res) => {
    const checked = await checkCreate(deps, req.body);
    if (!checked.ok) return res.status(checked.status).json(checked.body);
    const { projectDir, create, answers, pair, samples } = checked.request;
    try {
      await deps.ensureOwner();
      // Made last of all the checks. A folder another start made a moment ago is that start's, not this one's.
      if (create && !(await madeHere(projectDir))) return res.status(409).json(refusalBody({ code: "folder-taken", dir: projectDir }));
      const placedHere: Sample[] = [];
      try {
        const { clashes, placed } = await placeSamples(projectDir, samples);
        placedHere.push(...samples.filter((sample) => placed.includes(sample.name)));
        if (clashes.length > 0) {
          return res.status(409).json(refusalBody({ code: "samples-clash", files: clashes }));
        }
        const runId = await deps.executor.create({
          projectDir,
          basePackDir: pair.basePackDir,
          usecasePackDir: pair.usecasePackDir,
          steps: pair.steps,
          answers,
        });
        return res.json({ runId });
      } catch (err) {
        if (create) await takeBack(projectDir, placedHere);
        throw err;
      }
    } catch (err) {
      return fail(res, err);
    }
  });
}

function mountMoveRoutes(app: Express, deps: BlueprintRouteDeps): void {
  app.post("/api/blueprints/runs/:id/events", async (req, res) => {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "expected { type: approve | reject | answer | retry, stepId, … }" });
    try {
      return res.json(await deps.executor.humanEvent(req.params.id, parsed.data.stepId, humanEventOf(parsed.data, deps.now())));
    } catch (err) {
      return fail(res, err);
    }
  });

  app.get("/api/blueprints/runs/:id/report", async (req, res) => {
    try {
      res.json(await deps.executor.reportView(req.params.id));
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/blueprints/runs/:id/spec", async (req, res) => {
    try {
      res.json(await deps.executor.specView(req.params.id));
    } catch (err) {
      fail(res, err);
    }
  });

  // A person's word on the spec while it waits for review; the reply arrives in the spec view.
  app.post("/api/blueprints/runs/:id/spec/messages", async (req, res) => {
    const parsed = specMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "expected { message }" });
    try {
      return res.json(await deps.executor.say(req.params.id, parsed.data.message));
    } catch (err) {
      return fail(res, err);
    }
  });

  app.post("/api/blueprints/runs/:id/ask", async (req, res) => {
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "expected { stepId, sessionId, question }" });
    try {
      await deps.executor.ask(req.params.id, parsed.data.stepId, parsed.data.question, parsed.data.sessionId);
      return res.json({ ok: true, message: "Asked. Stop now; the answer will come in a new session." });
    } catch (err) {
      return fail(res, err);
    }
  });
}

export function mountBlueprintRoutes(app: Express, deps: BlueprintRouteDeps): void {
  mountReadRoutes(app, deps);
  mountCreateRoute(app, deps);
  mountMoveRoutes(app, deps);
}

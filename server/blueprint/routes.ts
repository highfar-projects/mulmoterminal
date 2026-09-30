// /api/blueprints — list packs, start a build, read it, and move it on. A person's decisions come
// through /events; /ask is the route the step's agent is told to use. The split is what each is FOR,
// not an authorisation: both sit behind the same-origin guard, and any local process can call either.
import path from "node:path";
import { lstat, mkdir, readFile, rmdir, stat } from "node:fs/promises";
import type { Express, Response } from "express";
import { z } from "zod";
import { listPacks, listPresets, loadPackPair, readHearing, readPresets, type PackPair, type PackRoot } from "./packs.js";
import { placeSamples, readSamples } from "./samples.js";
import type { Sample } from "../../common/blueprint/samples.js";
import { personLanguageSchema, type PersonLanguage } from "../../common/blueprint/personLanguage.js";
import {
  answerProblems,
  askedQuestions,
  isFolderRelativePath,
  missingPathProblems,
  neededPaths,
  settledAnswers,
  hearingAnswersSchema,
  recordsWanted,
  requiredDefaults,
  sourceQuestion,
  unansweredQuestions,
  type HearingAnswers,
} from "../../common/blueprint/hearing.js";
import { placeSnapshot, type CollectionSource, type Snapshot, type SnapshotFile } from "./collectionSnapshot.js";
import { appIdOf } from "../../common/blueprint/sharedAppSource.js";
import { MAX_SOURCE_BYTES } from "../../common/blueprint/collectionSource.js";
import { carriesPersonalData } from "../../common/blueprint/personalData.js";
import type { SourceStatus } from "../../common/blueprint/sourceStatus.js";
import { SOURCE_RECORD_PATH } from "./sourceFingerprint.js";
import { compareSource, retakeTarget, storedSource } from "./sourceStatus.js";
import { BlueprintRefusal, type BlueprintExecutor, type HumanEvent } from "./executor.js";
import { BLUEPRINT_SLUG_RE } from "../../common/blueprint/manifest.js";
import type { Refusal } from "../../common/blueprint/refusal.js";
import { refusalBody, type RefusalBody } from "./refused.js";
import { isRecord } from "../../common/isRecord.js";
import { expandHome, folderCandidates, folderHomes, folderPlan, trustPlace, type FolderPlan } from "./newFolder.js";
import { presenceOf, suggestFolder } from "./folderSuggestion.js";
import { recordFolderIsReal } from "./answersFile.js";
import { listProjectFiles, readProjectFile } from "./projectFiles.js";
import { originalsOf } from "./originals.js";
import { changedFiles } from "../../common/blueprint/changedFiles.js";
import { SIGN_IN_STEP } from "../backends/sharedApp/signInStep.js";

// More than the changed-files list shows: this is for choosing among them, not for glancing at what moved.
const PICKABLE_FILES_MAX = 200;
const PRESENT_PATHS_MAX = 20;
const KNOWN_FOLDERS_MAX = 40;
const RECENT_FOLDERS_MAX = 15;

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
  /** What a leading `~` in a typed folder stands for. */
  home: string;
  /** The folders the person saved in MulmoTerminal, offered to pick from beside the recent builds'. */
  savedFolders: () => readonly string[];
  /** The collections a build may start from, and the copy of one placed in its folder. */
  collections: CollectionSource;
}

const createSchema = z.object({
  projectDir: z.string().min(1),
  base: z.string().regex(BLUEPRINT_SLUG_RE),
  usecase: z.string().regex(BLUEPRINT_SLUG_RE),
  answers: hearingAnswersSchema,
  /** The example the answers came from: its sample documents are placed in the folder. */
  preset: z.string().regex(BLUEPRINT_SLUG_RE).optional(),
  /** The language of the screen the person starts from: what the agent writes for them is in it. */
  language: personLanguageSchema.optional(),
  /** The person has seen what personal data the copy of the source carries, and it may be copied. */
  personalDataConfirmed: z.boolean().optional(),
});

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("approve"), stepId: z.string() }),
  z.object({ type: z.literal("reject"), stepId: z.string(), reason: z.string().trim().min(1) }),
  z.object({ type: z.literal("answer"), stepId: z.string(), answer: z.string().trim().min(1) }),
  z.object({ type: z.literal("retry"), stepId: z.string() }),
]);

const specMessageSchema = z.object({ message: z.string().trim().min(1) });
const archiveSchema = z.object({ archived: z.boolean() });
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

// The originals a build kept, each beside the file as it is now, for the finished screen to show what changed.
function mountOriginalsRoute(app: Express, deps: BlueprintRouteDeps): void {
  app.get("/api/blueprints/runs/:id/originals", async (req, res) => {
    try {
      const { run } = await deps.executor.view(req.params.id);
      res.json(await originalsOf(run.projectDir, { list: listProjectFiles, read: readProjectFile }, run.createdAtMs));
    } catch (err) {
      fail(res, err);
    }
  });
}

function mountFolderPresentRoute(app: Express, deps: BlueprintRouteDeps): void {
  // Which of the paths an interview's options need are in the folder the form names. A folder not made yet has none.
  app.get("/api/blueprints/folder-present", async (req, res) => {
    const dir = expandHome(typeof req.query.dir === "string" ? req.query.dir : "", deps.home);
    if (!path.isAbsolute(dir) || path.parse(dir).root === dir) return res.status(400).json(refusalBody({ code: "not-absolute" }));
    const asked = [req.query.path].flat();
    const paths = asked.filter((relative): relative is string => typeof relative === "string" && isFolderRelativePath(relative));
    if (paths.length !== asked.length || paths.length > PRESENT_PATHS_MAX) return res.status(400).json({ error: "expected ?path=<path inside the folder>" });
    try {
      return res.json({ present: [...(await presentPaths(dir, paths))] });
    } catch (err) {
      return fail(res, err);
    }
  });
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

  // Folders to pick from instead of typing a path: from the build records and the saved config, never from the request.
  app.get("/api/blueprints/known-folders", async (_req, res) => {
    const recent = (await deps.executor.list().catch(() => [])).map((run) => run.projectDir);
    const candidates = folderCandidates(recent, deps.savedFolders(), RECENT_FOLDERS_MAX);
    const presences = await Promise.all(candidates.map(presenceOf));
    return res.json({ folders: candidates.filter((_dir, index) => presences[index] === "folder").slice(0, KNOWN_FOLDERS_MAX) });
  });

  // The files in the folder the form names, for a question whose answer is files in it. A folder not made yet, or a
  // path that is not a folder, lists none: the walk finds nothing to read there.
  app.get("/api/blueprints/folder-files", async (req, res) => {
    const dir = expandHome(typeof req.query.dir === "string" ? req.query.dir : "", deps.home);
    if (!path.isAbsolute(dir) || path.parse(dir).root === dir) return res.status(400).json(refusalBody({ code: "not-absolute" }));
    // Every file there, whenever it changed: the same bounded walk and order as the changed-files list.
    return res.json(changedFiles(await listProjectFiles(dir), 0, PICKABLE_FILES_MAX));
  });

  app.get("/api/blueprints/collections", async (_req, res) => {
    try {
      res.json({ collections: await deps.collections.list() });
    } catch (err) {
      fail(res, err);
    }
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

function mountSourceRoute(app: Express, deps: BlueprintRouteDeps): void {
  // Whether the source the build copied has changed since: taken again now, in memory, and compared. Asked once when the
  // run is opened, never polled, since a shared app's records are read from Firestore.
  app.get("/api/blueprints/runs/:id/source", async (req, res) => {
    try {
      const { run } = await deps.executor.view(req.params.id);
      const stored = storedSource(await readSourceRecord(run.projectDir));
      const hearing = stored === null ? null : await readHearing(run.usecasePackDir).catch(() => null);
      const target = stored === null || hearing === null ? null : retakeTarget(stored, hearing, run.answers);
      if (stored === null || target === null) return res.json({ status: "unknown" } satisfies SourceStatus);
      return res.json(compareSource(stored, await deps.collections.snapshot(target.source, deps.now(), target.records)));
    } catch (err) {
      return fail(res, err);
    }
  });
}

// source.json is ours and small; one grown past this was not written by the copy, and nothing is compared against it.
const SOURCE_RECORD_MAX_BYTES = 64 * 1024;

async function readSourceRecord(projectDir: string): Promise<string | null> {
  const file = path.join(projectDir, SOURCE_RECORD_PATH);
  const size = await stat(file).then(
    (found) => (found.isFile() ? found.size : null),
    () => null,
  );
  if (size === null || size > SOURCE_RECORD_MAX_BYTES) return null;
  return readFile(file, "utf8").catch(() => null);
}

type CreateRequest = {
  projectDir: string;
  create: boolean;
  answers: HearingAnswers;
  language: PersonLanguage | undefined;
  pair: Extract<PackPair, { ok: true }>;
  samples: readonly Sample[];
  source: readonly SnapshotFile[];
};
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

const BYTES_PER_MB = 1024 * 1024;

// A shared app is named by an opaque folder id the person never saw; the message says what it is instead.
const sourceLabel = (slug: string): string => (appIdOf(slug) === null ? `"${slug}"` : "the shared app");

const tooLargeReason = (label: string, bytes: number): string =>
  `the copy of ${label} with its records would be ${Math.ceil(bytes / BYTES_PER_MB)} MB, more than the ${MAX_SOURCE_BYTES / BYTES_PER_MB} MB a build copies; start without the records`;

// Only these say the path is not there; a folder it cannot read (EACCES) is not a folder without it.
const isAbsent = (err: unknown): boolean => err instanceof Error && "code" in err && (err.code === "ENOENT" || err.code === "ENOTDIR");

// A file or a folder counts (a repository's .git is either); a link or anything else does not, as the folder's file
// list does not follow links either. A folder not made yet has none of them.
async function presentPaths(projectDir: string, paths: readonly string[]): Promise<Set<string>> {
  const found = await Promise.all(
    paths.map((relative) =>
      lstat(path.join(projectDir, relative)).then(
        (entry) => entry.isFile() || entry.isDirectory(),
        (err: unknown) => {
          if (isAbsent(err)) return false;
          throw err;
        },
      ),
    ),
  );
  return new Set(paths.filter((_, index) => found[index]));
}

async function checkCreate(deps: BlueprintRouteDeps, body: unknown): Promise<Checked> {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return refused(400, "projectDir, base, usecase and answers are required");
  const { base, usecase, answers, preset, language } = parsed.data;
  const projectDir = expandHome(parsed.data.projectDir, deps.home);
  const plan = await projectDirPlan(projectDir);
  if (!plan.ok) return refused(400, plan.refusal);
  // Asked of the path itself, before it is made: a new folder takes its trust from where it will be.
  if (!(await deps.isTrusted(projectDir))) return refused(409, { code: "untrusted", dir: projectDir, trustIn: trustPlace(projectDir, plan.create) });
  if (!(await recordFolderIsReal(projectDir))) return refused(409, { code: "record-folder-not-real", dir: projectDir });
  // Two builds' agents working in one folder at once would write each other's .blueprint/ records. A build that
  // waits for a person does not block: it writes nothing until it resumes, and it takes its answers back then.
  const busy = await deps.executor.workingIn(projectDir);
  if (busy) return refused(409, { code: "folder-busy", dir: projectDir, runId: busy });
  const pair = await loadPackPair(deps.packRoots, base, usecase);
  if (!pair.ok) return refused(400, pair.problems.join("; "));
  const present = await presentPaths(projectDir, neededPaths(pair.hearing));
  const hasPath = (file: string): boolean => present.has(file);
  const given: HearingAnswers = { ...requiredDefaults(pair.hearing), ...settledAnswers(pair.hearing, hasPath), ...answers };
  // Before the rest: an option the folder cannot take may open questions nobody should have been asked.
  const missing = missingPathProblems(pair.hearing, given, hasPath);
  if (missing.length > 0) return refused(400, `not in the folder: ${missing.join("; ")}`);
  const problem = answersProblem(pair, given);
  if (problem) return refused(400, problem);
  const asked: HearingAnswers = Object.fromEntries(
    askedQuestions(pair.hearing, given).flatMap((question) => {
      const answer = given[question.id];
      return answer === undefined ? [] : [[question.id, answer]];
    }),
  );
  if (preset !== undefined && !(await readPresets(pair.usecasePackDir)).some((known) => known.id === preset && known.base === base)) {
    return refused(400, `${usecase} has no example "${preset}" on ${base}`);
  }
  const samples = preset === undefined ? [] : await readSamples(pair.usecasePackDir, preset);
  const source = await copyOfSource(deps, pair, asked, parsed.data.personalDataConfirmed === true);
  if (!source.ok) return source.refusal;
  return { ok: true, request: { projectDir, create: plan.create, answers: source.answers, language, pair, samples, source: source.files } };
}

type SourceCopy = { ok: true; files: readonly SnapshotFile[]; answers: HearingAnswers } | { ok: false; refusal: Checked };

/** The copy of the collection the answers name, if the usecase starts from one; none when it does not. */
async function copyOfSource(
  deps: BlueprintRouteDeps,
  pair: Extract<PackPair, { ok: true }>,
  asked: HearingAnswers,
  personalDataConfirmed: boolean,
): Promise<SourceCopy> {
  const picked = sourceQuestion(pair.hearing);
  const answer = picked === undefined ? undefined : asked[picked.id];
  if (picked === undefined || typeof answer !== "string") return { ok: true, files: [], answers: asked };
  const slug = answer.trim();
  const snapshot = await deps.collections.snapshot(slug, deps.now(), recordsWanted(pair.hearing, asked));
  if (snapshot.kind !== "ok") return { ok: false, refusal: snapshotRefusal(slug, snapshot) };
  if (carriesPersonalData(snapshot.personal) && !personalDataConfirmed) {
    return { ok: false, refusal: refused(409, { code: "personal-data", ...snapshot.personal }) };
  }
  // The recorded answer names exactly what was copied, so the spec step reads the same slug as `source.json`.
  return { ok: true, files: snapshot.files, answers: { ...asked, [picked.id]: slug } };
}

/** Why a source could not be copied, as the refusal the form shows. */
function snapshotRefusal(slug: string, snapshot: Exclude<Snapshot, { kind: "ok" }>): Checked {
  switch (snapshot.kind) {
    case "unknown":
      return refused(
        400,
        appIdOf(slug) === null ? `no collection "${slug}" to start from` : "that shared app is no longer offered; choose another source from the list",
      );
    case "too-large":
      return refused(400, tooLargeReason(sourceLabel(slug), snapshot.bytes));
    case "signed-out":
      return refused(409, `a shared app's records are read with your own sign-in: ${SIGN_IN_STEP} Or start without the records.`);
    case "not-a-reader":
      return refused(
        409,
        `your role in this app does not read every record of ${snapshot.collections.join(", ")}, so the copy would be short: ask an owner for a role that does, or start without the records`,
      );
  }
}

// A folder this request made and could not start in is removed only while it is empty. Sample files it placed stay:
// nothing can check-and-delete a file in one step, so deleting any could take a file someone just rewrote, and a
// sample left behind is the one the next start in this folder would place anyway.
const takeBack = (projectDir: string): Promise<void> => rmdir(projectDir).catch(() => undefined);

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
    const { projectDir, create, answers, language, pair, samples, source } = checked.request;
    try {
      await deps.ensureOwner();
      // Made last of all the checks. A folder another start made a moment ago is that start's, not this one's.
      if (create && !(await madeHere(projectDir))) return res.status(409).json(refusalBody({ code: "folder-taken", dir: projectDir }));
      try {
        const { clashes } = await placeSamples(projectDir, samples);
        if (clashes.length > 0) {
          return res.status(409).json(refusalBody({ code: "samples-clash", files: clashes }));
        }
        // A copy from an earlier start is not overwritten: the source may have changed since, and which one the
        // spec was written from would be lost.
        const placed = await placeSnapshot(projectDir, source);
        if (placed.clashes.length > 0) return res.status(409).json(refusalBody({ code: "samples-clash", files: [...placed.clashes] }));
        const runId = await deps.executor.create({
          projectDir,
          basePackDir: pair.basePackDir,
          usecasePackDir: pair.usecasePackDir,
          steps: pair.steps,
          answers,
          ...(language === undefined ? {} : { language }),
        });
        return res.json({ runId });
      } catch (err) {
        if (create) await takeBack(projectDir);
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

  // Puts a build away from the list, or brings it back. Nothing is deleted.
  app.post("/api/blueprints/runs/:id/archive", async (req, res) => {
    const parsed = archiveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "expected { archived: boolean }" });
    try {
      return res.json(await deps.executor.archive(req.params.id, parsed.data.archived));
    } catch (err) {
      return fail(res, err);
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
  mountFolderPresentRoute(app, deps);
  mountOriginalsRoute(app, deps);
  mountSourceRoute(app, deps);
  mountCreateRoute(app, deps);
  mountMoveRoutes(app, deps);
}

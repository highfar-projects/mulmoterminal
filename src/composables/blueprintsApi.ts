// The blueprint overlay's calls to /api/blueprints. Every body is parsed with the same schemas the
// server writes with, so a shape that drifted shows up as an error on screen, not as `undefined`.
import { z } from "zod";
import { originalsViewSchema, type OriginalsView } from "../../common/blueprint/originals";
import { sourceStatusSchema, type SourceStatus } from "../../common/blueprint/sourceStatus";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { jsonBody } from "../jsonBody";
import { i18n } from "../i18n";
import { blueprintManifestSchema } from "../../common/blueprint/manifest";
import { hearingSchema, type HearingAnswers } from "../../common/blueprint/hearing";
import { planStepSchema } from "../../common/blueprint/plan";
import { blueprintRunSchema, blueprintRunSummarySchema, blueprintRunViewSchema, type BlueprintRunView } from "../../common/blueprint/run";
import { presetListingSchema, type PresetListing } from "../../common/blueprint/presets";
import type { PersonLanguage } from "../../common/blueprint/personLanguage";
import { refusalSchema, type Refusal } from "../../common/blueprint/refusal";
import { catalogSchema, installRecordSchema, type Catalog, type InstallRecord } from "../../common/blueprint/registry";

// `error` is the server's English; `refusal`, when the server gave one, is what the UI words in the person's language.
export type ApiFailure = { ok: false; error: string; refusal?: Refusal };
export type ApiResult<T> = { ok: true; value: T } | ApiFailure;

const packsSchema = z.object({ packs: z.array(z.object({ slug: z.string(), manifest: blueprintManifestSchema })) });
const pairSchema = z.object({ hearing: hearingSchema, steps: z.array(planStepSchema.extend({ origin: z.enum(["base", "usecase"]) })) });
const runsSchema = z.object({ runs: z.array(blueprintRunSummarySchema) });
const presetsSchema = z.object({ presets: z.array(presetListingSchema) });
const createdSchema = z.object({ runId: z.string() });

export type PackList = z.infer<typeof packsSchema>["packs"];
export type PairPreview = z.infer<typeof pairSchema>;
export type RunList = z.infer<typeof runsSchema>["runs"];

function failureOf(body: Record<string, unknown>, fallback: string): ApiFailure {
  const error = typeof body.error === "string" ? body.error : fallback;
  const refusal = refusalSchema.safeParse(body.refusal);
  return refusal.success ? { ok: false, error, refusal: refusal.data } : { ok: false, error };
}

async function call<T>(schema: z.ZodType<T>, url: string, init?: RequestInit, timeout_ms?: number): Promise<ApiResult<T>> {
  try {
    const res = await fetchWithTimeout(url, init, timeout_ms);
    const body = await jsonBody(res);
    if (!res.ok) return failureOf(body, `HTTP ${res.status} from ${url}`);
    const parsed = schema.safeParse(body);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: `Unexpected answer from ${url}` };
  } catch (err) {
    return { ok: false, error: `${url}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const postJson = (payload: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

// The packs' words in the screen's language: the server lays each pack's locale overlay over what the form shows.
const inScreenLanguage = (url: string): string => `${url}${url.includes("?") ? "&" : "?"}lang=${encodeURIComponent(String(i18n.global.locale.value))}`;

export const listPacks = (): Promise<ApiResult<z.infer<typeof packsSchema>>> => call(packsSchema, inScreenLanguage("/api/blueprints/packs"));

export const previewPair = (base: string, usecase: string): Promise<ApiResult<PairPreview>> =>
  call(pairSchema, inScreenLanguage(`/api/blueprints/pairs/${encodeURIComponent(base)}/${encodeURIComponent(usecase)}`));

/** The files in `dir`, to pick a question's answer from; none for a folder that does not exist yet. */
export const listFolderFiles = (dir: string): Promise<ApiResult<{ files: string[]; more: boolean }>> =>
  call(z.object({ files: z.array(z.string()), more: z.boolean() }), `/api/blueprints/folder-files?dir=${encodeURIComponent(dir)}`);

/** Which of `paths` are in `dir`; none for a folder that does not exist yet. */
export const folderPresentPaths = (dir: string, paths: readonly string[]): Promise<ApiResult<{ present: string[] }>> =>
  call(
    z.object({ present: z.array(z.string()) }),
    `/api/blueprints/folder-present?${new URLSearchParams([["dir", dir], ...paths.map((relative) => ["path", relative])]).toString()}`,
  );

/** A new folder for an example that Claude Code would trust, or null when no such place was found. */
export const suggestFolder = (name: string): Promise<ApiResult<{ path: string | null }>> =>
  call(z.object({ path: z.string().nullable() }), `/api/blueprints/folder-suggestion?name=${encodeURIComponent(name)}`);

/** The collections in the workspace a build may start from. */
const sourceSchema = z.object({ slug: z.string(), title: z.string(), kind: z.enum(["collection", "app"]) });
export type SourceChoice = z.infer<typeof sourceSchema>;

/** The collections, and the shared apps, a build may start from. */
export const listSourceCollections = (): Promise<ApiResult<{ collections: SourceChoice[] }>> =>
  call(z.object({ collections: z.array(sourceSchema) }), "/api/blueprints/collections");

export const listKnownFolders = (): Promise<ApiResult<{ folders: string[] }>> =>
  call(z.object({ folders: z.array(z.string()) }), "/api/blueprints/known-folders");

export const listPresets = (): Promise<ApiResult<{ presets: PresetListing[] }>> => call(presetsSchema, inScreenLanguage("/api/blueprints/presets"));

export const listRuns = (): Promise<ApiResult<z.infer<typeof runsSchema>>> => call(runsSchema, inScreenLanguage("/api/blueprints/runs"));

export const loadRun = (runId: string): Promise<ApiResult<BlueprintRunView>> =>
  call(blueprintRunViewSchema, inScreenLanguage(`/api/blueprints/runs/${encodeURIComponent(runId)}`));

export const loadRunSource = (runId: string): Promise<ApiResult<SourceStatus>> =>
  call(sourceStatusSchema, `/api/blueprints/runs/${encodeURIComponent(runId)}/source`);

export const startRun = (request: {
  projectDir: string;
  base: string;
  usecase: string;
  answers: HearingAnswers;
  preset?: string;
  language?: PersonLanguage;
  personalDataConfirmed?: boolean;
}): Promise<ApiResult<{ runId: string }>> => call(createdSchema, "/api/blueprints/runs", postJson(request));

export type PersonEvent = { type: "approve" } | { type: "reject"; reason: string } | { type: "answer"; answer: string } | { type: "retry" };

export const sendEvent = (runId: string, stepId: string, event: PersonEvent): Promise<ApiResult<BlueprintRunView>> =>
  call(blueprintRunViewSchema, inScreenLanguage(`/api/blueprints/runs/${encodeURIComponent(runId)}/events`), postJson({ ...event, stepId }));

/** Puts a build away from the list (or brings it back); nothing about the build itself changes. */
export const archiveRun = (runId: string, archived: boolean): Promise<ApiResult<BlueprintRunView>> =>
  call(blueprintRunViewSchema, inScreenLanguage(`/api/blueprints/runs/${encodeURIComponent(runId)}/archive`), postJson({ archived }));

const urlsSchema = z.object({ urls: z.array(z.string()) });

export const loadCatalog = (): Promise<ApiResult<Catalog>> => call(catalogSchema, "/api/blueprints/market/catalog");

export const loadRegistryUrls = (): Promise<ApiResult<{ urls: string[] }>> => call(urlsSchema, "/api/blueprints/market/registries");

export const saveRegistryUrls = (urls: readonly string[]): Promise<ApiResult<{ urls: string[] }>> =>
  call(urlsSchema, "/api/blueprints/market/registries", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ urls }) });

// A clone over the network can take far longer than an ordinary request.
const INSTALL_TIMEOUT_MS = 180_000;

export const installPack = (registryUrl: string, slug: string): Promise<ApiResult<{ installed: InstallRecord }>> =>
  call(z.object({ installed: installRecordSchema }), "/api/blueprints/market/install", postJson({ registryUrl, slug }), INSTALL_TIMEOUT_MS);

export const uninstallPack = (slug: string): Promise<ApiResult<{ ok: boolean }>> =>
  call(z.object({ ok: z.boolean() }), "/api/blueprints/market/uninstall", postJson({ slug }));

const specViewSchema = z.object({
  spec: z.string().nullable(),
  openQuestions: z.string().nullable(),
  chat: blueprintRunSchema.shape.specChat,
  revising: z.boolean(),
});
export type SpecView = z.infer<typeof specViewSchema>;

const reportViewSchema = z.object({
  path: z.string().nullable(),
  markdown: z.string().nullable(),
  changed: z.object({ files: z.array(z.string()), more: z.boolean() }),
  pair: z.object({ base: z.string(), usecase: z.string() }).nullable(),
});
export type ReportView = z.infer<typeof reportViewSchema>;

/** The originals the build kept, each beside the file as it is now. */
export const loadOriginals = (runId: string): Promise<ApiResult<OriginalsView>> =>
  call(originalsViewSchema, `/api/blueprints/runs/${encodeURIComponent(runId)}/originals`);

/** The finished build's report, as its usecase names it; nulls when there is none. */
export const loadReport = (runId: string): Promise<ApiResult<ReportView>> => call(reportViewSchema, `/api/blueprints/runs/${encodeURIComponent(runId)}/report`);

export const loadSpec = (runId: string): Promise<ApiResult<SpecView>> => call(specViewSchema, `/api/blueprints/runs/${encodeURIComponent(runId)}/spec`);

export const sendSpecMessage = (runId: string, message: string): Promise<ApiResult<BlueprintRunView>> =>
  call(blueprintRunViewSchema, inScreenLanguage(`/api/blueprints/runs/${encodeURIComponent(runId)}/spec/messages`), postJson({ message }));

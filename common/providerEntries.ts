// A backend added from Settings (#2621): what the form turns into a `providers` entry, and the
// mistakes it refuses before they reach the file. Each refusal is one the model skill warns about,
// because each breaks a session in a way that is hard to diagnose from inside it.
import { isUsableModelId, isUsableProviderId } from "./modelIds.js";
import { slugFromLabel, uniqueSlug } from "./agentEntries.js";

export interface ProviderEntry {
  id: string;
  label: string;
  baseUrl: string;
  tokenEnv: string;
  maxOutputTokens?: number;
  models: string[];
}

export interface ProviderDraft {
  label: string;
  baseUrl: string;
  tokenEnv: string;
  /** Model ids separated by commas, spaces or new lines. */
  models: string;
  /** Blank leaves the key out. */
  maxOutputTokens: string;
}

export const PROVIDER_PROBLEMS = ["label", "baseUrl", "baseUrlV1", "tokenEnv", "models", "maxOutputTokens"] as const;
export type ProviderProblem = (typeof PROVIDER_PROBLEMS)[number];
export const isProviderProblem = (value: unknown): value is ProviderProblem => PROVIDER_PROBLEMS.some((problem) => problem === value);

/** What the form starts the output budget at: less than this and a thinking model spends it all
 *  thinking and answers with nothing. */
export const RECOMMENDED_MAX_OUTPUT_TOKENS = 16000;
const LABEL_MAX = 40;
// The id every built-in model preset is matched by: under it the picker already has models.
const PRESET_PROVIDER_ID = "openrouter";

const ENV_NAME_CHARS = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_");
// Upper case only, which is how environment variables are named — and what a pasted key almost never
// is, so a key typed into this field is refused rather than written to the config in the clear.
const isEnvName = (value: string): boolean =>
  value.length > 0 && value.length <= 128 && !/^\d/.test(value) && [...value].every((char) => ENV_NAME_CHARS.has(char));

// http(s) only, and never ending in /v1: Claude Code appends /v1/messages itself. No user, password,
// query or fragment either — the places a key can hide in a URL, and this one is echoed to every
// client that reads the config.
function baseUrlProblem(baseUrl: string): "baseUrl" | "baseUrlV1" | null {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return "baseUrl";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "baseUrl";
  if (url.username || url.password || url.search || url.hash) return "baseUrl";
  return /\/v1\/?$/.test(url.pathname) ? "baseUrlV1" : null;
}

// A secret pasted where a model id belongs: provider keys are prefixed this way, and model ids are not.
const looksLikeKey = (value: string): boolean => /^(sk|pk|rk)[-_]/i.test(value);

const withoutTrailingSlashes = (url: string): string => (url.endsWith("/") ? withoutTrailingSlashes(url.slice(0, -1)) : url);

const modelsOf = (text: string): string[] => [
  ...new Set(
    text
      .split(/[\s,]+/)
      .map((model) => model.trim())
      .filter((model) => model !== ""),
  ),
];

function outputBudget(text: string): number | null | "bad" {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value > 0 ? value : "bad";
}

export function buildProvider(draft: ProviderDraft, existingIds: readonly string[]): { entry: ProviderEntry } | { problem: ProviderProblem } {
  const label = draft.label.trim();
  if (!label || label.length > LABEL_MAX) return { problem: "label" };
  const baseUrl = withoutTrailingSlashes(draft.baseUrl.trim());
  const urlProblem = baseUrlProblem(baseUrl);
  if (urlProblem) return { problem: urlProblem };
  const tokenEnv = draft.tokenEnv.trim();
  if (!isEnvName(tokenEnv)) return { problem: "tokenEnv" };
  const id = uniqueSlug(
    slugFromLabel(label) || "provider",
    (candidate) => isUsableProviderId(candidate) && !existingIds.includes(candidate),
    existingIds.length + 2,
  );
  if (id === null) return { problem: "label" };
  const models = modelsOf(draft.models);
  if (models.some((model) => !isUsableModelId(model) || looksLikeKey(model)) || (models.length === 0 && id !== PRESET_PROVIDER_ID))
    return { problem: "models" };
  const budget = outputBudget(draft.maxOutputTokens);
  if (budget === "bad") return { problem: "maxOutputTokens" };
  return { entry: { id, label, baseUrl, tokenEnv, ...(budget === null ? {} : { maxOutputTokens: budget }), models } };
}

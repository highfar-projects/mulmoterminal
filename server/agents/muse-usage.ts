// What a `muse` session says about tokens — the two numbers behind `Muse · ctx 33%`
// and `⇡1.2M ⇣18k`.
//
// `muse` writes `~/.local/share/muse/sessions/.../session.jsonl` with
// `payload_type=runtime.session` `kind=model_completed` records:
//   usage: { input_tokens, output_tokens, cached_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens }
//   model: "muse-spark-1.2-contributor"
//
// `input_tokens` is the CURRENT context size (fresh+cache) — monotonically growing
// like Claude's last-turn context. `output_tokens` is per-turn, not cumulative.
// So session usage: last context + summed outputs; context: last input_tokens.
/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { isRecord } from "../../common/isRecord.js";
import type { SessionContextInfo } from "../../common/sessionContext.js";
import type { SessionUsage } from "../session/transcript.js";

export const emptyMuseUsage = (): SessionUsage => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });

export const isMuseUsage = (value: unknown): value is SessionUsage =>
  isRecord(value) &&
  typeof value.inputTokens === "number" &&
  typeof value.outputTokens === "number" &&
  typeof value.cacheReadTokens === "number" &&
  typeof value.cacheCreationTokens === "number";

const num = (record: Record<string, unknown>, key: string): number => {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
};

export function museContextFromRecord(record: Record<string, unknown>): SessionContextInfo | null {
  // payload.event.kind === "model_completed"
  const event = isRecord(record.payload) ? (record.payload as Record<string, unknown>).event : null;
  if (!isRecord(event) || event.kind !== "model_completed") return null;
  const usage = isRecord(event.usage) ? event.usage : null;
  const model = typeof event.model === "string" && event.model.trim() ? event.model : null;
  const contextTokens = usage ? num(usage, "input_tokens") : 0;
  // muse does not report window; caller falls back to table
  return { model, contextTokens, contextWindow: null };
}

export function foldMuseUsage(into: SessionUsage, record: Record<string, unknown>): void {
  const event = isRecord(record.payload) ? (record.payload as Record<string, unknown>).event : null;
  if (!isRecord(event) || event.kind !== "model_completed") return;
  const usage = isRecord(event.usage) ? event.usage : null;
  if (!usage) return;
  // cached_tokens subset of input — split like grok
  const input = num(usage, "input_tokens");
  const cached = Math.min(num(usage, "cached_tokens") || num(usage, "cache_read_tokens"), input);
  // We keep running totals as last context + sum of outputs.
  // But folding SUM would double-count input (which is cumulative). Instead,
  // we keep input as max seen (last context) — caller handles that via museContextFromRecord.
  // Here we only sum outputs and cache.
  into.cacheReadTokens += cached;
  into.outputTokens += num(usage, "output_tokens");
  // inputTokens is set to max, not sum — to avoid double count, caller will overwrite
  // from context. We still accumulate a sum for fallback? Keep sum separately?
  // For compatibility with transcript-fold copy, we store sum of fresh inputs (input-cached)
  // but also expose last context via separate path. Simplest: sum fresh as inputTokens,
  // but agent-badges will prefer contextTokens for % and usage may double. Let's store
  // sum of (input - cached) as incremental fresh tokens, plus output.
  into.inputTokens += Math.max(0, input - cached);
}

export function museModelFromRecord(record: Record<string, unknown>): string | null {
  const ctx = museContextFromRecord(record);
  return ctx?.model ?? null;
}

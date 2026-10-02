// The work list a pack's steps keep in `.blueprint/targets.json`, as the run view shows it. The file is
// written by an agent and held to its shape by the pack's own check; this reads it for display only, so it
// drops what it does not know and reports a file it cannot read rather than failing the view.
import { z } from "zod";
import { currentStep, type BlueprintState } from "./state.js";
import type { PlanStep } from "./plan.js";

export const TARGETS_FILE = ".blueprint/targets.json";

export const TARGET_STATUSES = ["todo", "done", "skipped"] as const;

const targetSchema = z.object({
  id: z.string().min(1),
  kind: z.string().optional(),
  title: z.string().min(1),
  files: z.array(z.string()).default([]),
  why: z.string().optional(),
  proof: z.string().optional(),
  status: z.enum(TARGET_STATUSES),
  pr: z.string().optional(),
  note: z.string().optional(),
});

export type Target = z.infer<typeof targetSchema>;

const targetsFileSchema = z.object({ targets: z.array(targetSchema) });

/** What `GET …/targets` answers: no list yet, a list, or a file that is there but cannot be read as one. */
export const targetsViewSchema = z.object({ targets: z.array(targetSchema).nullable(), problem: z.string().nullable() });

export type TargetsView = z.infer<typeof targetsViewSchema>;

function parsedJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

/** The list the file holds; `raw` null is a build that has not written one. */
export function targetsViewOf(raw: string | null): TargetsView {
  if (raw === null) return { targets: null, problem: null };
  const json = parsedJson(raw);
  if (!json.ok) return { targets: null, problem: `${TARGETS_FILE} is not JSON` };
  const parsed = targetsFileSchema.safeParse(json.value);
  if (!parsed.success) return { targets: null, problem: `${TARGETS_FILE} does not hold a list of targets` };
  // The id is each row's identity on screen; the pack's own check refuses a repeat for the same reason.
  const ids = parsed.data.targets.map((target) => target.id);
  if (new Set(ids).size !== ids.length) return { targets: null, problem: `${TARGETS_FILE} lists a target id twice` };
  return { targets: parsed.data.targets, problem: null };
}

const PULL_REQUEST_URL_RE = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+$/;

/** Only a GitHub pull request becomes a link: the file is written by an agent, and a link is something a person clicks. */
export const isPullRequestUrl = (url: string | undefined): url is string => url !== undefined && PULL_REQUEST_URL_RE.test(url);

export type TargetPhase = "todo" | "working" | "needs-decision" | "done" | "skipped";

export type TargetRow = { target: Target; position: number; phase: TargetPhase };

// A repeating step works one target per round, the first still to do; any other step — the survey writing
// the list — is working on none of them.
function activePhase(steps: readonly PlanStep[], state: BlueprintState): TargetPhase | null {
  const step = currentStep(steps, state);
  if (!step?.repeatWhile) return null;
  const status = state.steps[step.id]?.status;
  if (status === "running") return "working";
  if (status === "awaiting-answer") return "needs-decision";
  return null;
}

/** The list in its order, each with where it stands now. */
export function targetRows(targets: readonly Target[], steps: readonly PlanStep[], state: BlueprintState): TargetRow[] {
  const active = activePhase(steps, state);
  const activeIndex = active === null ? -1 : targets.findIndex((target) => target.status === "todo");
  return targets.map((target, index) => ({ target, position: index + 1, phase: index === activeIndex && active ? active : target.status }));
}

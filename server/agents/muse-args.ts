// Builds the argv for spawning `muse` as a first-class session.
//
// `muse` has no --session-id; it mints its own id (sqlite session-index.db).
// Fresh: `muse --workspace <cwd>` (and optional --model/--reasoning-effort).
// Resume: `muse resume <id>`.

export interface MuseArgsInput {
  resume?: string | null;
  workspace?: string | null;
  model?: string | null;
  reasoningEffort?: string | null;
  initialPrompt?: string | null;
}

export function buildMuseArgs(input: MuseArgsInput): string[] {
  if (input.resume) {
    return ["--yolo", "resume", input.resume];
  }

  const args: string[] = ["--yolo"];

  if (input.workspace) {
    args.push("--workspace", input.workspace);
  }

  if (input.model) {
    args.push("--model", input.model);
  }

  if (input.reasoningEffort) {
    args.push("--reasoning-effort", input.reasoningEffort);
  }

  if (input.initialPrompt) {
    args.push(input.initialPrompt);
  }

  return args;
}

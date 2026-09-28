// Why the server would not start or move a build, as data: the UI words it in the person's language,
// and the English sentence the API also returns is derived from the same object so the two cannot drift.
import { z } from "zod";

export const refusalSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("not-absolute") }),
  z.object({ code: z.literal("not-a-directory"), dir: z.string() }),
  z.object({ code: z.literal("untrusted"), dir: z.string() }),
  z.object({ code: z.literal("folder-busy"), dir: z.string(), runId: z.string() }),
  z.object({ code: z.literal("samples-clash"), files: z.array(z.string()).readonly() }),
  z.object({ code: z.literal("held-elsewhere"), port: z.string() }),
  z.object({ code: z.literal("revision-pending") }),
  z.object({ code: z.literal("spec-not-at-review") }),
  z.object({ code: z.literal("message-pending") }),
  z.object({ code: z.literal("agent-working") }),
]);

export type Refusal = z.infer<typeof refusalSchema>;
export type RefusalCode = Refusal["code"];

export function englishRefusal(refusal: Refusal): string {
  switch (refusal.code) {
    case "not-absolute":
      return "projectDir must be an absolute path below the root";
    case "not-a-directory":
      return `projectDir is not a directory: ${refusal.dir}`;
    case "untrusted":
      return `Claude Code does not trust ${refusal.dir} yet. Open a terminal there once and accept the trust prompt, then try again.`;
    case "folder-busy":
      return `another build (${refusal.runId}) is working in ${refusal.dir} right now: wait until it stops for you, then try again`;
    case "samples-clash":
      return `this folder already has other files named ${refusal.files.join(", ")}: choose an empty folder for the example`;
    case "held-elsewhere":
      return `blueprints on this machine are run by the MulmoTerminal on port ${refusal.port}; make changes there`;
    case "revision-pending":
      return "the spec is still being revised; wait for the reply";
    case "spec-not-at-review":
      return "the spec can be discussed only while it waits for review";
    case "message-pending":
      return "the previous message is still being answered";
    case "agent-working":
      return "an agent is working on the build";
  }
}

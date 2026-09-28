// Why the executor itself stopped a step, rather than a pack's check or a person: kept as data beside the English output
// so the run view can word it in the person's language, while the agent keeps reading the English.
import { z } from "zod";

export const stepNoticeSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("folder-busy"), runId: z.string() }),
  z.object({ code: z.literal("untrusted"), dir: z.string() }),
  z.object({ code: z.literal("answers-unwritten"), detail: z.string() }),
  z.object({ code: z.literal("session-lost") }),
  z.object({ code: z.literal("round-limit"), rounds: z.number().int().positive() }),
]);

export type StepNotice = z.infer<typeof stepNoticeSchema>;
export type StepNoticeCode = StepNotice["code"];

export function englishStepNotice(notice: StepNotice): string {
  switch (notice.code) {
    case "folder-busy":
      return `Another build (${notice.runId}) is working in this folder. Press Retry once it has stopped (finished, or waiting for you).`;
    case "untrusted":
      return `Claude Code does not trust ${notice.dir} (a step may have made it a git repository, which needs its own trust). Open a terminal there, accept the trust prompt, then retry this step.`;
    case "answers-unwritten":
      return `The interview answers could not be written to .blueprint/answers.json: ${notice.detail}`;
    case "session-lost":
      return "The session ended before finishing its turn (it was closed, reaped or crashed). The check was not run.";
    case "round-limit":
      return `${notice.rounds} rounds ran and there is still work left; try again to run one more round`;
  }
}

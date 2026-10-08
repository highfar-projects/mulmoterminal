// Whether a build's source is still what was copied: the answer to the run view's one question when it opens.
import { z } from "zod";

export const sourceStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("same") }),
  // `takenAt`: when the copy the build works from was taken.
  z.object({ status: z.literal("changed"), takenAt: z.string() }),
  // The source can no longer be taken again as it was: gone, the shared app signed out of, a role that reads less, too large.
  z.object({ status: z.literal("unreadable"), reason: z.enum(["unknown", "signed-out", "not-a-reader", "too-large"]) }),
  // Nothing to compare: the build did not start from a source, or its copy predates the fingerprint.
  z.object({ status: z.literal("unknown") }),
]);

export type SourceStatus = z.infer<typeof sourceStatusSchema>;

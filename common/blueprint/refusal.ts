// Why the server would not start or move a build, or install a pack, as data: the UI words it in the person's language,
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
  z.object({ code: z.literal("registry-url-not-allowed"), urls: z.array(z.string()).readonly() }),
  z.object({ code: z.literal("registry-unknown"), url: z.string() }),
  z.object({ code: z.literal("pack-not-listed"), url: z.string(), slug: z.string() }),
  z.object({ code: z.literal("pack-busy"), slug: z.string() }),
  z.object({ code: z.literal("pack-not-installed"), slug: z.string() }),
  z.object({ code: z.literal("pack-builtin"), slug: z.string() }),
  z.object({ code: z.literal("pack-local-repo"), repo: z.string() }),
  // What is wrong with the pack, or with fetching it, stays technical English inside the worded sentence.
  z.object({ code: z.literal("pack-broken"), detail: z.string() }),
  z.object({ code: z.literal("install-failed"), detail: z.string() }),
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
    case "registry-url-not-allowed":
      return `registry URLs must be https (or http on localhost): ${refusal.urls.join(", ")}`;
    case "registry-unknown":
      return `not a registry this machine reads: ${refusal.url}`;
    case "pack-not-listed":
      return `${refusal.url} lists no pack "${refusal.slug}"`;
    case "pack-busy":
      return `"${refusal.slug}" is already being installed or removed`;
    case "pack-not-installed":
      return `"${refusal.slug}" is not an installed pack`;
    case "pack-builtin":
      return `"${refusal.slug}" is a pack shipped with MulmoTerminal and cannot be replaced`;
    case "pack-local-repo":
      return `a registry on the web cannot install from this machine's disk (${refusal.repo})`;
    case "pack-broken":
    case "install-failed":
      return refusal.detail;
  }
}

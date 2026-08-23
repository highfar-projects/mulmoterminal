// The apps this machine remembers being in — the answer to a question Firestore cannot be asked.
//
// "Which shared apps am I a member of?" has no index anywhere. `apps/{aid}` is
// `allow read: if readerOf(app(aid), '*')` — a GET, not a list — and `appSlugs` can enumerate the
// published names of the whole world but not the ones that are yours. An index keyed by member
// would be exactly the document principle 5 refuses: a world-shaped table of who belongs where.
//
// So the register is LOCAL, and that is a client convenience rather than a part of the app. Losing
// this file loses nothing an app depends on: every entry can be recovered by naming the slug again,
// and nothing published reads it. It is here rather than in `~/.mulmoterminal/config.json` for the
// same reason the worktree registry is — state the user did not write, that the app maintains.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { isRecord } from "../../../../common/isRecord.js";
import { mulmoterminalHome } from "../../../infra/mulmoterminal-home.js";
import { serializeBy } from "../serialize.js";

/** One remembered app. The slug is the key: it is what a person is given and what they say. */
export interface RememberedApp {
  slug: string;
  aid: string;
  /** The app's own name when the roster let us read it, so the list reads as names rather than ids. */
  name?: string;
}

const registryFile = (): string => path.join(mulmoterminalHome(), "shared-apps.json");

/** One writer at a time, and a whole file when there is one.
 *
 *  Both halves are needed and they fix different failures. Every write here is a READ, a change, and
 *  a write back, and MulmoTerminal is one server every cell's tool call runs in — so two cells
 *  describing two apps at once would each compute a list from the same old file and the second
 *  would drop the first's entry. And `writeFile` truncates before it writes, so a reader arriving
 *  mid-write sees a file that is not JSON; the temporary file plus `rename` is what makes the
 *  replacement atomic, so a reader sees the old list or the new one and never half of either.
 *
 *  The key is prefixed for the reason `serialize.ts` says: the namespaces overlap in the obvious
 *  spelling, and a chain waiting on itself is a deadlock rather than a bug you can see. */
const REGISTRY_CHAIN = "registry:shared-apps";

async function replaceRegistry(next: RememberedApp[]): Promise<void> {
  const file = registryFile();
  const staging = `${file}.${randomUUID()}.tmp`;
  await mkdir(mulmoterminalHome(), { recursive: true });
  await writeFile(staging, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  await rename(staging, file);
}

const parse = (raw: string): RememberedApp[] => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    // A corrupted register is an empty one, never a failure: nothing depends on it, and refusing
    // to answer `apps` because a file will not parse would be a worse outcome than forgetting.
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.slug !== "string" || typeof entry.aid !== "string") return [];
    return [{ slug: entry.slug, aid: entry.aid, ...(typeof entry.name === "string" ? { name: entry.name } : {}) }];
  });
};

export async function rememberedApps(): Promise<RememberedApp[]> {
  const raw = await readFile(registryFile(), "utf-8").catch(() => null);
  return raw === null ? [] : parse(raw);
}

/** Remember one app, replacing whatever was known about that slug.
 *
 *  Called on every successful `describe`, so the register fills itself from use rather than from a
 *  separate "add" the user has to think about. Best effort: a register that cannot be written must
 *  not fail the operation it was following, which is a read of somebody else's app. */
export async function rememberApp(entry: RememberedApp): Promise<void> {
  try {
    await serializeBy(REGISTRY_CHAIN, async () => {
      const kept = (await rememberedApps()).filter((known) => known.slug !== entry.slug);
      await replaceRegistry([...kept, entry].sort((left, right) => (left.slug < right.slug ? -1 : 1)));
    });
  } catch {
    // Deliberately silent — see above.
  }
}

/** What happened to a `forget`. Three answers rather than two, because they are three different
 *  things to tell somebody: it is gone, it was never here, and the list could not be written.
 *
 *  NOT best-effort like `rememberApp`, and the asymmetry is the point. Remembering is a side effect
 *  of reading an app — nobody asked for it, so a failure is worth nothing to report. Forgetting is
 *  the whole of what was asked, and a silent failure would answer "forgotten" about an entry that
 *  is still there. Reported rather than thrown for the reason every refusal in this tool is: the
 *  agent's contract is actionable prose, and an exception reaches it as a stack trace. */
export type ForgetResult = "forgotten" | "not-known" | { failed: string };

export async function forgetApp(slug: string): Promise<ForgetResult> {
  return serializeBy(REGISTRY_CHAIN, async (): Promise<ForgetResult> => {
    try {
      // The read is INSIDE the chain, which is the whole point: read outside it and the list this
      // decides from is one another writer has already replaced.
      const known = await rememberedApps();
      if (!known.some((entry) => entry.slug === slug)) return "not-known";
      await replaceRegistry(known.filter((entry) => entry.slug !== slug));
      return "forgotten";
    } catch (err) {
      return { failed: err instanceof Error ? err.message : String(err) };
    }
  });
}

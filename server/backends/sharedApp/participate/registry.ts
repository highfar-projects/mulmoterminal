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
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isRecord } from "../../../../common/isRecord.js";
import { mulmoterminalHome } from "../../../infra/mulmoterminal-home.js";

/** One remembered app. The slug is the key: it is what a person is given and what they say. */
export interface RememberedApp {
  slug: string;
  aid: string;
  /** The app's own name when the roster let us read it, so the list reads as names rather than ids. */
  name?: string;
}

const registryFile = (): string => path.join(mulmoterminalHome(), "shared-apps.json");

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
    const kept = (await rememberedApps()).filter((known) => known.slug !== entry.slug);
    const next = [...kept, entry].sort((left, right) => (left.slug < right.slug ? -1 : 1));
    await mkdir(mulmoterminalHome(), { recursive: true });
    await writeFile(registryFile(), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  } catch {
    // Deliberately silent — see above.
  }
}

/** Forget one slug. Returns whether it was there, so the report can tell a removal from a typo. */
export async function forgetApp(slug: string): Promise<boolean> {
  const known = await rememberedApps();
  if (!known.some((entry) => entry.slug === slug)) return false;
  const next = known.filter((entry) => entry.slug !== slug);
  await mkdir(mulmoterminalHome(), { recursive: true });
  await writeFile(registryFile(), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return true;
}

// Where a campaign's records live, and the two things anybody does with them (#1815).
//
// Deliberately OUTSIDE every clone and outside the repository tree. That is not only tidiness: a
// task touching this directory is then outside the paths it claimed, so the merge gate rejects it.
// It protects an honest task from a mistake — on the trust model this repo accepts it does not
// stop an adversarial one, which is stated where the decision was made rather than implied here
// (`future/grid-campaign-mode.md`, decision 4).
import { appendFileSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync } from "node:fs";
import { isRecord } from "../../common/isRecord.js";
import path from "node:path";
import { mulmoterminalHome } from "../infra/mulmoterminal-home.js";
import { parseCampaignLog, recordLine, type CampaignRecord } from "./campaign-log.js";

const CAMPAIGNS_DIR = "campaigns";
const CAMPAIGN_EXT = ".jsonl";

/** A campaign id becomes a FILENAME, so this is the whole defence: no separators, no dots, nothing
 *  that could leave the campaigns directory. **Lowercase**, for the reason `ROOM_ID_RE` is — a
 *  case-insensitive filesystem (the default on macOS and Windows) would otherwise let `Lint` and
 *  `lint` append into one log under two names, and reconciliation would derive idempotency keys
 *  with a different campaign id than the writer used. */
const CAMPAIGN_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const isCampaignId = (v: unknown): v is string => typeof v === "string" && CAMPAIGN_ID.test(v);

/** Where campaigns live. A function, not a constant, so MULMOTERMINAL_HOME redirects it the way it
 *  redirects everything else this app persists. */
export const campaignsDir = (): string => path.join(mulmoterminalHome(), CAMPAIGNS_DIR);

/** The file for a campaign, or null when the id is not one.
 *
 *  The id check is the WHOLE path defence, so it happens here rather than being assumed of the
 *  caller — the same arrangement `rooms.ts` uses, and for the same reason: every entry point goes
 *  through this function. */
export function campaignFile(campaign: string): string | null {
  return isCampaignId(campaign) ? path.join(campaignsDir(), `${campaign}${CAMPAIGN_EXT}`) : null;
}

/**
 * Is this the filesystem saying "there is nothing here", as opposed to "I could not find out"?
 *
 * The distinction is the whole point of the two functions below. `existsSync` collapses it — it
 * answers `false` for a path that does not exist AND for one it cannot traverse — so it is not
 * used here at all.
 */
const isMissing = (err: unknown): boolean => isRecord(err) && err.code === "ENOENT";

/** Every record for a campaign, oldest first.
 *
 *  A campaign that does not exist is EMPTY; one that cannot be read THROWS. Those are different
 *  answers and must not be given the same one: a permission error coming back as "no records" would
 *  let a runner start a campaign again from `intake` while its real tasks are mid-flight. */
export function readCampaign(campaign: string): CampaignRecord[] {
  const file = campaignFile(campaign);
  if (file === null) return [];
  try {
    return parseCampaignLog(readFileSync(file, "utf8"));
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
}

/**
 * Make a directory's own contents durable, so the NAME of a file inside it survives a power cut.
 *
 * Flushing a file does not do this: the entry that points at it lives in the parent, and a host
 * that dies at the wrong moment can leave a fsynced file that nothing refers to. Only matters for
 * the append that creates the file (and the one that creates `campaigns/`), but doing it every time
 * costs one fsync on a path that runs at agent pace, not in a loop.
 *
 * Windows cannot open a directory this way, and there is nothing to fall back to — so on Windows
 * this is skipped and the guarantee below is correspondingly weaker, which `appendCampaignRecord`
 * says out loud rather than implying. Anywhere else a failure here is a real failure and is thrown:
 * a name that may not survive is exactly what the caller must not be told `true` about.
 */
function syncDirectory(dir: string): void {
  if (process.platform === "win32") return;
  const fd = openSync(dir, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Append one record.
 *
 * Returns whether it was stored, and a caller that gets `false` MUST NOT go on to cause the effect
 * the record describes: an unwritten intent is an effect nobody can reconcile afterwards. That is
 * the opposite of `postToRoom`'s tolerance of a failed append, and for a reason — a lost message is
 * a lost message, while a lost intent is a merge nobody knows happened.
 *
 * `true` means the record survives a host or power failure, not merely this process exiting — the
 * data is flushed and the directory entry naming it is synced. **On Windows the second half is not
 * available**, so there `true` means "written and flushed" and a power cut can still lose a file
 * created in the same moment.
 */
export function appendCampaignRecord(campaign: string, record: CampaignRecord): boolean {
  const file = campaignFile(campaign);
  if (file === null) return false;
  const line = recordLine(record);
  // Write nothing the reader would throw away. `CampaignRecord` is looser than what the file
  // format accepts — `attempt: 0` is a `number`, and `at: Infinity` becomes `null` in JSON — so a
  // record can type-check, land on disk, and be invisible after a restart. That is the lost intent
  // this whole return value exists to prevent.
  //
  // A ROUND TRIP rather than a second predicate: asking whether the reader accepts this exact line
  // cannot drift from what `readCampaign` really accepts, whereas two guards can.
  //
  // Reading back as one record is the whole test — comparing it to `record` afterwards would be
  // tautological, since both sides are then the same JSON projection. (Written that way at first;
  // the mutation sweep found the comparison could not fail, which is what a sweep is for.)
  if (parseCampaignLog(line).length !== 1) return false;
  try {
    const dir = path.dirname(file);
    mkdirSync(dir, { recursive: true });
    // `flush: true` is what makes the `true` below mean something across a power cut: without it
    // the write sits in the page cache, and a host that dies after this call loses the intent
    // while the caller has already been told to go ahead. Node supports it from 21.x and this
    // package requires >=22.9. `rooms.ts` does not flush and is right not to — a lost message is
    // a lost message, while a lost intent is a side effect nobody can reconcile.
    appendFileSync(file, line, { encoding: "utf8", flush: true });
    // And the file's name, which the flush above does not cover. Both directories: a fsync of
    // `campaigns/` does not make `campaigns/` itself durable inside its own parent.
    syncDirectory(dir);
    syncDirectory(path.dirname(dir));
    return true;
  } catch (err) {
    console.warn(`[campaign] could not append to ${campaign}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * The campaigns on disk. A restart reads this to find what it must reconcile before doing anything.
 *
 * Regular files only, like `listRooms()`: a DIRECTORY named `c1.jsonl` would otherwise be reported
 * as a campaign and then fail to read as one.
 *
 * Where it deliberately differs from `listRooms()` is the catch. That one swallows every failure,
 * which is right for a listing nobody depends on — here an empty list is indistinguishable from
 * "no campaigns", and a restart would skip reconciliation for tasks that are mid-flight. So only
 * "the directory is not there yet" is empty; anything else reaches the caller.
 */
export function listCampaigns(): string[] {
  try {
    return readdirSync(campaignsDir(), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(CAMPAIGN_EXT))
      .map((entry) => entry.name.slice(0, -CAMPAIGN_EXT.length))
      .filter(isCampaignId);
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
}

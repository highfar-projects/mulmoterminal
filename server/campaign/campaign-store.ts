// Where a campaign's records live, and the two things anybody does with them (#1815).
//
// Deliberately OUTSIDE every clone and outside the repository tree. That is not only tidiness: a
// task touching this directory is then outside the paths it claimed, so the merge gate rejects it.
// It protects an honest task from a mistake — on the trust model this repo accepts it does not
// stop an adversarial one, which is stated where the decision was made rather than implied here
// (`future/grid-campaign-mode.md`, decision 4).
import { appendFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
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
 * Append one record.
 *
 * Returns whether it was stored, and a caller that gets `false` MUST NOT go on to cause the effect
 * the record describes: an unwritten intent is an effect nobody can reconcile afterwards. That is
 * the opposite of `postToRoom`'s tolerance of a failed append, and for a reason — a lost message is
 * a lost message, while a lost intent is a merge nobody knows happened.
 */
export function appendCampaignRecord(campaign: string, record: CampaignRecord): boolean {
  const file = campaignFile(campaign);
  if (file === null) return false;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, recordLine(record), "utf8");
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

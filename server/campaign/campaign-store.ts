// Where a campaign's records live, and the two things anybody does with them (#1815).
//
// Deliberately OUTSIDE every clone and outside the repository tree. That is not only tidiness: a
// task touching this directory is then outside the paths it claimed, so the merge gate rejects it.
// It protects an honest task from a mistake — on the trust model this repo accepts it does not
// stop an adversarial one, which is stated where the decision was made rather than implied here
// (`future/grid-campaign-mode.md`, decision 4).
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { mulmoterminalHome } from "../infra/mulmoterminal-home.js";
import { parseCampaignLog, recordLine, type CampaignRecord } from "./campaign-log.js";

const CAMPAIGNS_DIR = "campaigns";
const CAMPAIGN_EXT = ".jsonl";

/** A campaign id this app will accept: letters, digits, hyphen. No separator and no dot, which is
 *  what makes the join below unable to leave the directory. */
const CAMPAIGN_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

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

/** Every record for a campaign, oldest first.
 *
 *  A campaign that does not exist is EMPTY; one that cannot be read THROWS. Those are different
 *  answers and must not be given the same one: a permission error coming back as "no records" would
 *  let a runner start a campaign again from `intake` while its real tasks are mid-flight. */
export function readCampaign(campaign: string): CampaignRecord[] {
  const file = campaignFile(campaign);
  if (file === null || !existsSync(file)) return [];
  return parseCampaignLog(readFileSync(file, "utf8"));
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

/** The campaigns on disk. Used by a restart to find what it has to reconcile before doing anything. */
export function listCampaigns(): string[] {
  const dir = campaignsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(CAMPAIGN_EXT))
    .map((name) => name.slice(0, -CAMPAIGN_EXT.length))
    .filter(isCampaignId);
}

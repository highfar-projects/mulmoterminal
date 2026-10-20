// Whether a `.json` is a MulmoScript, as far as the Files pane offers its Canvas view (#3137): a root
// object holding `$mulmocast`, a key mulmocast's own schema requires. The plugin still validates the
// whole script when the card is built; this only keeps the button off ordinary JSON.
import { isRecord } from "../../common/isRecord";

const MULMOCAST_KEY = "$mulmocast";
const JSON_FILE_NAME = /\.json$/i;

export function isMulmoScriptText(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) && Object.hasOwn(parsed, MULMOCAST_KEY);
  } catch {
    return false;
  }
}

/** Whether the Canvas view of `path` depends on what the file holds: a story is any `.json` by name. */
export const canvasNeedsMulmoScript = (path: string): boolean => JSON_FILE_NAME.test(path);

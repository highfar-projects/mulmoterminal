import { ref } from "vue";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { guideLanguageFor, parseWhatsNew, type WhatsNewResponse } from "../../common/whatsNew";

// Module state: the question is asked once per page load, and the answer belongs to the page, not
// to whichever component happens to render it.
const whatsNew = ref<WhatsNewResponse | null>(null);
let asked = false;

async function load(locale: string): Promise<void> {
  try {
    const res = await fetchWithTimeout(`/api/whats-new?lang=${guideLanguageFor(locale)}`);
    if (!res.ok) return;
    const answer = parseWhatsNew(await jsonBody(res));
    whatsNew.value = answer && answer.entries.length > 0 ? answer : null;
  } catch {
    // best-effort — a missed announcement is shown again on the next load
  }
}

async function dismiss(): Promise<void> {
  const shown = whatsNew.value;
  whatsNew.value = null;
  if (!shown) return;
  try {
    await fetchWithTimeout("/api/whats-new/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: shown.version }),
    });
  } catch {
    // Not recorded means shown once more next time, which is the safe side to fail on.
  }
}

export function useWhatsNew(locale: string) {
  if (!asked) {
    asked = true;
    void load(locale);
  }
  return { whatsNew, dismiss };
}

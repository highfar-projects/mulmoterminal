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
    const res = await fetchWithTimeout("/api/whats-new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: guideLanguageFor(locale) }),
    });
    if (!res.ok) return;
    const answer = parseWhatsNew(await jsonBody(res));
    whatsNew.value = answer && answer.entries.length > 0 ? answer : null;
  } catch {
    // best-effort: the server may already have recorded the release as seen, so a lost answer
    // means no dialog for this release rather than a retry.
  }
}

// The server recorded the release as seen when it answered, so closing is only local.
function dismiss(): void {
  whatsNew.value = null;
}

export function useWhatsNew(locale: string) {
  if (!asked) {
    asked = true;
    void load(locale);
  }
  return { whatsNew, dismiss };
}

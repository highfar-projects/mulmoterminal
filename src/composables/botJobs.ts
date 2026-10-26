import { computed, ref } from "vue";
import { BOT_JOBS_DEFAULT, sanitizeBotJobs, type BotJobs } from "../../common/botJobs";
import { postConfigField } from "./postConfigField";

// The `botJobs` setting as the browser last read it from /api/config, read with the server's own
// sanitizer so the two cannot disagree about what an odd value means (plans/feat-bot-gpu-jobs.md).
const setting = ref<BotJobs>(BOT_JOBS_DEFAULT);
export const botJobsSetting = computed(() => setting.value);

// How many saves this page has landed — the toolbarPins safeguard. A config read that started BEFORE
// a save answers with the setting as it was, and adopting it would show bot jobs switched back on
// after the user switched them off; the next save would then persist that. The reader takes this
// mark when its request starts and hands it back with the answer.
let saves = 0;
/** Take before starting a read of /api/config, hand back to `setBotJobs`. */
export const botJobsMark = (): number => saves;

export const setBotJobs = (value: unknown, mark?: number): void => {
  if (mark !== undefined && mark !== saves) return;
  setting.value = sanitizeBotJobs(value);
};

export async function saveBotJobs(value: BotJobs): Promise<boolean> {
  const saved = await postConfigField("botJobs", value);
  if (!saved.ok) return false;
  saves += 1; // before adopting, so a read already in flight cannot undo this
  setBotJobs(saved.value);
  return true;
}

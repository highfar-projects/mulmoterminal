import { computed, ref } from "vue";
import { BOT_JOBS_DEFAULT, sanitizeBotJobs, type BotJobs } from "../../common/botJobs";
import { postConfigField } from "./postConfigField";

// The `botJobs` setting as the browser last read it from /api/config, read with the server's own
// sanitizer so the two cannot disagree about what an odd value means (plans/feat-bot-gpu-jobs.md).
const setting = ref<BotJobs>(BOT_JOBS_DEFAULT);
export const botJobsSetting = computed(() => setting.value);

export const setBotJobs = (value: unknown): void => {
  setting.value = sanitizeBotJobs(value);
};

export async function saveBotJobs(value: BotJobs): Promise<boolean> {
  const saved = await postConfigField("botJobs", value);
  if (saved.ok) setBotJobs(saved.value);
  return saved.ok;
}

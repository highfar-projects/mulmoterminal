import { computed, ref, type ComputedRef } from "vue";
import { DEFAULT_USAGE_PROBE_INTERVAL_MINUTES, USAGE_GAUGE_DEFAULT, sanitizeUsageProbeIntervalMinutes } from "../../common/usageGauge";
import { createGlobalFlag } from "./globalFlag";
import { postConfigField } from "./postConfigField";

// The 5h / 7d usage gauge's switch and how often its Claude probe may run (#3153), hydrated from
// /api/config. One module for both keys, as with the worklog: whoever asks "how often" has just
// turned it on. The defaults and the range live in common/usageGauge.ts, beside the server's.
const flag = createGlobalFlag("usageGauge", USAGE_GAUGE_DEFAULT);

export const usageGauge = flag.state;
export const setUsageGauge = flag.set;
export const saveUsageGauge = flag.save;

const intervalMinutes = ref(DEFAULT_USAGE_PROBE_INTERVAL_MINUTES);

export const usageProbeIntervalMinutes: ComputedRef<number> = computed(() => intervalMinutes.value);

export const setUsageProbeIntervalMinutes = (value: unknown): void => {
  intervalMinutes.value = sanitizeUsageProbeIntervalMinutes(value);
};

export async function saveUsageProbeIntervalMinutes(minutes: number): Promise<boolean> {
  const r = await postConfigField("usageProbeIntervalMinutes", sanitizeUsageProbeIntervalMinutes(minutes));
  if (r.ok) setUsageProbeIntervalMinutes(r.value);
  return r.ok;
}

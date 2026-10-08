import { computed, ref } from "vue";
import {
  CONFETTI_DEFAULT,
  CONFETTI_MIX_COUNT,
  CONFETTI_STYLES,
  pickConfettiMix,
  sanitizeConfetti,
  type Confetti,
  type ConfettiEvent,
  type ConfettiStyle,
} from "../../common/confetti";
import { postConfigField } from "./postConfigField";

// The `confetti` setting as the browser last read it from /api/config, read with the server's own
// sanitizer so the two cannot disagree about what an odd value means.
const setting = ref<Confetti>(CONFETTI_DEFAULT);
export const confettiSetting = computed(() => setting.value);

export const setConfetti = (value: unknown): void => {
  setting.value = sanitizeConfetti(value);
};

export async function saveConfetti(value: Confetti): Promise<boolean> {
  const saved = await postConfigField("confetti", value);
  if (saved.ok) setConfetti(saved.value);
  return saved.ok;
}

export interface ConfettiRequest {
  id: number;
  styles: readonly ConfettiStyle[];
}

// The overlay watches this; an id rather than a flag so two requests in a row are two events.
const lastRequest = ref<ConfettiRequest | null>(null);
export const confettiRequest = computed(() => lastRequest.value);
let nextId = 0;

/** One celebration now: a mix of styles picked from the configured list. */
export function fireConfetti(random: () => number = Math.random): void {
  lastRequest.value = { id: ++nextId, styles: pickConfettiMix(setting.value.styles, CONFETTI_MIX_COUNT, random) };
}

/** Every style at once, for the one place that wants a show rather than a pick. */
export function fireConfettiFinale(): void {
  lastRequest.value = { id: ++nextId, styles: CONFETTI_STYLES };
}

// Two sources can see one merge (a cell's poll and the roster's), and a turn can end twice in a
// breath; the same event inside this window is one celebration.
const EVENT_COOLDOWN_MS = 8000;
const lastFiredAt = new Map<ConfettiEvent, number>();

/** A celebration for an app event, when the user opted that event in. */
export function fireConfettiForEvent(event: ConfettiEvent, now: number = Date.now()): void {
  if (!setting.value.events.includes(event)) return;
  const previous = lastFiredAt.get(event);
  if (previous !== undefined && now - previous < EVENT_COOLDOWN_MS) return;
  lastFiredAt.set(event, now);
  fireConfetti();
}

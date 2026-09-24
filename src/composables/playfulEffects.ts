import { computed, ref } from "vue";
import { PLAYFUL_EFFECTS_DEFAULT, sanitizePlayfulEffects, type PlayfulEffects } from "../../common/playfulEffects";

// The `playfulEffects` setting as the browser last read it from /api/config. Read with the
// server's own sanitizer, so the two sides cannot disagree about what an odd value means.
const setting = ref<PlayfulEffects>(PLAYFUL_EFFECTS_DEFAULT);

export const playfulEffects = computed(() => setting.value);

export const setPlayfulEffects = (value: unknown): void => {
  setting.value = sanitizePlayfulEffects(value);
};

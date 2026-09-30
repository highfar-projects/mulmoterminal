<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import { bindingFromEvent } from "../../../common/keyRecording";
import { isBareEscape, type KeymapAction } from "../../../common/keymap";
import { setKeymapBinding } from "../../composables/keymapEditing";
import { claimShortcutRecording, releaseShortcutRecording } from "../../composables/shortcutRecording";
import { isImeConfirming } from "../../composables/imeComposition";

// Change or clear one shortcut by pressing the keys (#2619). While recording, the key goes to the
// recorder and nowhere else: the app's own shortcut handlers stand down (shortcutRecording), and this
// listener stops the event before the modal's own Escape or anything else sees it.
const props = defineProps<{ action: KeymapAction; bound: boolean }>();
const { t } = useI18n();
const recording = ref(false);
const saving = ref(false);
const message = ref<{ text: string; problem: boolean } | null>(null);

function stop() {
  recording.value = false;
  releaseShortcutRecording(stop);
  window.removeEventListener("keydown", onKey, true);
}

async function save(binding: string | null) {
  saving.value = true;
  const outcome = await setKeymapBinding(props.action, binding);
  saving.value = false;
  if (outcome.ok) message.value = outcome.warnings.length ? { text: outcome.warnings.join(" "), problem: false } : null;
  else message.value = { text: t("settingsControls.shortcuts.refused", { problems: outcome.problems.join(" ") }), problem: true };
}

function onKey(e: KeyboardEvent) {
  // An IME candidate being confirmed is not a shortcut; let the input method have it.
  if (e.isComposing || isImeConfirming(e)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (isBareEscape(e)) return stop();
  const recorded = bindingFromEvent(e);
  if ("pending" in recorded) return;
  stop();
  if ("unusable" in recorded) {
    message.value = { text: t(`settingsControls.shortcuts.${recorded.unusable}`), problem: true };
    return;
  }
  void save(recorded.binding);
}

function start() {
  message.value = null;
  recording.value = true;
  claimShortcutRecording(stop);
  window.addEventListener("keydown", onKey, true);
}

onBeforeUnmount(stop);

const BUTTON =
  "shrink-0 cursor-pointer rounded border border-border bg-transparent px-1.5 py-0.5 text-[11px] text-muted hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-50";
</script>

<template>
  <button
    type="button"
    :class="[BUTTON, recording ? 'border-accent text-fg' : '']"
    data-testid="shortcut-change"
    :disabled="saving"
    :aria-pressed="recording"
    @click="recording ? stop() : start()"
    @blur="recording && stop()"
  >
    {{ recording ? t("settingsControls.shortcuts.recording") : t("settingsControls.shortcuts.change") }}
  </button>
  <button v-if="bound && !recording" type="button" :class="BUTTON" data-testid="shortcut-clear" :disabled="saving" @click="save(null)">
    {{ t("settingsControls.shortcuts.clear") }}
  </button>
  <p
    v-if="message"
    :role="message.problem ? 'alert' : 'status'"
    class="m-0 basis-full text-[11px]"
    :class="message.problem ? 'text-err-text' : 'text-[var(--warn-text,#e0a030)]'"
    data-testid="shortcut-message"
  >
    {{ message.text }}
  </p>
</template>

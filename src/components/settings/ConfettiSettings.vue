<script setup lang="ts">
// The confetti setting: which styles may fall, and which app events set one off by themselves.
// Each box saves as it is ticked, and goes back when the server refuses.
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { CONFETTI_EVENTS, CONFETTI_STYLES, type Confetti, type ConfettiEvent, type ConfettiStyle } from "../../../common/confetti";
import { confettiSetting, fireConfetti, saveConfetti } from "../../composables/useConfetti";
import { confettiAfterEvent, confettiAfterStyle, confettiStyleLocked } from "./confettiSwitch";

const { t } = useI18n();

// Locked while saving, so an earlier tick's answer cannot land after a later one.
const saving = ref(false);

async function save(next: Confetti, input: HTMLInputElement, stillChecked: () => boolean): Promise<void> {
  saving.value = true;
  await saveConfetti(next);
  saving.value = false;
  input.checked = stillChecked();
}

async function onStyle(event: Event, style: ConfettiStyle): Promise<void> {
  if (!(event.target instanceof HTMLInputElement)) return;
  await save(confettiAfterStyle(confettiSetting.value, style, event.target.checked), event.target, () => confettiSetting.value.styles.includes(style));
}

async function onEvent(event: Event, name: ConfettiEvent): Promise<void> {
  if (!(event.target instanceof HTMLInputElement)) return;
  await save(confettiAfterEvent(confettiSetting.value, name, event.target.checked), event.target, () => confettiSetting.value.events.includes(name));
}
</script>

<template>
  <fieldset class="mt-4 rounded-md border border-border p-3" data-testid="settings-confetti">
    <legend class="px-1 text-[12px] font-semibold">{{ t("settingsControls.confetti.title") }} (<code>confetti</code>)</legend>
    <p class="mb-2 text-[12px] text-dim">{{ t("settingsControls.confetti.hint") }}</p>

    <p class="mb-1 text-[12px] font-semibold">{{ t("settingsControls.confetti.stylesTitle") }}</p>
    <div class="flex flex-wrap gap-x-4 gap-y-1">
      <label v-for="style in CONFETTI_STYLES" :key="style" class="flex cursor-pointer items-center gap-1.5 text-[12px]">
        <input
          type="checkbox"
          class="cursor-pointer"
          :data-testid="`settings-confetti-style-${style}`"
          :checked="confettiSetting.styles.includes(style)"
          :disabled="saving || confettiStyleLocked(confettiSetting, style)"
          @change="(e) => void onStyle(e, style)"
        />
        {{ t(`settingsControls.confetti.styles.${style}`) }}
      </label>
    </div>
    <p class="mt-1 text-[11px] text-dim">{{ t("settingsControls.confetti.stylesHint") }}</p>

    <p class="mb-1 mt-3 text-[12px] font-semibold">{{ t("settingsControls.confetti.eventsTitle") }}</p>
    <div class="flex flex-col gap-1">
      <label v-for="name in CONFETTI_EVENTS" :key="name" class="flex cursor-pointer items-center gap-1.5 text-[12px]">
        <input
          type="checkbox"
          class="cursor-pointer"
          :data-testid="`settings-confetti-event-${name}`"
          :checked="confettiSetting.events.includes(name)"
          :disabled="saving"
          @change="(e) => void onEvent(e, name)"
        />
        {{ t(`settingsControls.confetti.events.${name}`) }}
      </label>
    </div>

    <button
      type="button"
      class="mt-3 cursor-pointer rounded-md border border-border bg-elevated px-3 py-1 text-[12px] hover:bg-hover"
      data-testid="settings-confetti-try"
      @click="fireConfetti()"
    >
      {{ t("settingsControls.confetti.try") }}
    </button>
  </fieldset>
</template>

<script setup lang="ts">
// The recommended keys for this platform (#2581): what applying them would add, and a button that
// adds exactly that. Nothing the user has bound is changed — see common/keymapPresets.ts.
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { activeKeymap, setActiveKeymap } from "../../composables/activeKeymap";
import { postConfigField } from "../../composables/postConfigField";
import { KEYMAP_PRESETS, presetChanges, withPreset, type PresetChange } from "../../../common/keymapPresets";
import type { ReservedPlatform } from "../../../common/keymap";
import { savedKeymap } from "./savedKeymap";
import { keymapLabelKey } from "../keymapLabels";

const props = defineProps<{ platform: ReservedPlatform }>();
const { t } = useI18n();

const changes = computed(() => presetChanges(activeKeymap.value, KEYMAP_PRESETS[props.platform]));
const additions = computed(() => changes.value.filter((change) => change.kind === "add" || change.kind === "add-send"));
const outcome = ref<"saved" | "failed" | "changed" | null>(null);
const saving = ref(false);

function describe(change: PresetChange): string {
  if (change.kind === "add") return t("settings.shortcuts.preset.add", { action: t(keymapLabelKey(change.action)), key: change.binding });
  if (change.kind === "add-send") return t("settings.shortcuts.preset.addSend", { key: change.binding });
  if (change.kind === "kept") return t("settings.shortcuts.preset.kept", { action: t(keymapLabelKey(change.action)), current: change.current });
  return t("settings.shortcuts.preset.taken", { key: change.binding });
}

// The keymap is written WHOLE, so it is built on the one on disk now, not the one this page loaded:
// the keys skill (launched from the button below) or another window may have written it since, and
// building on the old copy would erase what they added. If that changes what the list said, nothing
// is written — the list is redrawn from the current keymap for the reader to look at again.
async function apply(): Promise<void> {
  saving.value = true;
  outcome.value = await applyOnCurrent();
  saving.value = false;
}

async function applyOnCurrent(): Promise<"saved" | "failed" | "changed"> {
  const current = await savedKeymap();
  if (current === null) return "failed";
  const shown = JSON.stringify(changes.value);
  setActiveKeymap(current);
  if (JSON.stringify(changes.value) !== shown) return "changed";
  const saved = await postConfigField("keymap", withPreset(current, changes.value));
  if (saved.ok) setActiveKeymap(saved.value);
  return saved.ok ? "saved" : "failed";
}

const statusText = computed(() => {
  if (outcome.value !== null) return t(`settings.shortcuts.preset.${outcome.value}`);
  return additions.value.length === 0 ? t("settings.shortcuts.preset.nothing") : "";
});
</script>

<template>
  <section data-testid="keymap-preset" class="mt-3 rounded-md border border-border bg-elevated px-3 py-2">
    <p class="text-[12px] text-fg">{{ t(`settings.shortcuts.preset.title.${platform}`) }}</p>
    <ul class="mt-1.5 flex flex-col gap-0.5">
      <li
        v-for="change in changes"
        :key="`${change.kind}:${change.binding}`"
        data-testid="keymap-preset-change"
        :data-kind="change.kind"
        class="text-[11px]"
        :class="change.kind === 'add' || change.kind === 'add-send' ? 'text-fg' : 'text-muted'"
      >
        {{ describe(change) }}
      </li>
    </ul>
    <div class="mt-2 flex items-center gap-2">
      <button
        type="button"
        data-testid="keymap-preset-apply"
        class="h-[26px] cursor-pointer rounded-md border border-border bg-base px-2.5 py-1 text-[12px] text-secondary enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default disabled:opacity-50"
        :disabled="saving || additions.length === 0"
        @click="apply()"
      >
        {{ t("settings.shortcuts.preset.apply") }}
      </button>
      <!-- One live region, always present, so a screen reader hears each change of its text. -->
      <span role="status" data-testid="keymap-preset-status" class="text-[11px]" :class="outcome === 'failed' ? 'text-err' : 'text-dim'">{{ statusText }}</span>
    </div>
  </section>
</template>

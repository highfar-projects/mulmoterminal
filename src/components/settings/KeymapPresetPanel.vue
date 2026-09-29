<script setup lang="ts">
// The recommended keys for this platform (#2581): what applying them would add, and a button that
// adds exactly that. Nothing the user has bound is changed — see common/keymapPresets.ts.
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { activeKeymap, setActiveKeymap } from "../../composables/activeKeymap";
import { postConfigField } from "../../composables/postConfigField";
import { KEYMAP_PRESETS, presetChanges, withPreset, type PresetChange } from "../../../common/keymapPresets";
import type { ReservedPlatform } from "../../../common/keymap";
import { keymapLabelKey } from "../keymapLabels";

const props = defineProps<{ platform: ReservedPlatform }>();
const { t } = useI18n();

const changes = computed(() => presetChanges(activeKeymap.value, KEYMAP_PRESETS[props.platform]));
const additions = computed(() => changes.value.filter((change) => change.kind === "add" || change.kind === "add-send"));
const outcome = ref<"saved" | "failed" | null>(null);
const saving = ref(false);

function describe(change: PresetChange): string {
  if (change.kind === "add") return t("settings.shortcuts.preset.add", { action: t(keymapLabelKey(change.action)), key: change.binding });
  if (change.kind === "add-send") return t("settings.shortcuts.preset.addSend", { key: change.binding });
  if (change.kind === "kept") return t("settings.shortcuts.preset.kept", { action: t(keymapLabelKey(change.action)), current: change.current });
  return t("settings.shortcuts.preset.taken", { key: change.binding });
}

async function apply(): Promise<void> {
  saving.value = true;
  const saved = await postConfigField("keymap", withPreset(activeKeymap.value, changes.value));
  saving.value = false;
  outcome.value = saved.ok ? "saved" : "failed";
  if (saved.ok) setActiveKeymap(saved.value);
}
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
      <span v-if="additions.length === 0" class="text-[11px] text-muted">{{ t("settings.shortcuts.preset.nothing") }}</span>
      <span v-else-if="outcome === 'failed'" role="status" class="text-[11px] text-err">{{ t("settings.shortcuts.preset.failed") }}</span>
      <span v-if="outcome === 'saved'" role="status" class="text-[11px] text-dim">{{ t("settings.shortcuts.preset.saved") }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
// Every grid action by name, with the key it is bound to (#2266) — the way to an action for someone
// who has not written a keymap, and the place to learn which keys they have. The look and the keys
// follow the file finder's (FileFinder.vue), and so does the matching (filePathMatch).
import { computed, onMounted, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { KeymapAction } from "../../common/keymap";
import { activeKeymap } from "../composables/activeKeymap";
import { closeCommandPalette, paletteHost, paletteTerminals } from "../composables/commandPalette";
import { paletteRows, rowKey } from "../composables/commandPaletteRows";
import { SCREEN_OPENERS } from "../composables/paletteScreenOpeners";
import { SCREEN_LABEL_KEYS, visibleScreens } from "../composables/paletteScreens";
import { useGatedEntries } from "../composables/useGatedEntries";
import { openSettingsAt } from "../composables/settingsOpener";
import { fetchVoiceInputStatus } from "../composables/voiceModelStatus";
import { SETTINGS_TABS } from "./settings/settingsTabs";
import { useSettingsTabLabel } from "./settings/useSettingsTabLabel";
import { usePaletteChoices } from "../composables/usePaletteChoices";
import IconGlyph from "./IconGlyph.vue";
import { keymapLabelKey } from "./keymapLabels";

const { t } = useI18n();
const query = ref("");
const active = ref(0);
const input = useTemplateRef<HTMLInputElement>("input");
const listEl = useTemplateRef<HTMLElement>("listEl");
const gated = useGatedEntries();
const settingsTabLabel = useSettingsTabLabel();
const choices = usePaletteChoices();
// Settings hides its Voice section on a machine that cannot transcribe, so the palette does too —
// asked the same way Settings asks, once per opening.
const voiceCapable = ref(false);
onMounted(async () => {
  voiceCapable.value = (await fetchVoiceInputStatus())?.capable ?? false;
});
const settingsTabs = computed(() => SETTINGS_TABS.filter((tab) => tab !== "voice" || voiceCapable.value));

// The description's key is the label's last segment, so a new action cannot have one without the
// other: the label table is a full Record over the actions.
const descriptionKey = (action: KeymapAction): string => `commandPalette.descriptions.${keymapLabelKey(action).split(".").pop() ?? ""}`;

const rows = computed(() =>
  paletteRows(
    query.value,
    activeKeymap.value,
    {
      zoomed: paletteHost.value?.zoomed() ?? false,
      available: paletteHost.value?.available() ?? false,
      manualOrder: paletteHost.value?.manualOrder() ?? false,
    },
    {
      label: (action) => t(keymapLabelKey(action)),
      description: (action) => t(descriptionKey(action)),
      needsEnlarged: t("commandPalette.needsEnlarged"),
      needsNothingEnlarged: t("commandPalette.needsNothingEnlarged"),
      needsManualOrder: t("commandPalette.needsManualOrder"),
      gridHidden: t("commandPalette.gridHidden"),
      screenLabel: (screen) => t(SCREEN_LABEL_KEYS[screen]),
      screenDescription: (screen) => t("commandPalette.openScreen", { name: t(SCREEN_LABEL_KEYS[screen]) }),
      settingsLabel: settingsTabLabel,
      openInSettings: t("commandPalette.openInSettings"),
      currentChoice: t("commandPalette.choices.current"),
      switchChoice: t("commandPalette.choices.switch"),
      scopeLabel: (kind) => t(`commandPalette.scopes.${kind}`),
    },
    { screens: visibleScreens(gated.value), terminals: paletteTerminals.value?.list() ?? [], settings: settingsTabs.value, choices: choices.choices.value },
  ),
);

watch(query, () => {
  active.value = 0;
  if (listEl.value) listEl.value.scrollTop = 0;
});

// The list scrolls, and a row the arrows reach below its edge would be picked by Enter unseen.
watch(active, (index) => {
  listEl.value?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
});

/** Run the row, if it can run now. A disabled row keeps the palette open, with its reason on it. */
function pick(index: number): void {
  const row = rows.value[index];
  if (!row || row.disabledReason !== null) return;
  // A symbol narrows the search rather than running anything: the palette stays open on it.
  if (row.kind === "prefix") {
    query.value = row.symbol;
    input.value?.focus();
    return;
  }
  closeCommandPalette();
  if (row.kind === "screen") SCREEN_OPENERS[row.screen]();
  else if (row.kind === "terminal") paletteTerminals.value?.goTo(row.uid);
  else if (row.kind === "settings") openSettingsAt(row.tab);
  else if (row.kind === "choice") choices.apply(row.id);
  else paletteHost.value?.run(row.action);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.isComposing) return; // an IME candidate list owns Enter and the arrows while composing
  if (e.key === "Escape") {
    e.preventDefault();
    closeCommandPalette();
  } else if (e.key === "Enter") {
    e.preventDefault();
    pick(active.value);
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const count = rows.value.length;
    if (count > 0) active.value = (active.value + (e.key === "ArrowDown" ? 1 : count - 1)) % count;
  }
}

onMounted(() => input.value?.focus());
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[80] font-sans" data-testid="command-palette-backdrop" @click.self="closeCommandPalette">
      <div
        data-testid="command-palette"
        class="absolute left-1/2 top-12 w-[min(600px,calc(100%-24px))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-panel shadow-xl"
        role="dialog"
        :aria-label="t('commandPalette.open')"
        @keydown="onKeydown"
      >
        <div class="flex items-center gap-2 border-b border-border px-3 py-2">
          <span class="material-symbols-outlined flex-none text-[18px] text-dim" aria-hidden="true">keyboard_command_key</span>
          <input
            ref="input"
            v-model="query"
            data-testid="command-palette-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            :aria-activedescendant="rows.length > 0 ? `command-palette-row-${active}` : undefined"
            :placeholder="t('commandPalette.placeholder')"
            class="min-w-0 flex-auto border-0 bg-transparent text-[13px] text-fg outline-none placeholder:text-dim"
          />
          <button
            type="button"
            class="h-[22px] flex-none cursor-pointer rounded border-0 bg-transparent px-1 text-dim hover:text-fg"
            :aria-label="t('commandPalette.close')"
            @click="closeCommandPalette"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
          </button>
        </div>
        <p v-if="rows.length === 0" data-testid="command-palette-empty" class="px-3 py-2 text-[12px] text-muted">{{ t("commandPalette.empty") }}</p>
        <ul v-else id="command-palette-list" ref="listEl" role="listbox" class="max-h-[360px] overflow-auto py-1">
          <li
            v-for="(row, index) in rows"
            :id="`command-palette-row-${index}`"
            :key="rowKey(row)"
            :data-index="index"
            data-testid="command-palette-row"
            :data-action="rowKey(row)"
            role="option"
            :aria-selected="index === active"
            :aria-disabled="row.disabledReason !== null"
            class="flex cursor-pointer items-center gap-3 px-3 py-1.5"
            :class="[index === active ? 'bg-hover' : '', row.disabledReason !== null ? 'cursor-default opacity-50' : '']"
            @pointerenter="active = index"
            @click="pick(index)"
          >
            <IconGlyph
              v-if="row.kind !== 'action'"
              :icon="row.icon"
              material-class="flex-none text-[18px] text-dim"
              github-class="flex-none text-[16px] text-dim"
            />
            <span class="min-w-0 flex-auto">
              <span class="block truncate text-[13px] text-fg">
                <span v-for="(part, at) in row.label" :key="at" :class="part.hit ? 'font-bold text-accent' : ''">{{ part.text }}</span>
              </span>
              <span class="block truncate text-[11px] text-dim">{{ row.disabledReason ?? row.description }}</span>
            </span>
            <code
              v-if="row.kind === 'action' && row.binding"
              class="flex-none rounded border border-border bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg"
              >{{ row.binding }}</code
            >
            <span v-else-if="row.kind === 'action'" class="flex-none text-[11px] text-muted">{{ t("commandPalette.notSet") }}</span>
          </li>
        </ul>
        <p class="border-t border-border px-3 py-1.5 text-[11px] text-muted">{{ t("commandPalette.hint") }}</p>
      </div>
    </div>
  </Teleport>
</template>

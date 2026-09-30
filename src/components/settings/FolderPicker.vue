<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import SettingsButton from "../SettingsButton.vue";
import SettingsField from "../SettingsField.vue";

// Where to put a header button (#2622): one of the folders there, or a new one named here, made where
// the button was. A folder needs at least one button, so this is how a folder comes to exist.
defineProps<{ name: string; folders: { id: string; label: string }[] }>();
const emit = defineEmits<{ (e: "pick", destination: Record<string, string>): void; (e: "cancel"): void }>();

const { t } = useI18n();

const NEW = "";
const choice = ref(NEW);
const label = ref("");
const icon = ref("");

function onChoice(event: Event) {
  if (event.target instanceof HTMLSelectElement) choice.value = event.target.value;
}
function pick() {
  emit("pick", choice.value === NEW ? { folderLabel: label.value, folderIcon: icon.value } : { folderId: choice.value });
}
</script>

<template>
  <div class="mb-1 ml-4 flex flex-wrap items-center gap-2" data-testid="folder-picker">
    <span class="text-[11px] text-dim">{{ t("headerButtons.putInto", { name }) }}</span>
    <select
      class="cursor-pointer rounded-lg border border-border bg-elevated px-2 py-1 text-[12px] text-fg"
      data-testid="folder-picker-choice"
      :value="choice"
      :aria-label="t('headerButtons.folderField')"
      @change="onChoice"
    >
      <option :value="NEW">{{ t("headerButtons.newFolder") }}</option>
      <option v-for="folder in folders" :key="folder.id" :value="folder.id">{{ folder.label }}</option>
    </select>
    <template v-if="choice === NEW">
      <SettingsField
        v-model="label"
        class="min-w-0 shrink grow basis-[20%]"
        data-testid="folder-picker-label"
        :placeholder="t('headerButtons.folderNamePlaceholder')"
        :aria-label="t('headerButtons.folderNameField')"
        spellcheck="false"
        @keydown.enter="pick"
      />
      <SettingsField
        v-model="icon"
        class="min-w-0 shrink grow basis-[15%] font-mono"
        data-testid="folder-picker-icon"
        placeholder="folder"
        :aria-label="t('headerButtons.iconField')"
        spellcheck="false"
        @keydown.enter="pick"
      />
    </template>
    <SettingsButton data-testid="folder-picker-ok" @click="pick">{{ t("headerButtons.putIn") }}</SettingsButton>
    <SettingsButton data-testid="folder-picker-cancel" @click="emit('cancel')">{{ t("headerButtons.cancelEdit") }}</SettingsButton>
  </div>
</template>

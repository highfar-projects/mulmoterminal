<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import SettingsButton from "../SettingsButton.vue";
import SettingsField from "../SettingsField.vue";
import type { FolderFields } from "../../../common/headerButtonFolders";

// A folder's own name, icon and condition (#2622). Its buttons are changed on their own rows.
const props = defineProps<{ fields: FolderFields }>();
const emit = defineEmits<{ (e: "save", fields: FolderFields): void; (e: "cancel"): void }>();

const { t } = useI18n();

const label = ref(props.fields.label);
const icon = ref(props.fields.icon);
const when = ref(props.fields.when);

const save = () => emit("save", { label: label.value, icon: icon.value, when: when.value });
</script>

<template>
  <div class="mb-1 ml-4 flex flex-wrap items-center gap-2" data-testid="folder-fields">
    <SettingsField
      v-model="label"
      class="min-w-0 shrink grow basis-[20%]"
      data-testid="folder-fields-label"
      :aria-label="t('headerButtons.folderNameField')"
      spellcheck="false"
      @keydown.enter="save"
    />
    <SettingsField
      v-model="icon"
      class="min-w-0 shrink grow basis-[15%] font-mono"
      data-testid="folder-fields-icon"
      placeholder="folder"
      :aria-label="t('headerButtons.iconField')"
      spellcheck="false"
      @keydown.enter="save"
    />
    <SettingsField
      v-model="when"
      class="min-w-0 shrink grow basis-[20%] font-mono"
      data-testid="folder-fields-when"
      placeholder="isGitRepo"
      :aria-label="t('headerButtons.whenField')"
      spellcheck="false"
      @keydown.enter="save"
    />
    <SettingsButton data-testid="folder-fields-save" @click="save">{{ t("headerButtons.saveEdit") }}</SettingsButton>
    <SettingsButton data-testid="folder-fields-cancel" @click="emit('cancel')">{{ t("headerButtons.cancelEdit") }}</SettingsButton>
  </div>
</template>

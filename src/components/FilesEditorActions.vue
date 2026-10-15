<script setup lang="ts">
// The Files header's buttons that act on the text in the editor: hand the selection to the terminal
// (#2575) and copy the whole document (#3058). Shown only while the editor is in front.
import { useI18n } from "vue-i18n";
import FilesToolbarButton from "./FilesToolbarButton.vue";
import PreviewCopiedNotice from "./PreviewCopiedNotice.vue";
import type { CmEditor } from "./cmEditor";
import { useFileTextCopy } from "../composables/useFileTextCopy";

const props = defineProps<{
  editor: CmEditor | null;
  /** A terminal sits beside the pane to receive `@path#L…`; the full-screen view has none. */
  canInsert: boolean;
}>();
const emit = defineEmits<{ insert: [] }>();
const { t } = useI18n();
const textCopy = useFileTextCopy(() => props.editor);
</script>

<template>
  <FilesToolbarButton
    v-if="canInsert"
    icon="alternate_email"
    :label="t('tips.panes.insertSelection')"
    test-id="files-insert-selection"
    @click="emit('insert')"
  />
  <FilesToolbarButton v-if="textCopy.available" icon="content_copy" :label="t('tips.panes.copyText')" test-id="files-copy-text" @click="textCopy.copy()" />
  <PreviewCopiedNotice v-if="textCopy.copied.value" :notice="textCopy.copied.value" />
</template>

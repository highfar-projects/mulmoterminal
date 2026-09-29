<script setup lang="ts">
// A code block from the Preview, shown by the app before it is copied (#2615). The Preview is a file
// nobody sanitised, and its markup and styles can make a block look like something it is not; this
// dialog is outside it, and shows exactly the text the Copy button puts on the clipboard.
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { clipboardAvailable } from "./codeBlockCopy";
import { MODAL_FOCUSABLE } from "../utils/focusTrap";
import { modalKeydownHandler } from "../composables/useModalKeyboard";
import type { CodeBlockLookup } from "./previewCodeBlockApi";

const props = defineProps<{ lookup: CodeBlockLookup }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

const COPIED_NOTE_MS = 2500;
const modalEl = ref<HTMLElement | null>(null);
const box = ref<HTMLTextAreaElement>();
const note = ref<"copied" | "manual" | null>(null);
let noteTimer: ReturnType<typeof setTimeout> | undefined;

const block = computed(() => (props.lookup.status === "found" ? props.lookup.block : null));

const onKeydown = modalKeydownHandler({ modalEl, onClose: () => emit("close"), trapSelector: MODAL_FOCUSABLE });
onMounted(async () => {
  document.addEventListener("keydown", onKeydown);
  await nextTick();
  if (box.value) box.value.focus();
  else modalEl.value?.focus();
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  if (noteTimer) clearTimeout(noteTimer);
});

// Without the Clipboard API (plain http from another machine) the text is selected for the user's
// own copy key instead — the same fallback the cell's copy button uses.
async function copy(): Promise<void> {
  if (!block.value) return;
  if (noteTimer) clearTimeout(noteTimer);
  try {
    if (!clipboardAvailable()) throw new Error("no clipboard");
    await navigator.clipboard.writeText(block.value.text);
    note.value = "copied";
    noteTimer = setTimeout(() => (note.value = null), COPIED_NOTE_MS);
  } catch {
    note.value = "manual";
    box.value?.focus();
    box.value?.select();
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.45)] font-sans" @click.self="emit('close')">
      <div
        ref="modalEl"
        data-testid="preview-code-block"
        class="flex max-h-[80vh] w-[min(720px,92vw)] flex-col gap-2 rounded-lg bg-panel p-4 text-fg shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
        role="dialog"
        aria-modal="true"
        :aria-label="t('previewCodeCopy.title')"
        tabindex="-1"
      >
        <div class="flex items-baseline gap-2">
          <span class="text-[13px] font-semibold">{{ t("previewCodeCopy.title") }}</span>
          <span v-if="block?.lang" class="font-mono text-[11px] text-muted">{{ block.lang }}</span>
        </div>
        <p class="text-[12px] text-muted" :role="block ? undefined : 'alert'">
          {{ block ? t("previewCodeCopy.hint") : t(`previewCodeCopy.${lookup.status}`) }}
        </p>
        <textarea
          v-if="block"
          ref="box"
          readonly
          data-testid="preview-code-block-text"
          class="h-[50vh] w-full resize-none rounded border border-border bg-deep p-2 font-mono text-[12px] text-fg"
          :value="block.text"
        />
        <div class="flex items-center justify-end gap-2">
          <span role="status" class="mr-auto text-[12px] text-muted">{{ note ? t(`previewCodeCopy.${note}`) : "" }}</span>
          <button
            v-if="block"
            type="button"
            data-testid="preview-code-block-copy"
            class="rounded border border-border px-3 py-1 text-[12px] hover:bg-hover"
            @click="copy"
          >
            {{ t("previewCodeCopy.copy") }}
          </button>
          <button type="button" class="rounded border border-border px-3 py-1 text-[12px] hover:bg-hover" @click="emit('close')">
            {{ t("previewCodeCopy.close") }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

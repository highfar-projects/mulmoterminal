<script setup lang="ts">
// The answer to the Files tree's "Get SHA-256 hash" (fork-only): the file's name, its hash in a box
// that can be selected, and a Copy button — the hash is usually wanted somewhere else, next to the
// one a download page published.
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { clipboardAvailable } from "./codeBlockCopy";
import { formatSize } from "./folderView";
import { MODAL_FOCUSABLE } from "../utils/focusTrap";
import { modalKeydownHandler } from "../composables/useModalKeyboard";
import type { FileHashState } from "../composables/useFileHash";

defineProps<{ state: FileHashState }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

const COPIED_NOTE_MS = 2500;
const modalEl = ref<HTMLElement | null>(null);
const box = ref<HTMLInputElement>();
const note = ref<"copied" | "manual" | null>(null);
let noteTimer: ReturnType<typeof setTimeout> | undefined;

const onKeydown = modalKeydownHandler({ modalEl, onClose: () => emit("close"), trapSelector: MODAL_FOCUSABLE });
// The menu that opened this is gone, so the keyboard goes back to what had it before the menu: the row.
const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
onMounted(async () => {
  document.addEventListener("keydown", onKeydown);
  await nextTick();
  modalEl.value?.focus();
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  opener?.focus();
  if (noteTimer) clearTimeout(noteTimer);
});

// Without the Clipboard API (plain http from another machine) the hash is selected for the user's own
// copy key instead — the same fallback the code block dialog uses.
async function copy(sha256: string): Promise<void> {
  if (noteTimer) clearTimeout(noteTimer);
  try {
    if (!clipboardAvailable()) throw new Error("no clipboard");
    await navigator.clipboard.writeText(sha256);
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
        data-testid="files-hash-dialog"
        class="flex w-[min(640px,92vw)] flex-col gap-2 rounded-lg bg-panel p-4 text-fg shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
        role="dialog"
        aria-modal="true"
        :aria-label="t('filesHash.title')"
        tabindex="-1"
      >
        <div class="flex min-w-0 items-baseline gap-2">
          <span class="text-[13px] font-semibold">{{ t("filesHash.title") }}</span>
          <span class="min-w-0 truncate font-mono text-[12px] text-secondary" :data-tip="state.name">{{ state.name }}</span>
          <span v-if="state.status === 'done'" class="whitespace-nowrap text-[11px] text-muted">{{ formatSize(state.size) }}</span>
        </div>
        <p v-if="state.status === 'computing'" role="status" data-testid="files-hash-computing" class="text-[12px] text-muted">
          {{ t("filesHash.computing") }}
        </p>
        <p v-else-if="state.status === 'error'" role="alert" data-testid="files-hash-error" class="text-[12px] text-err">
          {{ t("filesHash.failed", { reason: state.message }) }}
        </p>
        <input
          v-else
          ref="box"
          readonly
          data-testid="files-hash-value"
          class="w-full rounded border border-border bg-deep p-2 font-mono text-[12px] text-fg"
          :value="state.sha256"
          @focus="box?.select()"
        />
        <div class="flex items-center justify-end gap-2">
          <span role="status" class="mr-auto text-[12px] text-muted">{{ note ? t(`filesHash.${note}`) : "" }}</span>
          <button
            v-if="state.status === 'done'"
            type="button"
            data-testid="files-hash-copy"
            class="rounded border border-border px-3 py-1 text-[12px] hover:bg-hover"
            @click="copy(state.sha256)"
          >
            {{ t("filesHash.copy") }}
          </button>
          <button type="button" class="rounded border border-border px-3 py-1 text-[12px] hover:bg-hover" @click="emit('close')">
            {{ t("filesHash.close") }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

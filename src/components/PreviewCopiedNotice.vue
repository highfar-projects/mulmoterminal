<script setup lang="ts">
// Says a Preview code block was copied (#3003), with its first line: the press no longer shows the
// block before copying it, so this is where a reader sees what is about to be pasted.
import { useI18n } from "vue-i18n";
import type { CopiedNotice } from "./previewCodeCopy";

defineProps<{ notice: CopiedNotice }>();
const { t } = useI18n();
</script>

<template>
  <Teleport to="body">
    <div
      role="status"
      data-testid="preview-code-copied"
      class="pointer-events-none fixed bottom-6 left-1/2 z-50 flex max-w-[min(560px,92vw)] -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 font-sans text-[12px] text-fg shadow-[0_6px_24px_rgba(0,0,0,0.35)]"
    >
      <span class="material-symbols-outlined text-[16px] text-ok" aria-hidden="true">check</span>
      <span class="whitespace-nowrap">{{ t("previewCodeCopy.copied") }}</span>
      <span class="whitespace-nowrap text-muted">{{ t("previewCodeCopy.lines", { count: notice.lines }) }}</span>
      <code class="min-w-0 truncate font-mono text-[11px] text-secondary">{{ notice.firstLine }}</code>
    </div>
  </Teleport>
</template>

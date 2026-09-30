<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { DirConfigSaveReport } from "../../common/dirConfigSaveReport";

// Under the editor after a directory's .mulmoterminal.json is saved (#2624): whether it took, and if
// not, which keys. A file that is not a JSON object applies nothing, so that comes first.
const props = defineProps<{ report: DirConfigSaveReport }>();
const emit = defineEmits<{ (e: "dismiss"): void }>();
const { t, locale } = useI18n();
// The guide exists in two languages; everyone else reads the English one.
const guideHref = computed(() => `https://receptron.github.io/mulmoterminal/guide/${locale.value === "ja" ? "ja" : "en"}/config.html#per-dir`);

const lines = computed((): { text: string; problem: boolean }[] => {
  const { parsed, ignored, unknown } = props.report;
  if (!parsed) return [{ text: t("dirConfigSave.notJson"), problem: true }];
  const problems = [
    ...(ignored.length ? [{ text: t("dirConfigSave.ignored", { keys: ignored.join(", ") }), problem: true }] : []),
    ...(unknown.length ? [{ text: t("dirConfigSave.unknown", { keys: unknown.join(", ") }), problem: true }] : []),
  ];
  return problems.length ? problems : [{ text: t("dirConfigSave.applied"), problem: false }];
});
const hasProblem = computed(() => lines.value.some((line) => line.problem));
</script>

<template>
  <!-- Over the foot of the editor rather than beside it: the pane is a row, and a block here would
       take a column of its own out of the editor's width. -->
  <div
    class="absolute inset-x-0 bottom-0 z-10 flex items-start gap-2 border-t border-border bg-panel px-4 py-2 font-sans text-[12px]"
    role="status"
    data-testid="dir-config-save-note"
  >
    <div class="min-w-0 flex-auto">
      <p v-for="line in lines" :key="line.text" class="m-0" :class="line.problem ? 'text-[var(--warn-text,#e0a030)]' : 'text-dim'">{{ line.text }}</p>
      <a v-if="hasProblem" class="text-accent underline" :href="guideHref" target="_blank" rel="noopener noreferrer">{{ t("dirConfigSave.guide") }}</a>
    </div>
    <button
      type="button"
      class="flex-none cursor-pointer rounded-md border-0 bg-transparent px-1 text-[14px] text-muted hover:text-fg"
      data-testid="dir-config-save-note-close"
      :aria-label="t('dirConfigSave.close')"
      @click="emit('dismiss')"
    >
      <span class="material-symbols-outlined" aria-hidden="true">close</span>
    </button>
  </div>
</template>

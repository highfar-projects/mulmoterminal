<script setup lang="ts">
// A checklist an agent asked the human to work through (#3022): each item can open its file in the
// Files pane, is marked OK or NG with an optional note, and Send types the results into the terminal
// as the user's next message. A card floating over the enlarged cell rather than a right pane: the
// right pane holds one thing, and opening an item's file there would take the checklist away.
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { CheckAnswer, CheckItem, PaneCheck } from "../../common/paneCommand";

const { t } = useI18n();

const props = defineProps<{ check: PaneCheck }>();
const emit = defineEmits<{ open: [item: CheckItem]; send: [answers: CheckAnswer[]]; close: [] }>();
// Folded to its header so it stops covering the file being looked at.
const folded = ref(false);

interface Draft {
  ok: boolean | null;
  note: string;
}
const drafts = ref<Draft[]>([]);
// A new check starts blank; the same check coming back (a reload) keeps nothing either, since the
// answers were never sent.
watch(
  () => props.check.id,
  () => {
    drafts.value = props.check.items.map(() => ({ ok: null, note: "" }));
    folded.value = false;
  },
  { immediate: true },
);

const answered = computed(() => drafts.value.filter((draft) => draft.ok !== null).length);
const complete = computed(() => drafts.value.length > 0 && answered.value === drafts.value.length);

const mark = (index: number, ok: boolean): void => {
  const draft = drafts.value[index];
  if (draft) draft.ok = draft.ok === ok ? null : ok;
};
const send = (): void => {
  if (complete.value)
    emit(
      "send",
      drafts.value.map((draft) => ({ ok: draft.ok === true, note: draft.note })),
    );
};

const VERDICT = "h-[26px] cursor-pointer rounded-md border px-2.5 py-1 text-[12px]";
const ICON_BUTTON = "cursor-pointer rounded border-0 bg-transparent px-1 py-0.5 text-[15px] leading-none text-dim hover:text-fg";
</script>

<template>
  <section data-testid="check-card" class="flex max-h-full w-[340px] flex-col overflow-hidden rounded-lg border border-border bg-deep shadow-xl">
    <div class="flex items-center justify-between gap-2 bg-panel px-4 py-2 font-sans text-[14px] text-fg">
      <span class="min-w-0 truncate font-semibold">{{ check.title }}</span>
      <div class="flex shrink-0 items-center gap-1">
        <span class="text-[12px] text-dim">{{ answered }} / {{ drafts.length }}</span>
        <button
          type="button"
          data-testid="check-fold-btn"
          :class="ICON_BUTTON"
          :data-tip="folded ? t('tips.panes.check.expand') : t('tips.panes.check.collapse')"
          :aria-label="folded ? t('tips.panes.check.expand') : t('tips.panes.check.collapse')"
          :aria-expanded="!folded"
          @click="folded = !folded"
        >
          <span class="material-symbols-outlined" aria-hidden="true">{{ folded ? "expand_less" : "expand_more" }}</span>
        </button>
        <button
          type="button"
          data-testid="check-close-btn"
          :class="ICON_BUTTON"
          :data-tip="t('tips.panes.check.close')"
          :aria-label="t('tips.panes.check.close')"
          @click="emit('close')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
    </div>

    <div v-show="!folded" class="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-sans text-[13px] text-fg">
      <ol class="flex list-none flex-col gap-3 p-0">
        <li v-for="(item, index) in check.items" :key="index" data-testid="check-item" class="rounded border border-border bg-panel px-3 py-2">
          <div class="flex items-start gap-2">
            <span class="text-dim">{{ index + 1 }}.</span>
            <span class="min-w-0 flex-auto leading-snug">{{ item.label }}</span>
            <button
              v-if="item.target"
              type="button"
              data-testid="check-open"
              :class="ICON_BUTTON"
              :data-tip="t('tips.panes.checkItems.open', { path: item.target.path })"
              :aria-label="t('tips.panes.checkItems.open', { path: item.target.path })"
              @click="emit('open', item)"
            >
              <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
            </button>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <button
              type="button"
              data-testid="check-ok"
              :class="[VERDICT, drafts[index]?.ok === true ? 'border-accent bg-accent-bg text-on-accent' : 'border-border bg-base text-secondary']"
              :aria-pressed="drafts[index]?.ok === true"
              :aria-label="t('tips.panes.checkItems.ok')"
              @click="mark(index, true)"
            >
              OK
            </button>
            <button
              type="button"
              data-testid="check-ng"
              :class="[VERDICT, drafts[index]?.ok === false ? 'border-amber bg-[var(--warn-bg-subtle)] text-warn' : 'border-border bg-base text-secondary']"
              :aria-pressed="drafts[index]?.ok === false"
              :aria-label="t('tips.panes.checkItems.ng')"
              @click="mark(index, false)"
            >
              NG
            </button>
            <input
              v-if="drafts[index]"
              v-model="drafts[index].note"
              type="text"
              data-testid="check-note"
              class="min-w-0 flex-auto rounded border border-border bg-base px-2 py-1 text-[12px] text-fg"
              :aria-label="t('tips.panes.checkItems.note')"
              :placeholder="t('tips.panes.checkItems.note')"
            />
          </div>
        </li>
      </ol>
    </div>

    <div v-show="!folded" class="flex items-center justify-between gap-2 border-t border-border bg-panel px-4 py-2 font-sans text-[12px] text-dim">
      <span>Results go to the agent as your next message.</span>
      <button
        type="button"
        data-testid="check-send"
        class="h-[26px] cursor-pointer rounded-md border border-accent bg-accent-bg px-2.5 py-1 text-[12px] text-on-accent disabled:cursor-default disabled:opacity-50"
        :disabled="!complete"
        :data-tip="t('tips.panes.checkItems.send')"
        @click="send"
      >
        Send
      </button>
    </div>
  </section>
</template>

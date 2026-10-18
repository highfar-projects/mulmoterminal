<script setup lang="ts">
// One row of the Files pane's tree. The pane's click, context-menu and key listeners fall through to
// the button, so the row menu still anchors on the row itself (its `currentTarget`).
import { useI18n } from "vue-i18n";
import type { TreeNode } from "../composables/useFilesTree";
import type { FileGitState } from "../../common/fileGitStatus";
import { GIT_LETTER, type GitDecorations } from "./filesGitDecorations";
import { clippedNameTip } from "./fileTreeWidth";

const props = defineProps<{ node: TreeNode; depth: number; active: boolean; git: GitDecorations }>();

const { t } = useI18n();

// A table rather than a key built from the state, so every key is written out where it is used.
const GIT_TIP: Record<FileGitState, string> = {
  modified: "tips.panes.git.modified",
  added: "tips.panes.git.added",
  untracked: "tips.panes.git.untracked",
  deleted: "tips.panes.git.deleted",
  renamed: "tips.panes.git.renamed",
};
/** A changed row's mark: its letter, its words, and its colour — amber for a change, green for
 *  something new, as VS Code's explorer colours them. */
const gitMark = (node: TreeNode): { letter: string; tip: string; tone: string } | null => {
  const state = props.git.stateOf(node.path);
  if (!state) return null;
  return { letter: GIT_LETTER[state], tip: t(GIT_TIP[state]), tone: state === "modified" ? "text-amber" : "text-ok" };
};

// The name as a tip only when the row cuts it off. Set on the row's own pointerover / focusin, which
// run before the document listeners that read `data-tip`, so the tip sees the width as it is now.
function tipIfClipped(name: string, event: Event): void {
  const row = event.currentTarget;
  if (!(row instanceof HTMLElement)) return;
  const tip = clippedNameTip(row.querySelector<HTMLElement>("[data-row-name]"), name);
  if (tip === null) row.removeAttribute("data-tip");
  else row.setAttribute("data-tip", tip);
}
</script>

<template>
  <button
    type="button"
    data-testid="files-row"
    :data-path="node.path"
    class="flex w-full cursor-pointer items-center gap-1 whitespace-nowrap border-0 px-2 py-[3px] text-left font-mono text-[12px]"
    :class="active ? 'bg-selected text-fg shadow-[inset_2px_0_0_var(--accent)]' : 'bg-transparent text-secondary hover:bg-hover hover:text-fg'"
    :aria-current="active ? 'true' : undefined"
    :style="{ paddingLeft: `${8 + depth * 14}px` }"
    @pointerover="tipIfClipped(node.name, $event)"
    @focusin="tipIfClipped(node.name, $event)"
  >
    <span class="w-3.5 flex-none text-dim">
      <span v-if="node.dir" class="material-symbols-outlined" aria-hidden="true">{{ node.expanded ? "expand_more" : "chevron_right" }}</span>
    </span>
    <span class="material-symbols-outlined flex-none" aria-hidden="true">{{ node.dir ? "folder" : "description" }}</span>
    <span class="truncate" data-row-name :class="gitMark(node)?.tone">{{ node.name }}</span>
    <!-- What git sees, as VS Code's explorer shows it: a letter for a changed file, a dot for a
         folder holding changes, so a collapsed tree still says where to look (#2496). -->
    <span
      v-if="gitMark(node)"
      role="img"
      class="ml-auto flex-none pl-2 text-[11px]"
      :class="gitMark(node)?.tone"
      :data-tip="gitMark(node)?.tip"
      :aria-label="gitMark(node)?.tip"
      >{{ gitMark(node)?.letter }}</span
    >
    <span
      v-else-if="node.dir && git.holdsChanges(node.path)"
      role="img"
      class="ml-auto flex-none pl-2 text-[9px] text-amber"
      :data-tip="t('tips.panes.git.holdsChanges')"
      :aria-label="t('tips.panes.git.holdsChanges')"
      >●</span
    >
  </button>
</template>

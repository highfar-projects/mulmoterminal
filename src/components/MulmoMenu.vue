<script setup lang="ts">
import { ref, computed, watch, useTemplateRef } from "vue";
import { useDropdownMenu } from "../composables/useDropdownMenu";
import { useAppConfig } from "../composables/useAppConfig";
import { canOpenInCanvas, absoluteUnder, type StoriesRoots } from "../composables/canvasOpenFile";
import { isRecord } from "../../common/isRecord";
import { isUnknownArray } from "../../common/isUnknownArray";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

// A header dropdown listing the mulmoScript decks under the open directory, so a deck kept in the
// repository is one click from the Canvas instead of a turn spent asking the agent or a walk down
// the file tree (#1948). Mirrors SkillMenu: fetched up front and on cwd change, and no decks means
// no button — the answers those two already give, which a third menu should not re-invent.
//
// It emits the deck's ABSOLUTE path. Everything about turning that into a card belongs to the
// caller, which asks `buildCanvasCard` — the same question the file tree's row menu asks.
interface DiscoveredDeck {
  path: string;
  label: string;
}
const props = defineProps<{ cwd: string | null }>();
const emit = defineEmits<{ (e: "deck", absolutePath: string): void }>();

// The list is held WITH the directory it was fetched for. A cwd change does not empty it
// instantly — the replacement is a round trip — and `pick` joins against the CURRENT cwd, so a
// list left standing across that gap offers the old project's labels at paths under the new one
// (Codex on #1950). Pairing them makes the stale window unrepresentable rather than short.
const listed = ref<{ cwd: string; decks: DiscoveredDeck[] } | null>(null);
let req = 0; // request token: drop out-of-order responses

const rootRef = useTemplateRef<HTMLElement>("root");
const { open, close, toggle } = useDropdownMenu(rootRef);

const { storiesRoot } = useAppConfig();
const roots = computed<StoriesRoots>(() => ({ workspaces: storiesRoot.value?.paths ?? [], rootId: storiesRoot.value?.id ?? null }));

// Listed is not the same as openable: the plugin serves stories from the roots the server
// REGISTERED, so a cell outside them has decks on disk that nothing here can show. Asked of
// `canOpenInCanvas` rather than answered with a second containment rule — it is the gate the row
// menu is already built on, so the two surfaces cannot disagree about one file.
const openable = computed(() => {
  const dir = props.cwd;
  const held = listed.value;
  if (dir === null || held === null || held.cwd !== dir) return [];
  return held.decks.filter((d) => canOpenInCanvas(absoluteUnder(dir, d.path), roots.value));
});

async function loadDecks() {
  // Close first, for SkillMenu's reason: a cwd change invalidates an open dropdown, which would
  // otherwise reappear already-open on a later cwd.
  close();
  const reqId = ++req;
  const dir = props.cwd;
  // No resolved directory yet: show nothing rather than fetching with an empty cwd, which the
  // server resolves to the DEFAULT workspace — the wrong project's decks.
  if (!dir) {
    listed.value = null;
    return;
  }
  try {
    const res = await fetchWithTimeout(`/api/mulmo/decks?cwd=${encodeURIComponent(dir)}`);
    const data = res.ok ? await jsonBody(res) : {};
    if (reqId !== req) return;
    const decks = isUnknownArray(data.decks)
      ? data.decks.filter((deck): deck is DiscoveredDeck => isRecord(deck) && typeof deck.path === "string" && typeof deck.label === "string")
      : [];
    listed.value = { cwd: dir, decks };
  } catch {
    if (reqId === req) listed.value = null;
  }
}
watch(() => props.cwd, loadDecks, { immediate: true });

function pick(d: DiscoveredDeck) {
  // Joined against the directory the list came from, not against whatever the cell is on now —
  // the same pairing `openable` gates on, so the two cannot disagree about which project a label
  // belongs to.
  const held = listed.value;
  if (held === null || held.cwd !== props.cwd) return;
  emit("deck", absoluteUnder(held.cwd, d.path));
  close();
}
</script>

<template>
  <div v-if="openable.length" ref="root" class="relative inline-flex">
    <button
      class="inline-flex items-center gap-1 border border-border bg-base text-secondary font-sans text-[12px] leading-none py-[5px] px-2.5 rounded-md cursor-pointer hover:bg-hover hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg"
      :aria-expanded="open"
      aria-haspopup="menu"
      data-testid="mulmo-menu-btn"
      title="Show a deck from this directory in the Canvas"
      @click="toggle"
    >
      <span class="material-symbols-outlined" aria-hidden="true">space_dashboard</span> Mulmo
      <span class="material-symbols-outlined" aria-hidden="true">{{ open ? "expand_less" : "expand_more" }}</span>
    </button>
    <div
      v-if="open"
      class="absolute top-[calc(100%+4px)] left-0 z-20 min-w-[180px] max-h-80 overflow-y-auto flex flex-col p-1 bg-panel border border-border rounded-md shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
      role="menu"
    >
      <button
        v-for="d in openable"
        :key="d.path"
        class="inline-flex items-center gap-1 text-left border-0 bg-transparent text-secondary font-mono text-[12px] py-1.5 px-2 rounded cursor-pointer whitespace-nowrap hover:bg-hover hover:text-fg"
        role="menuitem"
        data-testid="mulmo-menu-item"
        :title="d.path"
        @click="pick(d)"
      >
        <span class="material-symbols-outlined" aria-hidden="true">space_dashboard</span> {{ d.label }}
      </button>
    </div>
  </div>
</template>

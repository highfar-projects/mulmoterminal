<script setup lang="ts">
import { ref, computed, watch, useTemplateRef } from "vue";
import AnchoredMenu from "./AnchoredMenu.vue";
import { LIST_MENU_ITEM_CLASS, LIST_MENU_PANEL_CLASS } from "./anchoredMenuClasses";
import { useAppConfig } from "../composables/useAppConfig";
import { canOpenInCanvas, storiesRootsFrom, type StoriesRoots } from "../composables/canvasOpenFile";
import { isRecord } from "../../common/isRecord";
import { isUnknownArray } from "../../common/isUnknownArray";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// A header dropdown listing the mulmoScript decks this directory offers, so a deck is one click
// from the Canvas instead of a turn spent asking the agent or a walk down the file tree (#1948).
// Mirrors SkillMenu: fetched up front and on cwd change, and no decks means no button — the
// answers those two already give, which a third menu should not re-invent.
//
// The server answers ABSOLUTE paths, because its two sources have different roots (the workspace's
// stories directory, and paths declared relative to this directory). Everything about turning one
// into a card belongs to the caller, which asks `buildCanvasCard` — the same question the file
// tree's row menu asks.
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

// Teleported and pulled back inside the viewport, because this row sits at the cell's right edge
// often enough that a menu hanging rightwards from it was cut off by the cell.
const menu = useTemplateRef<InstanceType<typeof AnchoredMenu>>("menu");

const { storiesRoots } = useAppConfig();
const roots = computed<StoriesRoots>(() => storiesRootsFrom(storiesRoots.value));

// Listed is not the same as openable: the plugin serves stories from the roots the server
// REGISTERED, so a cell outside them has decks on disk that nothing here can show. Asked of
// `canOpenInCanvas` rather than answered with a second containment rule — it is the gate the row
// menu is already built on, so the two surfaces cannot disagree about one file.
const openable = computed(() => {
  const dir = props.cwd;
  const held = listed.value;
  if (dir === null || held === null || held.cwd !== dir) return [];
  return held.decks.filter((d) => canOpenInCanvas(d.path, roots.value));
});

async function loadDecks() {
  // Close first, for SkillMenu's reason: a cwd change invalidates an open dropdown, which would
  // otherwise reappear already-open on a later cwd.
  menu.value?.close();
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
  // Still gated on the pairing: the list belongs to the directory it was fetched for, and a click
  // arriving after the cell re-rooted would otherwise open the previous project's deck under the
  // new one's name.
  const held = listed.value;
  if (held === null || held.cwd !== props.cwd) return;
  emit("deck", d.path);
  menu.value?.leave();
}
</script>

<template>
  <AnchoredMenu
    v-if="openable.length"
    ref="menu"
    item-selector='[role="menuitem"]'
    initial-focus="first"
    :panel-class="LIST_MENU_PANEL_CLASS"
    testid="mulmo-menu"
  >
    <template #trigger="{ open, toggle }">
      <button
        class="inline-flex items-center gap-1 border border-border bg-base text-secondary font-sans text-[12px] leading-none py-[5px] px-2.5 rounded-md cursor-pointer hover:bg-hover hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg"
        :aria-expanded="open"
        aria-haspopup="menu"
        data-testid="mulmo-menu-btn"
        :data-tip="t('tips.overlays.showDeck')"
        @click="toggle"
      >
        <span class="material-symbols-outlined" aria-hidden="true">space_dashboard</span> Mulmo
        <span class="material-symbols-outlined" aria-hidden="true">{{ open ? "expand_less" : "expand_more" }}</span>
      </button>
    </template>
    <button v-for="d in openable" :key="d.path" :class="LIST_MENU_ITEM_CLASS" role="menuitem" data-testid="mulmo-menu-item" :data-tip="d.path" @click="pick(d)">
      <span class="material-symbols-outlined flex-none" aria-hidden="true">space_dashboard</span>
      <span class="truncate">{{ d.label }}</span>
    </button>
  </AnchoredMenu>
</template>

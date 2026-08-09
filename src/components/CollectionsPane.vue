<script setup lang="ts">
// The collections of ONE cell's directory, in the cell's right pane beside Canvas / Tools /
// Files. There is no project picker: a Project IS a directory
// (plans/project-architecture.md D2), and the cell already names one — the pane shows that
// cell's, which is why it sits in the selector rather than in a menu of its own.
//
// Navigation is CONTAINED. The pane registers itself as the collection nav surface while it is
// mounted (collectionNavSurface.ts), so opening a collection here moves this pane and not the
// app's route; the full-screen overlay is unaffected and unaware.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { CollectionsIndexView, CollectionView, FeedsView } from "@mulmoclaude/collection-plugin/vue";
import PluginFrame from "./PluginFrame.vue";
import { collectionShadowCss } from "../collectionShadowCss";
import { pushCollectionTeleportTarget, popCollectionTeleportTarget } from "../composables/collectionUi";
import { pushCollectionNavSurface, popCollectionNavSurface, type CollectionNavSurface } from "../composables/collectionNavSurface";
import { activeProjectId, projectIdForCwd } from "../composables/collectionProject";
import type { ShortcutKind } from "../../common/shortcuts";

const props = defineProps<{ cwd: string | null }>();

// ── this pane's own view state (the router's job, done locally) ──
type PaneView = { mode: "index"; kind: ShortcutKind } | { mode: "detail"; kind: ShortcutKind; slug: string };
const view = ref<PaneView>({ mode: "index", kind: "collection" });
const selectedId = ref<string | null>(null);

const surface: CollectionNavSurface = {
  routeSlug: () => (view.value.mode === "detail" ? view.value.slug : undefined),
  routeSelectedId: () => selectedId.value ?? undefined,
  isFeedRoute: () => view.value.kind === "feed",
  setSelectedId: (itemId) => {
    selectedId.value = itemId;
  },
  gotoIndex: (kind) => {
    selectedId.value = null;
    view.value = { mode: "index", kind };
  },
  gotoDetail: (kind, slug) => {
    selectedId.value = null;
    view.value = { mode: "detail", kind, slug };
  },
  // A ref hop from one record to another: same pane, the target collection open with that record
  // selected. `recordId` is optional because a hop may target the collection itself.
  navigateToRecord: (targetSlug, recordId) => {
    view.value = { mode: "detail", kind: "collection", slug: targetSlug };
    selectedId.value = recordId ?? null;
  },
};

// ── the project this pane is scoped to ──
// null while resolving, and null-after-resolving when the cell's directory is not one the server
// knows. Those are different states to the user, so they are different values here.
const resolving = ref(true);
const projectId = ref<string | null>(null);

watch(
  () => props.cwd,
  async (cwd) => {
    resolving.value = true;
    projectId.value = await projectIdForCwd(cwd);
    resolving.value = false;
    // Re-scope, and reset the view: a slug open in one directory need not exist in the next.
    activeProjectId.value = projectId.value;
    surface.gotoIndex("collection");
  },
  { immediate: true },
);

const unknownDirectory = computed(() => !resolving.value && projectId.value === null);

// The pane owns the global project scope while it is mounted, because one right pane is open at
// a time and the plugin binding is a module singleton (collectionProject.ts says why).
pushCollectionNavSurface(surface);
onBeforeUnmount(() => {
  popCollectionNavSurface(surface);
  activeProjectId.value = null;
});

// Register this pane's shadow root as the record-modal teleport target — same getRootNode()
// trick as CollectionsBrowseOverlay, which is where the comment explaining it lives.
const probe = ref<HTMLElement>();
let registered: HTMLElement | ShadowRoot | null = null;
function unregister(): void {
  if (registered) {
    popCollectionTeleportTarget(registered);
    registered = null;
  }
}
watch(probe, (el) => {
  unregister();
  const root = el?.getRootNode();
  if (root instanceof ShadowRoot) {
    registered = root;
    pushCollectionTeleportTarget(root);
  }
});
onBeforeUnmount(unregister);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-panel" role="region" aria-label="Collections">
    <div v-if="resolving" class="p-3 font-sans text-[12px] text-dim">Loading collections…</div>
    <!-- Not an error, and deliberately not the workspace's collections under this cell's name:
         a directory the server does not know has no collections of its own to show. -->
    <div v-else-if="unknownDirectory" class="p-3 font-sans text-[12px] text-dim">
      This directory has no collections yet. Collections live in <code>.claude/skills</code> under the folder the cell is open in.
    </div>
    <div v-else class="min-h-0 flex-1">
      <PluginFrame :css="collectionShadowCss" height="100%">
        <div ref="probe" style="height: 100%">
          <FeedsView v-if="view.mode === 'index' && view.kind === 'feed'" />
          <CollectionsIndexView v-else-if="view.mode === 'index'" />
          <CollectionView v-else />
        </div>
      </PluginFrame>
    </div>
  </div>
</template>

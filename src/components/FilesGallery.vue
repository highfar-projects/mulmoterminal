<script setup lang="ts">
// A folder's pictures, videos, sounds and PDFs at once (#3079), over the pane's file area. A tile
// plays in place; clicking one shows it large, with ← and → through the folder and Esc back.
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import FilesMediaView from "./FilesMediaView.vue";
import { GALLERY_PAGE_SIZE, steppedIndex, type GalleryItem } from "./filesGallery";
import { rawFileSrc } from "./filesPreviewSrc";

const props = defineProps<{ cwd: string | null; dir: string; items: GalleryItem[] | null; error: string | null }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

const shown = ref(GALLERY_PAGE_SIZE);
const enlarged = ref<number | null>(null);
const root = useTemplateRef<HTMLElement>("root");
const visible = computed(() => (props.items ?? []).slice(0, shown.value));
const more = computed(() => Math.max(0, (props.items?.length ?? 0) - shown.value));
const current = computed(() => (enlarged.value === null ? null : (props.items?.[enlarged.value] ?? null)));
const srcOf = (item: GalleryItem): string => rawFileSrc(props.cwd, item.pathRel);
const title = computed(() => props.dir.split("/").pop() || props.dir);

// The keyboard comes here as it opens: the menu item it was opened from is gone, and Esc and the
// arrows are this view's own.
onMounted(() => root.value?.focus());
watch(
  () => props.dir,
  () => {
    shown.value = GALLERY_PAGE_SIZE;
    enlarged.value = null;
    root.value?.focus();
  },
);

// Media events do not bubble, but they are seen on the way down: one sound at a time, whichever
// tile it comes from.
function onlyThisPlays(event: Event): void {
  root.value?.querySelectorAll("video, audio").forEach((media) => {
    if (media !== event.target && media instanceof HTMLMediaElement) media.pause();
  });
}

// Both ways in and out of the large view take the keyboard back to the gallery: the button that was
// pressed is gone once the view changes, and the arrows and Esc are read here.
async function show(index: number | null): Promise<void> {
  enlarged.value = index;
  await nextTick();
  root.value?.focus();
}

function step(by: 1 | -1): void {
  if (enlarged.value !== null) enlarged.value = steppedIndex(enlarged.value, by, props.items?.length ?? 0);
}

const STEP_KEYS: Record<string, 1 | -1> = { ArrowLeft: -1, ArrowRight: 1 };

function onKey(event: KeyboardEvent): void {
  const by = STEP_KEYS[event.key];
  if (event.key === "Escape") {
    event.preventDefault();
    if (enlarged.value === null) emit("close");
    else void show(null);
  } else if (by !== undefined && enlarged.value !== null) {
    event.preventDefault();
    step(by);
  }
}

const BUTTON =
  "inline-flex h-[26px] flex-none cursor-pointer items-center gap-1 rounded-md border border-border bg-base px-2 text-[12px] text-secondary hover:bg-hover hover:text-fg";
</script>

<template>
  <div
    ref="root"
    tabindex="-1"
    data-testid="files-gallery"
    class="absolute inset-0 z-20 flex min-h-0 flex-col bg-deep outline-none"
    @keydown="onKey"
    @play.capture="onlyThisPlays"
  >
    <header class="flex flex-none items-center gap-2 border-b border-border px-3 py-1.5">
      <span class="material-symbols-outlined text-[16px] text-muted" aria-hidden="true">photo_library</span>
      <span class="min-w-0 flex-auto truncate font-mono text-[12px] text-secondary" :data-tip="dir">{{ title }}</span>
      <template v-if="current && enlarged !== null">
        <span class="flex-none whitespace-nowrap text-[11px] text-muted">{{ enlarged + 1 }} / {{ items?.length }}</span>
        <button
          type="button"
          :class="BUTTON"
          :aria-label="t('filesGallery.previous')"
          :data-tip="t('filesGallery.previous')"
          data-testid="files-gallery-prev"
          @click="step(-1)"
        >
          <span class="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_left</span>
        </button>
        <button
          type="button"
          :class="BUTTON"
          :aria-label="t('filesGallery.next')"
          :data-tip="t('filesGallery.next')"
          data-testid="files-gallery-next"
          @click="step(1)"
        >
          <span class="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_right</span>
        </button>
        <button
          type="button"
          :class="BUTTON"
          :aria-label="t('filesGallery.back')"
          :data-tip="t('filesGallery.back')"
          data-testid="files-gallery-back"
          @click="show(null)"
        >
          <span class="material-symbols-outlined text-[16px]" aria-hidden="true">grid_view</span>
        </button>
      </template>
      <button
        type="button"
        :class="BUTTON"
        :aria-label="t('filesGallery.close')"
        :data-tip="t('filesGallery.close')"
        data-testid="files-gallery-close"
        @click="emit('close')"
      >
        <span class="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
      </button>
    </header>
    <p v-if="error" role="alert" class="p-4 text-[13px] text-err">{{ error }}</p>
    <p v-else-if="items === null" class="m-auto p-4 text-[13px] text-muted">{{ t("filesGallery.loading") }}</p>
    <p v-else-if="items.length === 0" class="m-auto p-4 text-[13px] text-muted" data-testid="files-gallery-empty">{{ t("filesGallery.empty") }}</p>
    <div v-else-if="current" class="flex min-h-0 flex-auto flex-col items-center justify-center gap-2 overflow-auto p-3" data-testid="files-gallery-large">
      <FilesMediaView :key="current.pathRel" :kind="current.kind" :src="srcOf(current)" :name="current.name" />
      <!-- Under the file rather than in the header: a pane beside a cell is narrow, and the buttons take the header. -->
      <p class="m-0 max-w-full truncate font-mono text-[12px] text-secondary" data-testid="files-gallery-name">{{ current.name }}</p>
    </div>
    <div v-else class="min-h-0 flex-auto overflow-auto p-3">
      <ul class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 p-0" data-testid="files-gallery-grid">
        <li
          v-for="(item, index) in visible"
          :key="item.pathRel"
          class="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-base p-1.5"
          data-testid="files-gallery-tile"
        >
          <button v-if="item.kind === 'image'" type="button" class="cursor-pointer border-0 bg-transparent p-0" :aria-label="item.name" @click="show(index)">
            <img :src="srcOf(item)" alt="" loading="lazy" draggable="false" class="aspect-square w-full rounded object-contain" />
          </button>
          <video v-else-if="item.kind === 'video'" :src="srcOf(item)" controls preload="metadata" class="aspect-video w-full rounded bg-black" />
          <audio v-else-if="item.kind === 'audio'" :src="srcOf(item)" controls preload="none" class="w-full" />
          <button
            v-else
            type="button"
            class="flex aspect-square w-full cursor-pointer items-center justify-center rounded border-0 bg-transparent"
            :aria-label="item.name"
            @click="show(index)"
          >
            <span class="material-symbols-outlined text-[48px] text-muted" aria-hidden="true">picture_as_pdf</span>
          </button>
          <button
            type="button"
            class="flex min-w-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left text-[11px] text-secondary hover:text-fg"
            :data-tip="item.name"
            @click="show(index)"
          >
            <span class="min-w-0 flex-auto truncate font-mono">{{ item.name }}</span>
            <span class="material-symbols-outlined text-[14px]" aria-hidden="true">open_in_full</span>
          </button>
        </li>
      </ul>
      <button v-if="more > 0" type="button" :class="[BUTTON, 'mx-auto mt-3 flex']" data-testid="files-gallery-more" @click="shown += GALLERY_PAGE_SIZE">
        {{ t("filesGallery.showMore", { count: more }) }}
      </button>
    </div>
  </div>
</template>

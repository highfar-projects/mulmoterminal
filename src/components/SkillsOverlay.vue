<script setup lang="ts">
// Every skill on disk, by where it lives (#2815): the user's `~/.claude/skills`, the enabled plugins,
// then the `.claude/skills` of each folder a terminal has run in. Three columns — where, which skill,
// its SKILL.md — because one plugin alone can bring a thousand skills, which no single list survives.
// The search narrows the first two columns together. Read-only.
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import MarkdownProse from "./MarkdownProse.vue";
import FullScreenOverlay from "./FullScreenOverlay.vue";
import { useSkillsView } from "../composables/useSkillsView";
import { useEscapeToClose } from "../composables/useEscapeToClose";
import { loadSkillCatalog, loadSkillDoc } from "../composables/useSkillCatalog";
import { filterSkillCatalog, type CatalogSkill, type SkillCatalog, type SkillSource } from "../../common/skillCatalog";
import { stripFrontmatter } from "../wikiMarkdown";

const { t } = useI18n();
const { isOpen, close } = useSkillsView();
useEscapeToClose(isOpen, close);

const catalog = shallowRef<SkillCatalog | null>(null);
const loadFailed = ref(false);
const query = ref("");
const chosenSourceKey = ref<string | null>(null);
const picked = shallowRef<{ source: SkillSource; skill: CatalogSkill } | null>(null);
const doc = ref<string | null>(null);
const docFailed = ref(false);

const sourceKey = (source: SkillSource): string => `${source.scope}:${source.plugin}:${source.dir}`;
const shownSources = computed(() => (catalog.value ? filterSkillCatalog(catalog.value, query.value).sources : []));
// The chosen place while the search still matches something in it, else the first one that does —
// so typing a query never leaves the middle column showing a place with nothing in it.
const currentSource = computed(() => shownSources.value.find((source) => sourceKey(source) === chosenSourceKey.value) ?? shownSources.value[0] ?? null);
const isCurrent = (source: SkillSource): boolean => !!currentSource.value && sourceKey(currentSource.value) === sourceKey(source);
const isPicked = (source: SkillSource, skill: CatalogSkill): boolean =>
  !!picked.value && sourceKey(picked.value.source) === sourceKey(source) && picked.value.skill.id === skill.id;

const SOURCE_ICONS: Record<SkillSource["scope"], string> = { user: "home", plugin: "extension", project: "folder" };
function sourceLabel(source: SkillSource): string {
  if (source.scope === "user") return t("skillsView.user");
  return source.scope === "plugin" ? source.plugin : source.dir;
}

async function refresh(): Promise<void> {
  catalog.value = null;
  loadFailed.value = false;
  const read = await loadSkillCatalog();
  catalog.value = read;
  loadFailed.value = read === null;
}

watch(
  isOpen,
  (open) => {
    picked.value = null;
    doc.value = null;
    if (open) void refresh();
  },
  { immediate: true },
);

async function pick(source: SkillSource, skill: CatalogSkill): Promise<void> {
  picked.value = { source, skill };
  doc.value = null;
  docFailed.value = false;
  const markdown = await loadSkillDoc(source, skill.slug);
  if (!isPicked(source, skill)) return; // moved on while the request was in flight
  doc.value = markdown === null ? null : stripFrontmatter(markdown);
  docFailed.value = markdown === null;
}
</script>

<template>
  <FullScreenOverlay v-if="isOpen" :region-label="t('skillsView.region')" :close-label="t('skillsView.close')" @close="close">
    <template #header>
      <span class="font-sans text-[14px] font-[650] text-fg">{{ t("skillsView.title") }}</span>
      <input
        v-model="query"
        type="search"
        data-testid="skills-search"
        :placeholder="t('skillsView.search')"
        :aria-label="t('skillsView.search')"
        class="w-[320px] max-w-[50vw] rounded-[4px] border border-border bg-base px-2 py-1 font-sans text-[12px] text-fg"
      />
    </template>

    <p v-if="loadFailed" class="m-0 p-4 font-sans text-[13px] text-err-text">{{ t("skillsView.loadFailed") }}</p>
    <p v-else-if="!catalog" class="m-0 p-4 font-sans text-[13px] text-dim">{{ t("skillsView.loading") }}</p>
    <p v-else-if="!catalog.sources.length" class="m-0 p-4 font-sans text-[13px] text-dim">{{ t("skillsView.empty") }}</p>
    <p v-else-if="!shownSources.length" class="m-0 p-4 font-sans text-[13px] text-dim">{{ t("skillsView.noMatch") }}</p>

    <div v-else class="flex min-h-0 flex-1">
      <nav class="w-[260px] flex-none overflow-y-auto border-r border-border bg-panel p-1" :aria-label="t('skillsView.sources')">
        <button
          v-for="source in shownSources"
          :key="sourceKey(source)"
          type="button"
          data-testid="skills-source"
          class="flex w-full cursor-pointer items-center gap-1.5 rounded-[4px] border-none px-2 py-1.5 text-left font-sans text-[12px] hover:bg-hover hover:text-fg"
          :class="isCurrent(source) ? 'bg-hover text-fg' : 'bg-transparent text-secondary'"
          :aria-current="isCurrent(source) ? 'true' : undefined"
          @click="chosenSourceKey = sourceKey(source)"
        >
          <span class="material-symbols-outlined flex-none text-[14px] text-dim" aria-hidden="true">{{ SOURCE_ICONS[source.scope] }}</span>
          <span class="min-w-0 flex-1 truncate" :data-tip="source.dir">{{ sourceLabel(source) }}</span>
          <span class="flex-none text-[11px] text-dim">{{ source.skills.length }}</span>
        </button>
      </nav>

      <nav v-if="currentSource" class="w-[340px] flex-none overflow-y-auto border-r border-border p-1" :aria-label="t('skillsView.title')">
        <button
          v-for="skill in currentSource.skills"
          :key="skill.id"
          type="button"
          data-testid="skills-item"
          class="block w-full cursor-pointer rounded-[4px] border-none px-2 py-1.5 text-left hover:bg-hover"
          :class="isPicked(currentSource, skill) ? 'bg-hover' : 'bg-transparent'"
          @click="pick(currentSource, skill)"
        >
          <span class="flex items-baseline gap-2">
            <span class="truncate font-mono text-[12px] text-fg">{{ skill.id }}</span>
            <span v-if="skill.overridesUser" data-testid="skills-overrides" class="flex-none font-sans text-[10px] text-warn">{{
              t("skillsView.overrides")
            }}</span>
          </span>
          <span class="line-clamp-2 font-sans text-[11px] leading-snug text-secondary">{{ skill.description }}</span>
        </button>
      </nav>

      <section class="min-w-0 flex-1 overflow-y-auto p-4">
        <p v-if="!picked" class="m-0 font-sans text-[13px] text-dim">{{ t("skillsView.pick") }}</p>
        <template v-else>
          <p class="m-0 mb-1 font-mono text-[14px] font-[650] text-fg">{{ picked.skill.id }}</p>
          <p class="m-0 mb-3 font-mono text-[11px] text-dim">{{ picked.source.dir }}</p>
          <p v-if="docFailed" data-testid="skills-doc-error" class="m-0 font-sans text-[13px] text-err-text">{{ t("skillsView.docFailed") }}</p>
          <div v-else-if="doc !== null" class="max-w-[90ch] font-sans text-[13px] text-fg"><MarkdownProse :markdown="doc" /></div>
        </template>
      </section>
    </div>
  </FullScreenOverlay>
</template>

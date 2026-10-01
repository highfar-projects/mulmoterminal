<script setup lang="ts">
// Every skill on disk, by where it lives (#2815): the user's `~/.claude/skills`, then the
// `.claude/skills` of each folder a terminal has run in. Read-only; picking one shows its SKILL.md.
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import MarkdownProse from "./MarkdownProse.vue";
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
const picked = shallowRef<{ source: SkillSource; skill: CatalogSkill } | null>(null);
const doc = ref<string | null>(null);
const docFailed = ref(false);

const shown = computed(() => (catalog.value ? filterSkillCatalog(catalog.value, query.value) : null));
const sourceKey = (source: SkillSource): string => `${source.scope}:${source.dir}`;
const isPicked = (source: SkillSource, skill: CatalogSkill): boolean =>
  !!picked.value && sourceKey(picked.value.source) === sourceKey(source) && picked.value.skill.slug === skill.slug;

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
  <div v-if="isOpen" class="fixed inset-x-0 top-10 bottom-0 z-50 flex flex-col bg-deep" role="region" :aria-label="t('skillsView.region')">
    <header class="flex flex-none items-center gap-2.5 border-b border-border bg-panel px-4 py-2">
      <span class="font-sans text-[14px] font-[650] text-fg">{{ t("skillsView.title") }}</span>
      <input
        v-model="query"
        type="search"
        data-testid="skills-search"
        :placeholder="t('skillsView.search')"
        :aria-label="t('skillsView.search')"
        class="w-[320px] max-w-[50vw] rounded-[4px] border border-border bg-base px-2 py-1 font-sans text-[12px] text-fg"
      />
      <span class="flex-1"></span>
      <button
        type="button"
        class="h-6 w-[26px] cursor-pointer rounded-md border border-border bg-base text-[14px] text-secondary hover:bg-hover hover:text-fg"
        :data-tip="t('tips.overlays.close')"
        :aria-label="t('skillsView.close')"
        @click="close"
      >
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </header>

    <div class="flex min-h-0 flex-1">
      <nav class="w-[380px] flex-none overflow-y-auto border-r border-border bg-panel p-1" :aria-label="t('skillsView.title')">
        <p v-if="loadFailed" class="m-0 px-2 py-2 font-sans text-[12px] text-err-text">{{ t("skillsView.loadFailed") }}</p>
        <p v-else-if="!shown" class="m-0 px-2 py-2 font-sans text-[12px] text-dim">{{ t("skillsView.loading") }}</p>
        <p v-else-if="!catalog?.sources.length" class="m-0 px-2 py-2 font-sans text-[12px] text-dim">{{ t("skillsView.empty") }}</p>
        <p v-else-if="!shown.sources.length" class="m-0 px-2 py-2 font-sans text-[12px] text-dim">{{ t("skillsView.noMatch") }}</p>
        <section v-for="source in shown?.sources ?? []" :key="sourceKey(source)" data-testid="skills-source" class="mb-2">
          <h3 class="m-0 flex items-baseline gap-1.5 px-2 pt-2 pb-1 font-sans text-[11px] font-semibold text-dim">
            <span class="material-symbols-outlined text-[14px]" aria-hidden="true">{{ source.scope === "user" ? "home" : "folder" }}</span>
            <span class="min-w-0 truncate" :data-tip="source.dir">{{ source.scope === "user" ? t("skillsView.user") : source.dir }}</span>
            <span class="flex-none font-normal">{{ source.skills.length }}</span>
          </h3>
          <button
            v-for="skill in source.skills"
            :key="skill.slug"
            type="button"
            data-testid="skills-item"
            class="block w-full cursor-pointer rounded-[4px] border-none px-2 py-1.5 text-left hover:bg-hover"
            :class="isPicked(source, skill) ? 'bg-hover' : 'bg-transparent'"
            @click="pick(source, skill)"
          >
            <span class="flex items-baseline gap-2">
              <span class="truncate font-mono text-[12px] text-fg">{{ skill.slug }}</span>
              <span v-if="skill.overridesUser" data-testid="skills-overrides" class="flex-none font-sans text-[10px] text-warn">{{
                t("skillsView.overrides")
              }}</span>
            </span>
            <span class="line-clamp-2 font-sans text-[11px] leading-snug text-secondary">{{ skill.description }}</span>
          </button>
        </section>
      </nav>

      <section class="min-w-0 flex-1 overflow-y-auto p-4">
        <p v-if="!picked" class="m-0 font-sans text-[13px] text-dim">{{ t("skillsView.pick") }}</p>
        <template v-else>
          <p class="m-0 mb-1 font-mono text-[14px] font-[650] text-fg">{{ picked.skill.slug }}</p>
          <p class="m-0 mb-3 font-mono text-[11px] text-dim">{{ picked.source.dir }}</p>
          <p v-if="docFailed" data-testid="skills-doc-error" class="m-0 font-sans text-[13px] text-err-text">{{ t("skillsView.docFailed") }}</p>
          <div v-else-if="doc !== null" class="max-w-[90ch] font-sans text-[13px] text-fg"><MarkdownProse :markdown="doc" /></div>
        </template>
      </section>
    </div>
  </div>
</template>

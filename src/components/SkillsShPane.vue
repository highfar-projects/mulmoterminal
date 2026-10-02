<script setup lang="ts">
// The Skills viewer's skills.sh mode (#2835): search the public directory, read a skill before
// installing it. It never installs — the install line is there to copy and run yourself, because a
// skill is instructions the agent follows with your permissions. Nothing is sent until Search.
import { computed, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import MarkdownProse from "./MarkdownProse.vue";
import { loadRemoteSkill, searchRemoteSkills } from "../composables/useSkillsShSearch";
import { installCommand, isExecutableFile, isInstalledLocally, skillsShPageUrl, type RemoteSkill, type RemoteSkillDoc } from "../../common/skillsSh";
import { stripFrontmatter } from "../wikiMarkdown";

const props = defineProps<{ localSlugs: ReadonlySet<string> }>();

const { t } = useI18n();
const query = ref("");
const searching = ref(false);
const results = shallowRef<RemoteSkill[] | null>(null);
const searchFailed = ref(false);
const picked = shallowRef<RemoteSkill | null>(null);
const doc = shallowRef<RemoteSkillDoc | null>(null);
const docFailed = ref(false);
const copied = ref(false);

const skillKey = (skill: RemoteSkill): string => `${skill.source}/${skill.skillId}`;
const isPicked = (skill: RemoteSkill): boolean => !!picked.value && skillKey(picked.value) === skillKey(skill);
const installed = (skill: RemoteSkill): boolean => isInstalledLocally(skill, props.localSlugs);
const executables = computed(() => (doc.value ? doc.value.files.filter((file) => isExecutableFile(file.path)) : []));
const body = computed(() => (doc.value ? stripFrontmatter(doc.value.markdown) : ""));

async function search(): Promise<void> {
  const text = query.value.trim();
  if (text === "" || searching.value) return;
  searching.value = true;
  picked.value = null;
  doc.value = null;
  const found = await searchRemoteSkills(text);
  searching.value = false;
  results.value = found;
  searchFailed.value = found === null;
}

async function pick(skill: RemoteSkill): Promise<void> {
  picked.value = skill;
  doc.value = null;
  docFailed.value = false;
  copied.value = false;
  const read = await loadRemoteSkill(skill);
  if (!isPicked(skill)) return; // moved on while the request was in flight
  doc.value = read;
  docFailed.value = read === null;
}

async function copyInstall(skill: RemoteSkill): Promise<void> {
  try {
    await navigator.clipboard.writeText(installCommand(skill));
    copied.value = true;
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <form class="flex flex-none items-center gap-2 border-b border-border px-4 py-2" @submit.prevent="search">
      <input
        v-model="query"
        type="search"
        data-testid="skills-sh-query"
        :placeholder="t('skillsView.remote.placeholder')"
        :aria-label="t('skillsView.remote.placeholder')"
        class="w-[320px] max-w-[50vw] rounded-[4px] border border-border bg-base px-2 py-1 font-sans text-[12px] text-fg"
      />
      <button
        type="submit"
        data-testid="skills-sh-search"
        :disabled="searching || query.trim() === ''"
        class="cursor-pointer rounded-[4px] border border-border bg-panel px-3 py-1 font-sans text-[12px] text-fg hover:bg-hover disabled:cursor-default disabled:opacity-50"
      >
        {{ t("skillsView.remote.search") }}
      </button>
      <span class="font-sans text-[11px] text-dim">{{ t("skillsView.remote.privacy") }}</span>
    </form>

    <p v-if="searching" class="m-0 p-4 font-sans text-[13px] text-dim">{{ t("skillsView.loading") }}</p>
    <p v-else-if="searchFailed" data-testid="skills-sh-error" class="m-0 p-4 font-sans text-[13px] text-err-text">
      {{ t("skillsView.remote.searchFailed") }}
      <a class="text-accent underline" href="https://skills.sh" target="_blank" rel="noopener noreferrer">skills.sh</a>
    </p>
    <p v-else-if="results === null" class="m-0 p-4 font-sans text-[13px] text-dim">{{ t("skillsView.remote.intro") }}</p>
    <p v-else-if="!results.length" class="m-0 p-4 font-sans text-[13px] text-dim">{{ t("skillsView.noMatch") }}</p>

    <div v-else class="flex min-h-0 flex-1">
      <nav class="w-[340px] flex-none overflow-y-auto border-r border-border p-1" :aria-label="t('skillsView.remote.results')">
        <button
          v-for="skill in results"
          :key="skillKey(skill)"
          type="button"
          data-testid="skills-sh-item"
          class="block w-full cursor-pointer rounded-[4px] border-none px-2 py-1.5 text-left hover:bg-hover"
          :class="isPicked(skill) ? 'bg-hover' : 'bg-transparent'"
          @click="pick(skill)"
        >
          <span class="flex items-baseline gap-2">
            <span class="truncate font-mono text-[12px] text-fg">{{ skill.name }}</span>
            <span v-if="installed(skill)" data-testid="skills-sh-installed" class="flex-none font-sans text-[10px] text-ok">{{
              t("skillsView.remote.installed")
            }}</span>
          </span>
          <span class="flex gap-2 font-sans text-[11px] text-secondary">
            <span class="truncate">{{ skill.source }}</span>
            <span class="flex-none text-dim">{{ t("skillsView.remote.installs", { count: skill.installs }) }}</span>
          </span>
        </button>
      </nav>

      <section class="min-w-0 flex-1 overflow-y-auto p-4">
        <p v-if="!picked" class="m-0 font-sans text-[13px] text-dim">{{ t("skillsView.pick") }}</p>
        <template v-else>
          <p class="m-0 mb-1 font-mono text-[14px] font-[650] text-fg">{{ picked.name }}</p>
          <p class="m-0 mb-3 font-mono text-[11px] text-dim">{{ picked.source }}</p>
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <code class="rounded-[4px] bg-panel px-2 py-1 font-mono text-[11px] text-fg">{{ installCommand(picked) }}</code>
            <button
              type="button"
              data-testid="skills-sh-copy"
              class="flex cursor-pointer items-center gap-1 rounded-[4px] border border-border bg-transparent px-2 py-1 font-sans text-[11px] text-fg hover:bg-hover"
              @click="copyInstall(picked)"
            >
              <span class="material-symbols-outlined text-[14px]" aria-hidden="true">content_copy</span>
              {{ copied ? t("skillsView.remote.copied") : t("skillsView.remote.copy") }}
            </button>
            <a
              class="flex items-center gap-1 font-sans text-[11px] text-accent underline"
              :href="skillsShPageUrl(picked)"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span class="material-symbols-outlined text-[14px]" aria-hidden="true">open_in_new</span>
              {{ t("skillsView.remote.openPage") }}
            </a>
          </div>
          <p class="m-0 mb-3 font-sans text-[11px] text-dim">{{ t("skillsView.remote.installNote") }}</p>
          <p v-if="docFailed" data-testid="skills-doc-error" class="m-0 font-sans text-[13px] text-err-text">{{ t("skillsView.docFailed") }}</p>
          <template v-else-if="doc">
            <div v-if="executables.length" data-testid="skills-sh-executables" class="mb-3 rounded-[4px] border border-warn p-2 font-sans text-[12px] text-fg">
              <p class="m-0 mb-1 flex items-center gap-1 text-warn">
                <span class="material-symbols-outlined text-[14px]" aria-hidden="true">warning</span>
                {{ t("skillsView.remote.executables", { count: executables.length }) }}
              </p>
              <ul class="m-0 pl-5 font-mono text-[11px]">
                <li v-for="file in executables" :key="file.path">{{ file.path }}</li>
              </ul>
            </div>
            <details class="mb-3 font-sans text-[12px] text-secondary">
              <summary class="cursor-pointer">{{ t("skillsView.remote.files", { count: doc.files.length }) }}</summary>
              <ul class="m-0 pl-5 font-mono text-[11px]">
                <li v-for="file in doc.files" :key="file.path">{{ file.path }}</li>
              </ul>
            </details>
            <div class="max-w-[90ch] font-sans text-[13px] text-fg"><MarkdownProse :markdown="body" /></div>
          </template>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import MarkdownProse from "../MarkdownProse.vue";
import { CHANGELOG_URL, GUIDE_SITE_ORIGIN, type ReleaseNoteSummary, type WhatsNewEntry } from "../../../common/whatsNew";
import { fetchReleaseNote, fetchReleaseNotes } from "../../composables/releaseNotes";

// What changed in each version (#2717): the same dated guide the What's new dialog shows after an
// upgrade, for any version up to the running one, newest first.
const { t, locale } = useI18n();

const releases = ref<ReleaseNoteSummary[] | null>(null);
const failed = ref(false);
const chosen = ref("");
const note = ref<WhatsNewEntry | null>(null);
const loading = ref(false);

// A later choice can land before an earlier one's answer; only the latest is shown.
let request = 0;
async function show(version: string) {
  const mine = ++request;
  loading.value = true;
  const answer = await fetchReleaseNote(version, locale.value);
  if (mine !== request) return;
  loading.value = false;
  note.value = answer;
  failed.value = answer === null;
}

// A change of language can start a second read before the first answers; only the latest counts.
let listRequest = 0;
async function load() {
  const mine = ++listRequest;
  const list = await fetchReleaseNotes(locale.value);
  if (mine !== listRequest) return;
  releases.value = list;
  failed.value = list === null;
  // Keep the version being read when the new list still has it; otherwise the newest, or nothing.
  const kept = list?.some((release) => release.version === chosen.value) ? chosen.value : "";
  chosen.value = kept || (list?.[0]?.version ?? "");
  if (chosen.value) return void show(chosen.value);
  request++;
  note.value = null;
}

function onChoice(event: Event) {
  if (!(event.target instanceof HTMLSelectElement)) return;
  chosen.value = event.target.value;
  void show(chosen.value);
}

onMounted(load);
// The guide is written in Japanese and English; a change of language re-reads it in the new one.
watch(locale, () => void load());
</script>

<template>
  <p class="mb-2 mt-1.5 text-[12px] text-dim">{{ t("releaseNotes.intro") }}</p>
  <select
    v-if="releases && releases.length"
    class="mb-3 w-full cursor-pointer rounded-lg border border-border bg-elevated px-2 py-1.5 text-[12px] text-fg"
    data-testid="release-notes-version"
    :value="chosen"
    :aria-label="t('releaseNotes.versionField')"
    @change="onChoice"
  >
    <option v-for="release in releases" :key="release.version" :value="release.version">{{ release.title }}</option>
  </select>
  <p v-if="failed" class="text-[12px] text-err-text" role="alert" data-testid="release-notes-failed">{{ t("releaseNotes.failed") }}</p>
  <p v-else-if="releases && !releases.length" class="text-[12px] text-dim" data-testid="release-notes-none">{{ t("releaseNotes.none") }}</p>
  <p v-else-if="loading && !note" class="text-[12px] text-dim">{{ t("releaseNotes.loading") }}</p>
  <article v-if="note" class="flex flex-col gap-2" data-testid="release-notes-page">
    <MarkdownProse :markdown="note.markdown" :trusted-image-origin="GUIDE_SITE_ORIGIN" class="font-sans text-[13px] leading-[1.6] text-fg" />
    <a :href="note.url" target="_blank" rel="noopener noreferrer" class="self-start text-[11px] text-dim underline hover:text-fg">{{
      t("whatsNew.openOnWeb")
    }}</a>
  </article>
  <a :href="CHANGELOG_URL" target="_blank" rel="noopener noreferrer" class="mt-3 inline-block text-[11px] text-dim underline hover:text-fg">{{
    t("releaseNotes.changelog")
  }}</a>
</template>

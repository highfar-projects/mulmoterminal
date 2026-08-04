<script setup lang="ts">
import { computed, ref } from "vue";
import { useAppConfig } from "../../composables/useAppConfig";
import { useSavedListMirror } from "../../composables/useSavedListMirror";
import { issueWorkComments, saveIssueWorkComments } from "../../composables/issueWorkComments";
import { prWorkdirFooter, savePrWorkdirFooter } from "../../composables/prWorkdirFooter";
import { normalizeGitlabHost } from "../../../common/gitlabHosts";
import SettingsButton from "../SettingsButton.vue";
import SettingsField from "../SettingsField.vue";
import { canAddGitlabHost } from "../settingsValidators";
import SettingsListRow from "./SettingsListRow.vue";
import { SECTION_HEADING, SETTINGS_LIST } from "./sectionClasses";

// What this app writes to a forge on the user's behalf. Grouped because that is the question a
// reader has — "what does it post as me?" — not because the three keys are related in the config.
//
// Read straight from the composables rather than through the modal's props: useAppConfig's state
// is a singleton, so a section that owns one setting can own its whole loop (ThemeSection and
// WaitingRowsSection already do).
const { gitlabHosts, saveGitlabHosts } = useAppConfig();

function onWorkCommentsToggle(e: Event) {
  if (e.target instanceof HTMLInputElement) void saveIssueWorkComments(e.target.checked);
}
function onFooterToggle(e: Event) {
  if (e.target instanceof HTMLInputElement) void savePrWorkdirFooter(e.target.checked);
}

const { items: hosts, replace } = useSavedListMirror<string>(
  () => gitlabHosts.value,
  (next) => void saveGitlabHosts(next),
);

const newHost = ref("");
const newHostValid = computed(() => canAddGitlabHost(newHost.value, hosts.value));
function addHost() {
  const host = normalizeGitlabHost(newHost.value);
  // Normalized before it is stored, not just before it is judged: the server would normalize it
  // anyway, and the list must show what was actually saved.
  if (!host || hosts.value.includes(host)) return;
  replace([...hosts.value, host]);
  newHost.value = "";
}
function removeHost(host: string) {
  replace(hosts.value.filter((h) => h !== host));
}
</script>

<template>
  <h3 :class="SECTION_HEADING">GitHub and GitLab</h3>

  <label class="mt-1.5 flex cursor-pointer items-start gap-2">
    <input
      type="checkbox"
      class="mt-1 cursor-pointer"
      :checked="issueWorkComments"
      aria-label="Comment on the issue a cell is working on"
      @change="onWorkCommentsToggle"
    />
    <span class="text-[12px]">
      <strong>Say when work starts on an issue</strong> — one comment, posted as the work starts and edited as the PR opens and merges. It names the working
      directory (the folder name, never the path), so two terminals do not start the same issue twice. Needs <code>gh</code> (or <code>glab</code>) logged in.
    </span>
  </label>

  <label class="mt-2 flex cursor-pointer items-start gap-2">
    <input type="checkbox" class="mt-1 cursor-pointer" :checked="prWorkdirFooter" aria-label="End a created PR with the clone name" @change="onFooterToggle" />
    <span class="text-[12px]">
      <strong>End a created PR with the clone name</strong> — a <code>work in &lt;clone&gt;</code> line at the bottom of the body, so a PR says which of several
      side-by-side clones produced it.
    </span>
  </label>

  <p class="mb-1.5 mt-3 text-[12px] text-dim">
    <strong class="text-fg">Self-hosted GitLab</strong> — a URL does not say which forge a host runs, so declare it here to have its repos read with
    <code>glab</code>. Needs <code>glab auth login --hostname &lt;host&gt;</code>. Takes effect on the next server start.
  </p>
  <ul v-if="hosts.length" :class="SETTINGS_LIST">
    <SettingsListRow v-for="h in hosts" :key="h" :name="h" @remove="removeHost(h)">
      <span class="flex-auto font-mono text-[12px] text-secondary">{{ h }}</span>
    </SettingsListRow>
  </ul>
  <div class="mb-3 flex items-center gap-2">
    <SettingsField
      v-model="newHost"
      class="flex-auto font-mono"
      placeholder="gitlab.example.com"
      aria-label="Add a self-hosted GitLab host"
      spellcheck="false"
      @keydown.enter="addHost"
    />
    <SettingsButton :disabled="!newHostValid" @click="addHost">Add</SettingsButton>
  </div>
</template>

<script setup lang="ts">
import { useLaunchOptions } from "../../composables/useLaunchOptions";
import SkillLaunchButton from "../SkillLaunchButton.vue";
import { SECTION_HEADING, SETTINGS_LIST } from "./sectionClasses";
import type { BundledSkillName } from "../../../common/bundledSkills";

// Read-only, like the shortcuts list: a provider is a name, a base URL and the env var its key is
// read from, and an editor for that is a form with a "your key is in the wrong variable" failure
// mode. What this section owes the user is the answer to "which backends can this server actually
// reach right now", which is exactly what /api/launch-options resolves — and it reports `ready`,
// which the raw config cannot.
const { launchOptions } = useLaunchOptions();

defineEmits<{ (e: "launch-skill", skill: BundledSkillName): void }>();
</script>

<template>
  <h3 :class="SECTION_HEADING">Models and backends</h3>
  <p class="mb-2 mt-1.5 text-[12px] text-dim">
    Anthropic-compatible backends a session can run on, from <code>providers</code> in <code>~/.mulmoterminal/config.json</code>. A directory can pin one with
    <code>provider</code> / <code>model</code> in its <code>.mulmoterminal.json</code>. A key lives in the environment, never in the config.
  </p>
  <ul v-if="launchOptions.providers.length" :class="SETTINGS_LIST">
    <li v-for="p in launchOptions.providers" :key="p.id" class="flex items-baseline gap-2 rounded-md bg-elevated px-2 py-1.5">
      <span class="font-mono text-[12px] text-secondary">{{ p.label }}</span>
      <span class="text-[11px] text-dim">{{ p.models.length }} model{{ p.models.length === 1 ? "" : "s" }} · key in {{ p.tokenEnv }}</span>
      <span class="flex-auto" />
      <span v-if="p.ready" class="text-[11px] text-dim">ready</span>
      <span v-else class="text-[11px] text-err-text" :title="p.reason">not ready</span>
    </li>
  </ul>
  <p v-else class="mb-2 text-[12px] text-dim">None configured — sessions run on the built-in default.</p>
  <div class="mb-3">
    <SkillLaunchButton skill="mulmoterminal-model" icon="network_node" label="Add a backend…" @launch="$emit('launch-skill', $event)" />
  </div>
</template>

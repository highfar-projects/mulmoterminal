<script setup lang="ts">
import { useAppConfig } from "../../composables/useAppConfig";
import { useLaunchOptions } from "../../composables/useLaunchOptions";
import { isOfferable, notOfferedReason } from "../launchOffer";
import SkillLaunchButton from "../SkillLaunchButton.vue";
import { SECTION_HEADING, SETTINGS_LIST } from "./sectionClasses";
import type { BundledSkillName } from "../../../common/bundledSkills";

// Read-only, like the shortcuts list: a provider is a name, a base URL and the env var its key is
// read from, and an editor for that is a form with a "your key is in the wrong variable" failure
// mode. What this section owes the user is the answer to "what can a session run on right now",
// which is two lists.
//
// Providers come from /api/launch-options rather than the config, because that route RESOLVES
// them — it reports `ready`, which the raw config cannot. Custom agents come from the config,
// because there is nothing to resolve: the command is the user's own and is run as written.
const { launchOptions } = useLaunchOptions();
const { customAgents } = useAppConfig();

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
      <span v-if="!p.ready" class="text-[11px] text-err-text" :title="p.reason">not ready</span>
      <!-- Reachable, and still not a choice: a session cannot be started on a provider without a
           model, so the launch picker leaves it out. Said here because "ready · 0 models" reads
           like it works (#1432). -->
      <span v-else-if="!isOfferable(p)" class="text-[11px] text-err-text" :title="notOfferedReason(p) ?? ''">not in the picker</span>
      <span v-else class="text-[11px] text-dim">ready</span>
    </li>
  </ul>
  <p v-else class="mb-2 text-[12px] text-dim">None configured — sessions run on the built-in default.</p>

  <p class="mb-1.5 mt-3 text-[12px] text-dim">
    <strong class="text-fg">Your own way of starting Claude Code</strong> (<code>customAgents</code>) — offered in the Agent Picker beside Claude / Codex /
    Antigravity / Shell. Not a launcher: Claude Code's own arguments are appended to the command, so the cell resumes, reports cost and reaches the GUI tools
    like any other Claude session.
  </p>
  <ul v-if="customAgents.length" :class="SETTINGS_LIST">
    <li v-for="agent in customAgents" :key="agent.id" class="flex flex-col gap-0.5 rounded-md bg-elevated px-2 py-1.5">
      <span class="font-mono text-[12px] text-secondary">{{ agent.label }}</span>
      <span class="truncate font-mono text-[11px] text-dim" :title="agent.command">{{ agent.command }}</span>
    </li>
  </ul>
  <p v-else class="mb-2 text-[12px] text-dim">None configured.</p>

  <div class="mb-3 mt-2">
    <SkillLaunchButton skill="mulmoterminal-model" icon="network_node" label="Add a backend…" @launch="$emit('launch-skill', $event)" />
  </div>
</template>

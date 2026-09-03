<script setup lang="ts">
// The launch-agent picker for the collection plugin's "Start chat" modal (#1945).
//
// Why this is not `LaunchAgentPicker` with a prop: it renders INSIDE the plugin's shadow root,
// where MulmoTerminal's own utilities do not exist. `src/collectionShadowCss.ts` injects the
// PLUGIN's Tailwind sheet, and a class rule does not pierce a shadow boundary — so `bg-input`,
// `text-fg`, `border-border` and `text-dim` resolve to nothing in here and the control would come
// out as a bare `<select>` on a white card. (Verified against the shipped sheet: none of those
// four appear in it.) The duplication is exactly the part that has to differ.
//
// It speaks the modal's own language instead, which is also the right answer rather than merely
// the available one: that card is white whatever theme MulmoTerminal is wearing, so the picker
// belongs to the card, not to the app behind it. Every class below is one the plugin's sheet
// already ships — a `slate-*` the modal's own Cancel button uses.
//
// ALWAYS shown, unlike the same choice in a Collections pane. The pane marks only a surprising
// answer; here the launch IS the subject, so "it will be Claude" is worth reading — the same call
// SkillLaunchConfirm makes.
import { launchAgent } from "../composables/useChatLauncher";
import { BUILTIN_AGENT_OPTIONS } from "./agentPicker";
</script>

<template>
  <!-- A <label> wrapper so the visible words name the control, and are a second hit target for it. -->
  <label class="flex shrink-0 items-center gap-2" data-testid="chat-modal-agent-picker" title="Agent this chat will start as">
    <span class="text-xs font-bold uppercase tracking-wide text-slate-400">Launch with</span>
    <select v-model="launchAgent" class="h-8 cursor-pointer rounded border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 transition-colors">
      <option v-for="o in BUILTIN_AGENT_OPTIONS" :key="o.agent" :value="o.agent">{{ o.label }}</option>
    </select>
  </label>
</template>

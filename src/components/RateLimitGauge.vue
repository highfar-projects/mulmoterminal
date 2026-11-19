<script setup lang="ts">
// The 5h / 7d windows, always on screen in the grid header (#387).
//
// Always visible rather than a hover tip, which is what #388 shipped and what this replaces: the
// point is to notice a window filling up WITHOUT going to look, because by the time you think to
// check you have usually already hit it. The reset times stay on hover — they answer the second
// question, not the first.
//
// A peer server (common/peers.ts) runs on its own logins, so its readings follow this server's as a
// section of their own, opened by the peer's label: `WSL` then its figures. Without a peer the row
// is exactly what it was.
import { computed, onMounted, onUnmounted } from "vue";
import { useRateLimits } from "../composables/useRateLimits";
import { rateLimitReadout, type RateLimitReadout } from "../composables/rateLimitGauge";
import { peerHosts } from "../composables/peerHosts";
import AgentMark from "./AgentMark.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const { snapshot, peerSnapshots, start, stop } = useRateLimits();
onMounted(start);
onUnmounted(stop);

interface Section extends RateLimitReadout {
  /** "" for this server; the peer's id otherwise, which also keeps the keys apart. */
  key: string;
  /** The peer's label, drawn before its figures; null for this server. */
  label: string | null;
}

// A peer's figures say whose they are on hover too: the same `5h 12%` is a different login there.
const gaugeTip = (section: Section, title: string): string => (section.label ? t("tips.rateLimit.peerGauge", { peer: section.label, title }) : title);

const isEmpty = (readout: RateLimitReadout): boolean => !readout.note && !readout.accountNotes.length && !readout.gauges.length;

// The clock is read ONCE per reading, and everything derived from it comes out of the same pass:
// the figures, the hover text, and the decision to drop a window whose reset has gone by. Reading
// Date.now() separately in each of those let them disagree — a window could be dropped as expired
// while its own hover text still counted down.
//
// `note` sits where the numbers would be, in the muted colour, because it is the same kind of
// information: "here is what we know about your usage" (#1011).
const sections = computed<Section[]>(() => {
  const now_ms = Date.now();
  const own: Section = { key: "", label: null, ...rateLimitReadout(snapshot.value, now_ms, t) };
  const peers = peerHosts.value.flatMap((peer) => {
    const reading = peerSnapshots.value[peer.id];
    if (!reading) return [];
    const readout = rateLimitReadout(reading, now_ms, t);
    return isEmpty(readout) ? [] : [{ key: peer.id, label: peer.label, ...readout }];
  });
  return [own, ...peers];
});
</script>

<template>
  <!-- Nothing at all until something reports: an agent that is not installed, is on API-key
       billing, or has not run yet all arrive here as an empty list, and an empty gauge would be
       one more thing to explain rather than information. -->
  <template v-for="section in sections" :key="section.key">
    <span
      v-if="section.label"
      class="ml-1.5 inline-flex flex-none items-center border-l border-border pl-2.5 font-sans text-[11px] leading-none text-secondary"
      :data-tip="t('tips.rateLimit.peer', { peer: section.label })"
      data-testid="rate-limit-peer"
      >{{ section.label }}</span
    >
    <span
      v-if="section.note"
      class="ml-1.5 inline-flex flex-none items-center border-l border-border pl-2.5 font-mono text-[12px] leading-none text-dim"
      role="note"
      :aria-label="section.note"
      :data-tip="section.note"
      data-testid="rate-limit-note"
      >claude usage n/a</span
    >
    <!-- A login that is OUT is the state that stops the work, so it takes the warning colour the
         gauge gives a window near its ceiling, rather than the muted one for "not measured" (#2995). -->
    <span
      v-for="entry in section.accountNotes"
      :key="`${section.key}/${entry.key}`"
      class="ml-1.5 inline-flex flex-none items-center gap-1.5 border-l border-border pl-2.5 font-mono text-[12px] leading-none"
      :class="entry.warn ? 'text-amber' : 'text-dim'"
      role="note"
      :aria-label="entry.note"
      :data-tip="entry.note"
      data-testid="rate-limit-account-note"
    >
      <AgentMark agent="claude" :class="entry.warn ? 'text-amber' : 'text-muted'" />
      <span class="max-w-[10ch] truncate">{{ entry.label }}</span>
      <span>{{ entry.status }}</span>
    </span>
    <span
      v-for="gauge in section.gauges"
      :key="`${section.key}/${gauge.key}`"
      class="ml-1.5 inline-flex flex-none items-center gap-1.5 border-l border-border pl-2.5"
      role="img"
      :aria-label="gaugeTip(section, gauge.title)"
      :data-tip="gaugeTip(section, gauge.title)"
      :data-testid="gauge.key.startsWith('account:') ? 'rate-limit-account' : undefined"
    >
      <AgentMark v-if="gauge.marked" :agent="gauge.agent" :class="gauge.windows.some((w) => w.warn) ? 'text-amber' : 'text-muted'" />
      <span v-if="gauge.label" class="max-w-[10ch] truncate font-mono text-[12px] leading-none text-dim" aria-hidden="true">{{ gauge.label }}</span>
      <span
        v-for="window in gauge.windows"
        :key="window.label"
        class="font-mono text-[12px] leading-none"
        :class="window.warn ? 'text-amber' : 'text-muted'"
        aria-hidden="true"
        >{{ window.label }} {{ window.percent }}%</span
      >
    </span>
  </template>
</template>

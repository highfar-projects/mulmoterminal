<script setup lang="ts">
// The peer server a cell runs on (common/peers.ts), named in its header — and, when that server does
// not answer, saying so: a peer cell whose socket will not come back otherwise looks like a terminal
// that is merely slow to reconnect.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { peerIsDown, peerLabel, watchPeerReachability } from "../composables/peerHosts";

const props = defineProps<{ host: string }>();
const { t } = useI18n();

watchPeerReachability();

const down = computed(() => peerIsDown(props.host));
const label = computed(() => peerLabel(props.host));
const tip = computed(() => (down.value ? t("peers.unreachable", { label: label.value }) : t("peers.runOn")));
</script>

<template>
  <span
    data-testid="cell-peer"
    :data-down="down ? 'true' : undefined"
    class="inline-flex shrink-0 items-center gap-0.5 rounded border px-1 font-sans text-[10px] leading-4"
    :class="down ? 'border-amber text-amber' : 'border-line text-accent'"
    :data-tip="tip"
    :aria-label="tip"
    ><span v-if="down" class="material-symbols-outlined text-[11px]" aria-hidden="true">cloud_off</span>{{ label }}</span
  >
</template>

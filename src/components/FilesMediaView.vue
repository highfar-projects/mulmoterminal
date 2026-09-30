<script setup lang="ts">
// A file the pane draws instead of reading as text, straight from the raw route: the route streams
// it and answers Range, so a video seeks without the whole file being fetched.
import type { FileMediaKind } from "./filePreviewKind";

defineProps<{ kind: FileMediaKind; src: string; name: string }>();
</script>

<template>
  <img
    v-if="kind === 'image'"
    :src="src"
    :alt="name"
    data-testid="files-image"
    class="max-h-[70vh] max-w-full rounded border border-border bg-[var(--bg-base)] object-contain"
  />
  <!-- No `sandbox`: the raw route serves a PDF unsandboxed because WebKit draws nothing in an
       opaque-origin frame, and a tab has always opened it the same way. -->
  <iframe v-else-if="kind === 'pdf'" :src="src" :title="name" data-testid="files-pdf" class="min-h-0 w-full flex-auto rounded border-0 bg-white" />
  <video v-else-if="kind === 'video'" :src="src" controls preload="metadata" data-testid="files-video" class="max-h-[70vh] max-w-full rounded bg-black" />
  <audio v-else :src="src" controls preload="metadata" data-testid="files-audio" class="w-[28rem] max-w-full" />
</template>

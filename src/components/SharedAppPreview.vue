<script setup lang="ts">
// The author's shared app, running on the author's own machine, before anything is published.
//
// Until this existed the page was written by an LLM and went out without anybody having loaded it
// once. This is where it loads (design: `plans/feat-shared-app-preview.md`).
//
// THE PARENT IS NOT OURS. Every rule about what a view may ask for, when a write may happen and
// which document may be answered lives in `@receptron/sharedapp/view` — the same code mulmoserver
// runs at `/a/{slug}`. Writing a second parent here would have been quicker and would have made
// this a different program from the one visitors meet: it would agree on the easy things and
// diverge on a dropped port message, a confirmation that is not drawn, a modal the sandbox
// ignores. What stays here is this host's chrome, and nothing else.
//
// AND IT IS NOT LOOSER. Same `sandbox="allow-scripts"` with no `allow-modals` and no
// `allow-same-origin`, same CSP, same per-render nonce, same handover of a private port. A preview
// that were kinder than production is a machine for manufacturing "it worked on my machine", and
// worse than having none.
//
// What this does NOT show is worth knowing before trusting it: the rules do not run here, so what
// a role may WRITE is not tested; nobody else exists, so nothing here is concurrent; and it cannot
// tell whether the Firestore rules a new declaration needs have been deployed at all.
import { computed, onBeforeUnmount, ref, shallowRef, toRaw, watch } from "vue";
import { portChannel, publicViewSrcdoc, viewBridge, viewNonce, type PendingSubmit } from "@receptron/sharedapp/view";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { isRecord } from "../../common/isRecord";
import { previewPageKey, type PreviewAudience, type PreviewDataset, type PreviewPage, type SharedAppPreview } from "../../common/sharedAppPreview";

const props = defineProps<{ cwd: string | null }>();

/** The payload, narrowed rather than asserted. Every field has a floor, because a pane that threw
 *  on an unexpected shape would report a server it could not read as an app that will not publish —
 *  two very different things to be told while you are trying to fix a page. */
function asPayload(value: unknown): SharedAppPreview | null {
  if (!isRecord(value)) return null;
  return {
    aid: typeof value.aid === "string" ? value.aid : "",
    pages: Array.isArray(value.pages) ? value.pages.flatMap(asPage) : [],
    publicOpen: value.publicOpen === true,
    fromLiveApp: value.fromLiveApp === true,
    generatedForm: value.generatedForm === true,
    datasets: isRecord(value.datasets) ? Object.fromEntries(Object.entries(value.datasets).map(([key, rows]) => [key, asDatasets(rows)])) : {},
    unreadable: strings(value.unreadable),
    warnings: strings(value.warnings),
  };
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

const AUDIENCES: PreviewAudience[] = ["public", "member", "roster"];

const asPage = (value: unknown): PreviewPage[] => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.html !== "string") return [];
  const audience = AUDIENCES.find((candidate) => candidate === value.audience);
  return audience === undefined ? [] : [{ id: value.id, html: value.html, audience }];
};

const asDatasets = (value: unknown): Record<string, PreviewDataset> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([cid, rows]) => [cid, Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => isRecord(row)) : []]),
  );
};

const loading = ref(true);
const declared = ref(false);
const problems = ref<string[]>([]);
const payload = shallowRef<SharedAppPreview | null>(null);
const selectedId = ref<string | null>(null);

const AUDIENCE_LABEL: Record<PreviewPage["audience"], string> = {
  public: "Anyone with the link",
  member: "On the roster",
  roster: "The person who signed up",
};

const pages = computed<PreviewPage[]>(() => payload.value?.pages ?? []);

/** The key the picker binds to. Audience-qualified for the same reason the datasets are: a view id
 *  is unique inside its tier, not across them. */
const keyOf = (candidate: PreviewPage): string => previewPageKey(candidate.audience, candidate.id);

const page = computed(() => pages.value.find((candidate) => keyOf(candidate) === selectedId.value) ?? pages.value[0] ?? null);

/** ONLY this page's records. A member page may name a collection `public.read` does not open, so
 *  one map for the app would either starve that page or hand its rows to the public one — and the
 *  second would show the author a public page drawing private data. */
const datasets = computed(() => (page.value === null ? {} : (payload.value?.datasets[keyOf(page.value)] ?? {})));

/** A fresh name per rendered document, for the reason the package gives: reusing one would let a
 *  document that navigated away go on answering. */
const nonce = ref(viewNonce());
const srcdoc = computed(() => (page.value === null ? "" : publicViewSrcdoc(page.value.html, nonce.value)));

const frame = ref<HTMLIFrameElement | null>(null);

// The bridge's state, owned HERE. The package holds no framework of its own so that a second copy
// of Vue cannot end up on a page — see its own note — so the cells are this host's `ref`s.
const cells = { pending: ref<PendingSubmit | null>(null), sending: ref(false), readied: ref(false) };

const bridge = viewBridge(
  {
    channel: () => portChannel(frame.value, (message) => structuredCloneable(message)),
    // NOT WIRED YET, and refused out loud rather than dropped. A request with no answer is, on the
    // author's screen, a button that does nothing — which is the exact failure this whole feature
    // exists to catch, and it would be a poor joke to ship it here first. Writing goes to the real
    // Firestore, with a mark and a way to clear it (the plan's section 5); until that lands the
    // view is told why.
    submit: () => Promise.resolve({ ok: false, error: "preview-cannot-write-yet" }),
    state: () => datasets.value,
  },
  () => (payload.value === null ? null : { submit: {} }),
  () => nonce.value,
  cells,
);

/** Vue's reactivity taken off a message before the browser copies it. Structured clone refuses a
 *  Proxy, and these datasets arrive through a ref — the failure is a `DataCloneError` at the send,
 *  which leaves the view on "loading…" with nothing on screen to say why.
 *
 *  Rebuilt entry by entry rather than unwrapped whole, so the shape is preserved by construction
 *  and nothing has to be asserted back into it. */
function structuredCloneable(message: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(message).map(([key, value]) => [key, unwrap(value)]));
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** Recursive because `toRaw` unwraps one level. Anything that is not a plain container is passed
 *  through untouched — structured clone copies a class instance's own fields by itself, and going
 *  through JSON instead would turn `NaN` and `±Infinity` into `null`. */
const unwrap = (value: unknown): unknown => {
  const raw: unknown = toRaw(value);
  if (Array.isArray(raw)) return raw.map(unwrap);
  if (isPlainObject(raw)) return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, unwrap(entry)]));
  return raw;
};

/** Only messages from OUR frame. The sandbox's origin is opaque, so `event.origin` cannot draw
 *  this boundary and `event.source` is what does. */
const onMessage = (event: MessageEvent) => {
  if (frame.value !== null && event.source === frame.value.contentWindow) bridge.receive(event.data);
};
window.addEventListener("message", onMessage);
onBeforeUnmount(() => {
  window.removeEventListener("message", onMessage);
  bridge.restart();
});

// A new document means a new conversation: the old channel belongs to a document we are no longer
// talking to, and the next `ready` is a real first one.
//
// Watched on the HTML, never on `srcdoc`. `srcdoc` is computed FROM the nonce, so minting one here
// would change what is being watched and trigger this again — an infinite loop rather than a
// preview. The document's identity is the page; the nonce is a consequence of it.
watch(
  () => page.value?.html,
  () => {
    bridge.restart();
    nonce.value = viewNonce();
  },
);

// New data, same document — the view asked once and cannot ask again.
watch(datasets, () => bridge.sendState(), { deep: true });

let generation = 0;

async function load(): Promise<void> {
  const mine = ++generation;
  loading.value = true;
  problems.value = [];
  payload.value = null;
  declared.value = false;
  try {
    const cwd = props.cwd;
    const query = cwd === null ? "" : `?cwd=${encodeURIComponent(cwd)}`;
    const res = await fetchWithTimeout(`/api/shared-app/preview${query}`);
    const body: unknown = await res.json();
    if (mine !== generation) return;
    if (!isRecord(body)) {
      problems.value = ["The server answered with something this pane cannot read."];
      return;
    }
    declared.value = body.declared === true;
    if (body.declared !== true) return;
    if (body.ok !== true) {
      const listed = Array.isArray(body.problems) ? body.problems.filter((line): line is string => typeof line === "string") : [];
      problems.value = listed.length > 0 ? listed : ["The preview could not be computed."];
      return;
    }
    payload.value = asPayload(body.preview);
    // The picker starts ON the page being drawn. Left null it renders blank while the frame below
    // it shows the first page, which reads as "no page selected" over a page that is right there.
    const first = payload.value?.pages[0];
    selectedId.value = first === undefined ? null : keyOf(first);
  } catch {
    if (mine === generation) problems.value = ["Could not reach the server."];
  } finally {
    if (mine === generation) loading.value = false;
  }
}

watch(() => props.cwd, load, { immediate: true });
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-panel font-sans" role="region" aria-label="Shared app preview">
    <div v-if="loading" class="p-3 text-[12px] text-dim">Computing what publishing would show…</div>

    <!-- Not an error. Most directories are not shared apps, and this pane asks about whichever one
         the cell happens to be open in. -->
    <div v-else-if="!declared" class="p-3 text-[12px] text-dim">
      This directory declares no shared app. One lives in <code>app.json</code> beside the collections it publishes.
    </div>

    <div v-else-if="problems.length" class="p-3">
      <p class="mb-1.5 text-[12px] text-err-text">Publishing this would be refused:</p>
      <ul class="flex list-none flex-col gap-1 p-0">
        <li v-for="problem in problems" :key="problem" class="text-[11px] leading-[1.4] text-err-text">{{ problem }}</li>
      </ul>
    </div>

    <!-- Two states that put the same empty frame on screen and mean opposite things. Saying only
         "no pages" over an app that publishes a generated form tells the author their survey cannot
         be previewed BECAUSE there is nothing there, which is untrue and unactionable. -->
    <div v-else-if="pages.length === 0 && payload?.generatedForm" class="p-3 text-[12px] text-dim">
      This app publishes a generated form rather than a page of its own. Drawing that form here is not wired up yet — the published site builds it from what
      <code>public.submit</code> declares.
    </div>
    <div v-else-if="pages.length === 0" class="p-3 text-[12px] text-dim">This app publishes no pages — only its schemas. There is nothing to draw.</div>

    <template v-else>
      <div class="flex flex-none flex-wrap items-center gap-2 border-b border-border px-2.5 py-1.5">
        <label class="text-[11px] text-dim" for="mt-preview-page">Page</label>
        <select id="mt-preview-page" v-model="selectedId" class="rounded-[5px] border border-border bg-input px-1.5 py-[3px] text-[11px] text-fg">
          <option v-for="candidate in pages" :key="keyOf(candidate)" :value="keyOf(candidate)">
            {{ candidate.id }} — {{ AUDIENCE_LABEL[candidate.audience] }}
          </option>
        </select>
        <!-- Which face this is, said in the pane rather than only in the picker: the three tiers
             are separate documents with separate rules, and reading the wrong one as "the app" is
             how a page written for the front desk gets published to the world. -->
        <span v-if="page" class="text-[11px] text-dim">{{ AUDIENCE_LABEL[page.audience] }}</span>
        <span v-if="payload && !payload.publicOpen" class="text-[11px] text-dim">· Roster only</span>
      </div>

      <div class="min-h-0 flex-1">
        <!-- Byte for byte the document a visitor is served. No `allow-modals`, so `alert` /
             `confirm` / `prompt` are ignored here exactly as they are there; no
             `allow-same-origin`, so the frame gets an opaque origin and cannot reach this app's
             storage or credentials. Do not add either to "make the preview work" — a page that
             needs them is a page that is already broken in production. -->
        <iframe
          ref="frame"
          :key="srcdoc"
          :srcdoc="srcdoc"
          title="Shared app preview"
          sandbox="allow-scripts"
          csp="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'; connect-src 'none'"
          class="h-full w-full border-0 bg-input"
        />
      </div>

      <!-- OUTSIDE the frame, because a page cannot be trusted to describe its own success. What is
           said here is what the parent knows, not what the view drew. -->
      <div class="flex-none border-t border-border px-2.5 py-1.5" role="status" aria-live="polite">
        <p class="text-[11px] text-dim">
          Real records, read as you. Nothing here is written, and the rules are not run — this shows what DRAWS, not what a stranger would be allowed to do.
        </p>
        <p v-if="payload && !payload.fromLiveApp" class="mt-1 text-[11px] text-dim">This app has never been published, so nothing was carried over.</p>
        <p v-if="payload && payload.unreadable.length" class="mt-1 text-[11px] text-amber">
          Could not read records for: {{ payload.unreadable.join(", ") }} — an empty page below may be a refusal rather than an empty collection.
        </p>
        <ul v-if="payload && payload.warnings.length" class="mt-1 flex list-none flex-col gap-1 p-0">
          <li v-for="warning in payload.warnings" :key="warning" class="text-[11px] leading-[1.4] text-amber">{{ warning }}</li>
        </ul>
        <p v-if="cells.pending.value" class="mt-1 text-[11px] text-amber">
          The page asked to write a record. Writing from a preview is not wired up yet, so it was refused and told why.
        </p>
      </div>
    </template>
  </div>
</template>

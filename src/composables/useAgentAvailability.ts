import { computed, ref } from "vue";
import { parseAgentAvailabilityResponse, type AgentAvailability } from "../../common/agentAvailability";
import type { TerminalAgent } from "../../common/sessionAgent";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { peerApiPath } from "../../common/peers";
import { usePaneHost } from "./paneHost";

type Unavailable = Extract<AgentAvailability, { available: false }>;

// Which agents this machine cannot start (#2230), from GET /api/agents/availability. The server
// checks once at its own start, so one fetch per page is the whole of it; every picker shares it.
//
// An unanswered or failed fetch leaves the map EMPTY, which reads as "every agent available" —
// the behaviour before this existed. A picker that greyed everything out because the server was
// slow to answer would be worse than one that let a missing agent fail at spawn, as it always did.
//
// Per SERVER (common/peers.ts): a peer machine has its own CLIs installed, and the launch form picking
// that peer asks it (paneHost.ts). Keyed by the peer id, "" for this server.
interface Answer {
  unavailable: ReadonlyMap<TerminalAgent, Unavailable>;
  confirmed: ReadonlySet<TerminalAgent>;
}
const answers = ref<ReadonlyMap<string, Answer>>(new Map());
const requested = new Set<string>();

async function loadAgentAvailability(host: string | null): Promise<void> {
  try {
    // A failed response needs no branch of its own: its body parses to no entries, which blocks nothing.
    const res = await fetchWithTimeout(peerApiPath(host, "/api/agents/availability"));
    const entries = parseAgentAvailabilityResponse(await res.json());
    const answer: Answer = {
      unavailable: new Map(entries.filter((entry): entry is Unavailable => !entry.available).map((entry) => [entry.agent, entry])),
      confirmed: new Set(entries.filter((entry) => entry.available).map((entry) => entry.agent)),
    };
    answers.value = new Map([...answers.value, [host ?? "", answer]]);
  } catch {
    // No answer is not a reason to block anything; see above.
  }
}

const NONE: Answer = { unavailable: new Map(), confirmed: new Set() };

export function useAgentAvailability() {
  const host = usePaneHost();
  const ask = (): Answer => {
    const key = host.value ?? "";
    if (!requested.has(key)) {
      requested.add(key);
      void loadAgentAvailability(host.value);
    }
    return answers.value.get(key) ?? NONE;
  };
  ask(); // asked now, as before, so the answer is on its way before anything reads it
  return { unavailableAgents: computed(() => ask().unavailable), confirmedAgents: computed(() => ask().confirmed) };
}

/** Test seam: forget the cached answer so the next use fetches again. Not used by the app. */
export function resetAgentAvailability(): void {
  requested.clear();
  answers.value = new Map();
}

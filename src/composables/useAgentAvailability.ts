import { ref } from "vue";
import { parseAgentAvailabilityResponse, type AgentAvailability } from "../../common/agentAvailability";
import type { TerminalAgent } from "../../common/sessionAgent";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

type Unavailable = Extract<AgentAvailability, { available: false }>;

// Which agents this machine cannot start (#2230), from GET /api/agents/availability. The server
// checks once at its own start, so one fetch per page is the whole of it; every picker shares it.
//
// An unanswered or failed fetch leaves the map EMPTY, which reads as "every agent available" —
// the behaviour before this existed. A picker that greyed everything out because the server was
// slow to answer would be worse than one that let a missing agent fail at spawn, as it always did.
const unavailableAgents = ref<ReadonlyMap<TerminalAgent, Unavailable>>(new Map());
let requested = false;

async function loadAgentAvailability(): Promise<void> {
  try {
    // A failed response needs no branch of its own: its body parses to no entries, which blocks nothing.
    const res = await fetchWithTimeout("/api/agents/availability");
    const entries = parseAgentAvailabilityResponse(await res.json());
    unavailableAgents.value = new Map(entries.filter((entry): entry is Unavailable => !entry.available).map((entry) => [entry.agent, entry]));
  } catch {
    // No answer is not a reason to block anything; see above.
  }
}

export function useAgentAvailability() {
  if (!requested) {
    requested = true;
    void loadAgentAvailability();
  }
  return { unavailableAgents };
}

/** Test seam: forget the cached answer so the next use fetches again. Not used by the app. */
export function resetAgentAvailability(): void {
  requested = false;
  unavailableAgents.value = new Map();
}

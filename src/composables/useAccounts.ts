// The Claude Code logins the launch form's ACCOUNT select may offer (common/accounts.ts).
//
// Fetched once and shared, exactly like useLaunchOptions.ts: a full grid mounts a dozen empty
// cells at the same moment, and each one wants the same list. `reloadAccounts` is for the
// settings screen, which is the only place the list can change.
import { ref } from "vue";
import type { AccountOption } from "../../common/accounts";
import { isRecord } from "../../common/isRecord";
import { isUnknownArray } from "../../common/isUnknownArray";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const isAccountOption = (row: unknown): row is AccountOption => isRecord(row) && typeof row.id === "string" && typeof row.label === "string";

const EMPTY: AccountOption[] = [];
const FETCH_TIMEOUT_MS = 8000;

const options = ref<AccountOption[]>(EMPTY);
let inFlight: Promise<void> | null = null;
// Same reasoning as useLaunchOptions.ts's `loaded`: a failed fetch must not count, or the picker
// would stay at "Default only" for the rest of the page session even after the server came back.
let loaded = false;

async function fetchAccounts(): Promise<void> {
  try {
    const res = await fetchWithTimeout("/api/accounts", undefined, FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`GET /api/accounts → ${res.status}`);
    const body = await jsonBody(res);
    if (!isUnknownArray(body.accounts)) throw new Error("GET /api/accounts → body is not { accounts }");
    options.value = body.accounts.filter(isAccountOption);
    loaded = true;
  } catch (err) {
    // Unreachable list => the ACCOUNT select still renders (requirement: it never gates on this
    // fetch), it just offers nothing beyond "Default" — every session already runs there.
    console.warn("[accounts] falling back to the host's default login:", err);
    options.value = EMPTY;
  } finally {
    inFlight = null;
  }
}

const startFetch = (): Promise<void> => {
  inFlight = fetchAccounts();
  return inFlight;
};

export function reloadAccounts(): Promise<void> {
  loaded = false;
  return startFetch();
}

export function useAccounts() {
  if (!loaded && !inFlight) void startFetch();
  return { accounts: options };
}

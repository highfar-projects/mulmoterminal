// Which server a part of the UI is about — this one, or a PEER (common/peers.ts). TerminalGrid provides
// it for the right pane; TerminalCell and LaunchPanel provide the server the launch form is starting
// on, so the form's lists (saved folders, past sessions, worktrees, suggestions) are that server's.
//
// Everything a pane shows about a cell is that server's: the files under its directory, the cards
// its agent drew, the tools it ran, the prompts it was typed. TerminalGrid provides the host of the
// cell each pane answers for; the panes, and the composables they call during setup, inject it and
// build every request and every pub/sub subscription on it (`peerApiPath`, `usePubSub(host)`).
//
// Injected rather than passed down as a prop because the files pane alone reaches it through a
// dozen modules and child components. A surface with no provider — the full-screen `/files` view, a
// spec mounting a pane on its own — reads null: this server, which is what it always meant.
import { computed, hasInjectionContext, inject, provide, type InjectionKey, type Ref } from "vue";
import { peerDirKey } from "../../common/peers";

const PANE_HOST: InjectionKey<Readonly<Ref<string | null>>> = Symbol("paneHost");

const THIS_SERVER = computed<string | null>(() => null);

export function providePaneHost(host: Readonly<Ref<string | null>>): void {
  provide(PANE_HOST, host);
}

// Outside a component's setup there is nothing to inject from, and `inject` would warn and answer
// `undefined` rather than the default — the composables are also called that way, from specs and
// from plain functions, and there they mean this server.
export function usePaneHost(): Readonly<Ref<string | null>> {
  return hasInjectionContext() ? inject(PANE_HOST, THIS_SERVER) : THIS_SERVER;
}

/** A pane's root as a `peerDirKey` on the pane's server — for the listings, which take it whole and
 *  decode it only where the request is built (useFilesTree's fetchListing), so the same path on two
 *  servers is two directories and two cache entries. Null while the pane has no root. */
export function usePaneDirKey(rootCwd: () => string | null): () => string | null {
  const host = usePaneHost();
  return () => {
    const dir = rootCwd();
    return dir === null ? null : peerDirKey(host.value, dir);
  };
}

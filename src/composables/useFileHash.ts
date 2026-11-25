// The Files tree's "Get SHA-256 hash" (fork-only): what the dialog shows while the server reads the
// file, and once it has. One file at a time — asking for another replaces the first, and closing the
// dialog stops waiting for an answer nobody will see.
import { onBeforeUnmount, ref } from "vue";
import { browseQuery, fetchSha256 } from "../components/filesPaneApi";

export type FileHashState =
  { status: "computing"; name: string } | { status: "done"; name: string; sha256: string; size: number } | { status: "error"; name: string; message: string };

const nameOf = (pathRel: string): string => pathRel.slice(pathRel.lastIndexOf("/") + 1) || pathRel;

export function useFileHash() {
  const shown = ref<FileHashState | null>(null);
  let pending: AbortController | null = null;

  function close(): void {
    pending?.abort();
    pending = null;
    shown.value = null;
  }

  /** Hash `pathRel` under `cwd` on `host` (null = this server). */
  async function open(cwd: string | null, pathRel: string, host: string | null): Promise<void> {
    close();
    const asked = new AbortController();
    pending = asked;
    const name = nameOf(pathRel);
    shown.value = { status: "computing", name };
    const outcome = await fetchSha256(browseQuery(cwd, pathRel), host, asked.signal);
    // Closed, or replaced by another file, while the server was reading this one.
    if (pending !== asked) return;
    pending = null;
    shown.value =
      outcome.status === "done" ? { status: "done", name, sha256: outcome.sha256, size: outcome.size } : { status: "error", name, message: outcome.message };
  }

  onBeforeUnmount(close);

  return { shown, open, close };
}

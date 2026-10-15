// What keeps a server started on another HOME away from the tmux sessions and drop files of the
// one running on the account's own home (#3039). Both names are machine-global — tmux's socket
// directory and os.tmpdir() do not follow HOME — so without this a second server sweeps the first
// one's sessions and rebinds its prefix.
//
// Empty for the account's own home so that the names every existing install uses stay as they are.
import { createHash } from "node:crypto";
import path from "node:path";

const SCOPE_HASH_HEX_CHARS = 8;

/** "" when `homeDir` is the account's own home (or that is unknown), else `-<hash>` naming it. */
export function homeScopeSuffix(homeDir: string, accountHomeDir: string | null): string {
  if (!accountHomeDir) return "";
  const resolvedHome = path.resolve(homeDir);
  if (resolvedHome === path.resolve(accountHomeDir)) return "";
  return `-${createHash("sha256").update(resolvedHome).digest("hex").slice(0, SCOPE_HASH_HEX_CHARS)}`;
}

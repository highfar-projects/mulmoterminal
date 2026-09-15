import type { Express, Request } from "express";
import { spawn } from "node:child_process";
import { resolveDirRequest } from "./dirRequest.js";
import { spawnFirstOpener, type Spawner } from "./spawnOpener.js";

export type { Spawner };

interface OpenDirOptions {
  isAllowedOrigin: (origin: string | undefined, remoteAddress: string | undefined) => boolean;
  spawner?: Spawner;
}

// POST /api/open-dir { path } — reveal an absolute, existing directory in the OS
// file manager. The server runs locally, so this is how a browser tab (which can't
// touch the filesystem) opens a folder. Guarded by the same-origin check used for
// the sockets so a random website can't drive it.
//
// It answers only once an opener has actually STARTED. It used to answer `{ok:true}` first and
// log the failure to a console the user never sees, so a host without `xdg-open` reported success
// and revealed nothing (#1447).
export function mountOpenDirRoute(app: Express, { isAllowedOrigin, spawner = spawn }: OpenDirOptions) {
  app.post("/api/open-dir", async (req: Request, res) => {
    const dir = resolveDirRequest(req, res, isAllowedOrigin);
    if (!dir) return;
    // The directory and nothing else. `reveal` is the route that has an argv to build, because it
    // has a FILE to select inside its folder (reveal-argv.ts); opening a folder is the same call on
    // every platform.
    const failed = await spawnFirstOpener(dir, (_cmd, target) => [target], spawner);
    if (failed === null) return res.json({ ok: true });
    res.status(500).json({ error: `could not open ${dir} [${failed}]` });
  });
}

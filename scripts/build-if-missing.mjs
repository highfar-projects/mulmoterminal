// `prepare`: build the web UI when there is none, so the fork can be started straight from GitHub.
//
// `npx github:highfar-projects/mulmoterminal` installs from a git clone, and npm runs only `prepare`
// there — not `prepack`, which is where the build lives for an npm publish. Without this the
// installed package has no `dist/`, and the server comes up with nothing to serve.
//
// Skipped when `dist/index.html` is already there, so a checkout's own `yarn install` does not
// rebuild on every run; `yarn dev` serves from Vite and never reads `dist/` anyway. `vite build`
// alone, not `yarn build`: the type check adds minutes to a first start and changes nothing that
// ships.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (existsSync(path.join(ROOT, "dist", "index.html"))) process.exit(0);

// Vite's own bin through this node, rather than `npx vite`: no shell, and no dependence on which
// `npx` is first on PATH (Volta, a Windows `.cmd` shim).
const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
if (!existsSync(viteBin)) {
  console.error("[prepare] vite is not installed, so the web UI cannot be built");
  process.exit(1);
}
const result = spawnSync(process.execPath, [viteBin, "build"], { cwd: ROOT, stdio: "inherit" });
process.exit(result.status ?? 1);

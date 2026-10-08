// Whether mulmocast can render a `remotion` beat on this machine. Its packages are optional peers of
// mulmocast that a user installs only if they want it — usually into ~/node_modules, since an npx
// entry is replaced on every release — so the question is asked FROM mulmocast's own location, the
// way its pre-flight does, rather than from this package.

import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const GUIDE_URL = "https://receptron.github.io/mulmoterminal/guide/en/mulmocast.html#remotion";
const WHY = "Remotion scenes in MulmoCast videos";

/** A resolver answering from where mulmocast is installed, or null when mulmocast is not found. */
export function resolverFromMulmocast(pkgDir) {
  try {
    const mulmocastEntry = createRequire(join(pkgDir, "package.json")).resolve("mulmocast");
    const fromMulmocast = createRequire(mulmocastEntry);
    // A package that hides its package.json behind `exports` (three does) is installed; any other
    // failure — a malformed package.json included — is reported, since this check is a diagnosis.
    return (name) => {
      try {
        fromMulmocast.resolve(`${name}/package.json`);
        return true;
      } catch (error) {
        return error instanceof Error && "code" in error && error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED";
      }
    };
  } catch {
    return null;
  }
}

/** mulmocast's own list of what a remotion beat needs, or null when mulmocast or that export is missing. */
export async function remotionPackagesFromMulmocast(pkgDir) {
  try {
    const entry = createRequire(join(pkgDir, "package.json")).resolve("mulmocast/remotion");
    const { REMOTION_PACKAGES } = await import(pathToFileURL(entry).href);
    return Array.isArray(REMOTION_PACKAGES) && REMOTION_PACKAGES.every((name) => typeof name === "string") ? REMOTION_PACKAGES : null;
  } catch {
    return null;
  }
}

export function missingRemotionPackages(packages, isResolvable) {
  return packages.filter((name) => !isResolvable(name));
}

export function remotionCheckLine(missing, total) {
  if (missing.length === 0) return `  ✓ remotion — ${WHY}`;
  const head =
    missing.length === total ? `  ○ remotion — optional (${WHY})` : `  ○ remotion — optional (${WHY}), installed only in part; missing: ${missing.join(", ")}`;
  return `${head}\n      → ${GUIDE_URL}`;
}

/** The `init` line for remotion, or null when mulmocast cannot be asked. */
export async function remotionCheck(pkgDir) {
  const isResolvable = resolverFromMulmocast(pkgDir);
  const packages = await remotionPackagesFromMulmocast(pkgDir);
  if (!isResolvable || !packages) return null;
  return remotionCheckLine(missingRemotionPackages(packages, isResolvable), packages.length);
}

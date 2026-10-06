// Whether mulmocast can render a `remotion` beat on this machine. Its packages are optional peers of
// mulmocast that a user installs only if they want it — usually into ~/node_modules, since an npx
// entry is replaced on every release — so the question is asked FROM mulmocast's own location, the
// way its pre-flight does, rather than from this package.

import { createRequire } from "node:module";
import { join } from "node:path";

// A copy of REMOTION_PACKAGES in mulmocast's lib/utils/remotion/packages.js, which the package does
// not export. A spec pins the two together.
export const REMOTION_PACKAGES = [
  "remotion",
  "@remotion/bundler",
  "@remotion/renderer",
  "react",
  "react-dom",
  "@remotion/three",
  "three",
  "@react-three/fiber",
  "@remotion/effects",
  "@remotion/paths",
  "@remotion/noise",
  "@remotion/shapes",
  "@remotion/transitions",
  "@remotion/motion-blur",
  "@remotion/layout-utils",
];

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

export function missingRemotionPackages(isResolvable) {
  return REMOTION_PACKAGES.filter((name) => !isResolvable(name));
}

export function remotionCheckLine(missing) {
  if (missing.length === 0) return `  ✓ remotion — ${WHY}`;
  const head =
    missing.length === REMOTION_PACKAGES.length
      ? `  ○ remotion — optional (${WHY})`
      : `  ○ remotion — optional (${WHY}), installed only in part; missing: ${missing.join(", ")}`;
  return `${head}\n      → ${GUIDE_URL}`;
}

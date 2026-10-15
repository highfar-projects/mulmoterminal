// Whether mulmocast can render a talking avatar on this machine. Like Remotion's, its packages are
// optional peers of mulmocast that a user installs only to use them — into ~/node_modules, since an
// npx entry is replaced on every release — so they are looked for from mulmocast's own location.

import { missingRemotionPackages, optionalPackagesLine, resolverFromMulmocast } from "./remotion-check.js";

/** What an avatar needs, as mulmocast's own install hint names it (it exports no list of its own). */
export const AVATAR_PACKAGES = ["avatarscript", "onnxruntime-node"];

const AVATAR = {
  label: "avatar",
  why: "talking avatars in MulmoCast videos",
  guideUrl: "https://receptron.github.io/mulmoterminal/guide/en/mulmocast.html#avatar",
};

export function avatarCheckLine(missing) {
  return optionalPackagesLine(AVATAR, missing, AVATAR_PACKAGES.length);
}

/** The `init` line for avatars, or null when mulmocast cannot be found. */
export function avatarCheck(pkgDir) {
  const isResolvable = resolverFromMulmocast(pkgDir);
  if (!isResolvable) return null;
  return avatarCheckLine(missingRemotionPackages(AVATAR_PACKAGES, isResolvable));
}

// How to upgrade THIS Node, worked out from where it is installed (#2351).
//
// "Install the LTS from nodejs.org" is wrong advice for most people who hit the version gate: a
// Node that came from a version manager is shadowed by it, so a fresh installer leaves `node` on
// PATH exactly as old as before. The binary's own path says which tool put it there.
//
// Every command below was checked against that tool's own help or README. A tool whose upgrade
// command could not be confirmed gets no command — its readers still get the download link.

export const NODE_DOWNLOAD_URL = "https://nodejs.org/en/download";

// fnm's `default` takes a version, and it has no documented name for "the latest LTS".
// Any major at or above the minimum works; this one was the Active LTS when written.
const SUGGESTED_NODE_MAJOR = 24;

const toMatchable = (execPath) => execPath.replaceAll("\\", "/").toLowerCase();

const startsWithPath = (path, prefix) => typeof prefix === "string" && prefix !== "" && path.startsWith(toMatchable(prefix));

const guide = (via, commands) => ({ via, commands });

function versionManagerGuide(path) {
  if (path.includes("/.nodebrew/")) return guide("nodebrew", ["nodebrew install stable", "nodebrew use stable"]);
  if (path.includes("/.nvm/versions/node/")) return guide("nvm", ["nvm install --lts", "nvm alias default 'lts/*'"]);
  if (path.includes("volta/tools/image/node/")) return guide("Volta", ["volta install node"]);
  if (path.includes("/fnm/") || path.includes("/fnm_multishells/")) {
    return guide("fnm", [`fnm install ${SUGGESTED_NODE_MAJOR}`, `fnm default ${SUGGESTED_NODE_MAJOR}`]);
  }
  if (path.includes("/mise/installs/node/")) return guide("mise", ["mise use -g node@lts"]);
  if (path.includes("/.asdf/installs/nodejs/")) return guide("asdf", ["asdf install nodejs latest", "asdf set -u nodejs $(asdf latest nodejs)"]);
  return null;
}

function packageManagerGuide(path) {
  const scoopApp = /\/scoop\/apps\/([^/]+)\//.exec(path)?.[1];
  if (scoopApp) return guide("Scoop", [`scoop update ${scoopApp}`]);
  // Homebrew resolves `node` to its keg, so the formula is in the path: `node`, or a pinned `node@20`.
  const formula = /\/cellar\/(node|node@\d+)\//.exec(path)?.[1];
  if (formula === "node") return guide("Homebrew", ["brew upgrade node"]);
  if (formula) return guide(`Homebrew (${formula})`, [`brew unlink ${formula}`, "brew install node"]);
  return null;
}

// nvm-windows points one fixed symlink (NVM_SYMLINK, by default C:\Program Files\nodejs — the
// installer's own directory) at the active version, so only its environment tells the two apart.
function nvmWindowsGuide(path, env) {
  if (!startsWithPath(path, env.NVM_SYMLINK) && !startsWithPath(path, env.NVM_HOME)) return null;
  return guide("nvm-windows", ["nvm install lts", "nvm use lts"]);
}

function installerGuide(path, platform) {
  if (platform === "win32") return guide("the Windows installer", []);
  if (platform === "darwin" && path === "/usr/local/bin/node") return guide("the macOS installer from nodejs.org", []);
  if (platform === "linux" && path === "/usr/bin/node") return guide("your system's package manager", []);
  return guide(null, []);
}

/**
 * How the running Node was installed, and the commands that upgrade it there.
 *
 * `via` is null when the path matches nothing known; `commands` is empty when the only honest
 * advice is the download page.
 */
export function nodeUpgradeGuide(execPath, platform, env) {
  const path = toMatchable(execPath);
  return (platform === "win32" ? nvmWindowsGuide(path, env) : null) ?? versionManagerGuide(path) ?? packageManagerGuide(path) ?? installerGuide(path, platform);
}

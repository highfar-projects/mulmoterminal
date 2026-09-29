// Whether this machine's Node and Claude Code are behind the published releases, and what `init`
// says about it (#2477). Pure: the releases, the local versions and the binary path are handed in
// by bin/check-versions.js, so every decision here is testable without the network.
import { NODE_DOWNLOAD_URL } from "./node-install.js";
import { isNewerVersion } from "./update-check.js";

export const CURRENT = { kind: "current" };
export const UNKNOWN = { kind: "unknown" };

const stripV = (version) => String(version).replace(/^v/, "");
const majorOf = (version) => Number.parseInt(stripV(version).split(".")[0], 10);
const newestOf = (versions) => versions.reduce((newest, version) => (isNewerVersion(version, newest) ? version : newest));
// Remote strings are printed as-is, so only a plain x.y.z is accepted — anything else would compare
// as zeros (and read as current) or put the registry's text on the user's terminal.
const isPlainVersion = (version) => typeof version === "string" && /^v?\d+\.\d+\.\d+$/.test(version);
const isRelease = (entry) => typeof entry === "object" && entry !== null && isPlainVersion(entry.version);

/**
 * Node against the LTS releases in nodejs.org's index.json.
 *
 * The target is the newest LTS of the same major: moving someone off a working 22.x because 24.x
 * exists is not this check's call. A major with no LTS release is compared with the newest LTS,
 * unless it is newer than that one — a Current release is not behind anything.
 */
export function nodeDrift(localVersion, releases) {
  if (!Array.isArray(releases) || Number.isNaN(majorOf(localVersion))) return UNKNOWN;
  const ltsVersions = releases.filter((entry) => isRelease(entry) && entry.lts).map((entry) => stripV(entry.version));
  if (ltsVersions.length === 0) return UNKNOWN;
  const sameMajor = ltsVersions.filter((version) => majorOf(version) === majorOf(localVersion));
  const newestLts = newestOf(ltsVersions);
  if (sameMajor.length === 0 && majorOf(localVersion) > majorOf(newestLts)) return CURRENT;
  const target = sameMajor.length > 0 ? newestOf(sameMajor) : newestLts;
  return isNewerVersion(target, stripV(localVersion)) ? { kind: "behind", latest: target, sameMajor: sameMajor.length > 0 } : CURRENT;
}

/** Claude Code against the npm `stable` dist-tag. Ahead of `stable` (on `latest`) is current. */
export function claudeDrift(localVersion, stableVersion) {
  if (typeof localVersion !== "string" || !isPlainVersion(stableVersion)) return UNKNOWN;
  return isNewerVersion(stableVersion, localVersion) ? { kind: "behind", latest: stableVersion } : CURRENT;
}

/** `claude --version` prints `2.1.284 (Claude Code)`; anything without a leading version is null. */
export function parseClaudeVersion(stdout) {
  return /^\s*(\d+\.\d+\.\d+)/.exec(String(stdout ?? ""))?.[1] ?? null;
}

export const CLAUDE_UPDATE_NATIVE = "claude update";
export const CLAUDE_UPDATE_NPM = "npm install -g @anthropic-ai/claude-code@latest";

/**
 * How to update the Claude Code at `realPath`. Only the two layouts checked on a real machine get a
 * single command; anything else gets both, as the server's own "too old" message does.
 */
export function claudeUpdateCommands(realPath) {
  const path = String(realPath ?? "").replaceAll("\\", "/");
  if (path.includes("/node_modules/@anthropic-ai/claude-code/")) return [CLAUDE_UPDATE_NPM];
  if (path.includes("/.local/share/claude/")) return [CLAUDE_UPDATE_NATIVE];
  return [CLAUDE_UPDATE_NATIVE, `${CLAUDE_UPDATE_NPM}   (if you installed it with npm)`];
}

const HINT = "      → ";
const COMMAND = "          ";

function updateLines(headline, commands, fallback, via = null) {
  if (commands.length === 0) return [`${HINT}${headline} Update: ${fallback}`];
  const withTool = via ? " with " + via : "";
  return [`${HINT}${headline} To update${withTool}:`, ...commands.map((command) => `${COMMAND}${command}`)];
}

/**
 * The lines printed under `✓ Node …`; empty when there is nothing to say. The commands are the
 * install tool's own upgrade (`nodeUpgradeGuide`), which may land on a newer major than the one
 * named — so the tool is named too.
 */
export function nodeDriftLines(drift, upgrade) {
  if (drift.kind === "unknown") return [`${HINT}○ could not check for a newer Node (offline?)`];
  if (drift.kind !== "behind") return [];
  const headline = drift.sameMajor ? `Node ${drift.latest} is out (latest ${majorOf(drift.latest)}.x LTS).` : `Node ${drift.latest} is the latest LTS.`;
  return updateLines(headline, upgrade.commands, NODE_DOWNLOAD_URL, upgrade.via);
}

/** The lines printed under `✓ Claude Code CLI`; empty when there is nothing to say. */
export function claudeDriftLines(drift, localVersion, updateCommands) {
  if (localVersion === null) return [`${HINT}○ could not read the Claude Code version`];
  if (drift.kind === "unknown") return [`${HINT}○ could not check for a newer Claude Code (offline?)`];
  if (drift.kind !== "behind") return [];
  return updateLines(`Claude Code ${localVersion} is older than the stable release ${drift.latest}.`, updateCommands, CLAUDE_UPDATE_NATIVE);
}

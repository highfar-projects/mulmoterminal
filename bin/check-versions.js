// The network and process half of `init`'s version check (#2477); the decisions are in
// bin/version-drift.js. Every probe resolves null on failure — `init` must finish offline.
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { extensionsFor, namesAPath, realProbe, searchDirectories } from "./has-command.js";
import { nodeUpgradeGuide } from "./node-install.js";
import { claudeDrift, claudeDriftLines, claudeUpdateCommands, nodeDrift, nodeDriftLines, parseClaudeVersion } from "./version-drift.js";

export const NODE_RELEASES_URL = "https://nodejs.org/dist/index.json";
const REGISTRY = (process.env.npm_config_registry || "https://registry.npmjs.org").replace(/\/$/, "");
export const CLAUDE_DIST_TAGS_URL = `${REGISTRY}/-/package/@anthropic-ai/claude-code/dist-tags`;

const FETCH_TIMEOUT_MS = 4000;
// `claude --version` starts the whole CLI, which is slower than a fetch on a cold disk.
const CLAUDE_VERSION_TIMEOUT_MS = 8000;

async function fetchJson(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: "application/json" } });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export const fetchNodeReleases = () => fetchJson(NODE_RELEASES_URL);

export async function fetchClaudeStable() {
  const distTags = await fetchJson(CLAUDE_DIST_TAGS_URL);
  return typeof distTags?.stable === "string" ? distTags.stable : null;
}

/**
 * Where `cmd` lives, symlinks followed, or null — searched with the start-up gate's own PATH rules
 * (bin/has-command.js). Only picks the update command, never gates.
 */
export function resolveCommandPath(cmd, env = process.env, platform = process.platform) {
  const join = platform === "win32" ? path.win32.join : path.posix.join;
  const candidates = namesAPath(cmd) ? [cmd] : searchDirectories(platform, env).flatMap((dir) => extensionsFor(platform).map((ext) => join(dir, cmd + ext)));
  const found = candidates.find((candidate) => realProbe.isFile(candidate) && (platform === "win32" || realProbe.isExecutable(candidate)));
  if (found === undefined) return null;
  try {
    return realpathSync(found);
  } catch {
    return found;
  }
}

export function readClaudeVersion(binaryPath) {
  return new Promise((resolve) => {
    execFile(binaryPath, ["--version"], { timeout: CLAUDE_VERSION_TIMEOUT_MS }, (error, stdout) => resolve(error ? null : parseClaudeVersion(stdout)));
  });
}

async function claudeLines(claudeBin) {
  const binaryPath = resolveCommandPath(claudeBin);
  const [localVersion, stable] = await Promise.all([binaryPath ? readClaudeVersion(binaryPath) : null, fetchClaudeStable()]);
  return claudeDriftLines(claudeDrift(localVersion, stable), localVersion, claudeUpdateCommands(binaryPath));
}

async function nodeLines() {
  const releases = await fetchNodeReleases();
  return nodeDriftLines(nodeDrift(process.versions.node, releases), nodeUpgradeGuide(process.execPath, process.platform, process.env));
}

/** The hint lines `init` prints under its Node and Claude Code checks. */
export async function checkVersions({ claudeBin }) {
  const [node, claude] = await Promise.all([nodeLines(), claudeBin ? claudeLines(claudeBin) : []]);
  return { node, claude };
}

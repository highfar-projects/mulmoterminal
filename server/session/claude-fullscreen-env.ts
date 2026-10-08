// The renderer opt-out for one claude spawn (#2808), read from the settings files that session's
// Claude Code will read. The decision is claude-fullscreen.ts; this only gathers its inputs.
import fs from "node:fs";
import path from "node:path";
import { claudeSettingsFiles, rendererOptOutEnv } from "./claude-fullscreen.js";
import { sessionHome } from "./session-home.js";

// A settings file is a few KB of hand-written JSON; a missing or unreadable one decides nothing.
const readSettingsText = (file: string): string | null => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

export function claudeRendererEnv(sessionId: string, cwd: string): Record<string, string> {
  const files = claudeSettingsFiles(sessionHome("claude", sessionId), cwd, path.join);
  return rendererOptOutEnv(files.map(readSettingsText), process.env);
}

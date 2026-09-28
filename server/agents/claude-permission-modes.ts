// Whether this Claude Code accepts the --permission-mode a cell is started with (#2352).
//
// A version too old for `auto` rejects our own flag and exits with commander's argument error,
// which says nothing about updating. The binary's `--help` lists the modes it accepts, so the
// question is asked of the binary rather than of a version table nobody can source.

// The option's own line, not a mention of it inside another option's description.
const OPTION_LINE = /^[ \t]*--permission-mode\b/m;
const NEXT_OPTION = /\n[ \t]+--?[a-zA-Z]/;

/**
 * The `--permission-mode` choices printed by `claude --help`, or null when they cannot be read.
 *
 * Two real shapes: older versions put `(choices: "a", "b")` on the option's own line, current ones
 * wrap the list over several lines. The option's description runs until the next option line.
 */
export function permissionModeChoices(helpText: string): string[] | null {
  const start = helpText.search(OPTION_LINE);
  if (start === -1) return null;
  const rest = helpText.slice(start);
  const end = rest.search(NEXT_OPTION);
  const description = end === -1 ? rest : rest.slice(0, end);
  const listStart = description.indexOf("choices:");
  if (listStart === -1) return null;
  const listEnd = description.indexOf(")", listStart);
  const list = listEnd === -1 ? description.slice(listStart) : description.slice(listStart, listEnd);
  const choices = [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]).filter((choice): choice is string => typeof choice === "string");
  return choices.length > 0 ? choices : null;
}

const UPDATE_ADVICE =
  "Update it with `claude update` (or `npm install -g @anthropic-ai/claude-code@latest` if you installed it with npm), then open the cell again.";

/**
 * The line the cell shows instead of starting, or null when the mode is accepted or the choices
 * are unknown — an unreadable help text must never stop a cell that would have worked.
 */
export function permissionModeRefusal(mode: string, choices: readonly string[] | null, claudeBin: string): string | null {
  if (choices === null || choices.includes(mode)) return null;
  const accepted = `it accepts ${choices.join(", ")}`;
  if (mode === "auto") {
    return `This Claude Code (\`${claudeBin}\`) is too old: it does not support \`--permission-mode auto\`, which MulmoTerminal starts it with (${accepted}). ${UPDATE_ADVICE}`;
  }
  return `This Claude Code (\`${claudeBin}\`) does not support \`--permission-mode ${mode}\` (${accepted}). Set CLAUDE_PERMISSION_MODE to one of those, or update Claude Code if \`${mode}\` is newer than it.`;
}

// Making a value, or an executable path, survive a shell that will parse the string AGAIN.
// Beside cmd-escape.ts, which does the same job for cmd.exe's very different rules. One
// definition each: a quoting rule that exists twice is a quoting rule that gets fixed once.

/** POSIX/PowerShell single-arg quoting, so a substituted ${branch}/${repo}/${task} can't break out
 *  of the command string. POSIX closes the quote, escapes the literal quote, reopens; PowerShell
 *  doubles quotes. */
export function shellQuoteFor(platform: NodeJS.Platform): (value: string) => string {
  if (platform === "win32") return (value) => `'${value.replace(/'/g, "''")}'`;
  return (value) => `'${value.replace(/'/g, "'\\''")}'`;
}

/** A command string that RUNS the program at `execPath`, for a shell that parses the string.
 *
 *  On PowerShell, quoting alone is not enough and it fails SILENTLY: `'C:\Program Files\…\x.exe'`
 *  is a string expression, so the path is echoed and nothing starts — a terminal that opens onto
 *  no shell, which reads as a hang rather than an error. The call operator `&` is what executes
 *  it. Left unquoted it splits at the first space instead (#1717).
 *
 *  Applied unconditionally, never only when the path "looks like it needs it": deciding from the
 *  text is the guess this repo refuses elsewhere, and `& 'x.exe'` is correct for a path with no
 *  space too. */
export function runExecutableCommand(execPath: string, platform: NodeJS.Platform): string {
  const quoted = shellQuoteFor(platform)(execPath);
  return platform === "win32" ? `& ${quoted}` : quoted;
}

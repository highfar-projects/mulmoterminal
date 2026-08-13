// In a file of its own so the `sonarjs/deprecation` exception in eslint.config.js can name THIS
// call. It used to sit in a composable of several hundred lines, and an exception that wide also
// covers the next deprecated API somebody reaches for in there by accident.

// Put the terminal's selection on the system clipboard, by whichever route the browser allows.
//
// `navigator.clipboard` is the direct one, but it is secure-context-only: at `http://<lan-ip>` it
// does not exist AT ALL, and reaching this app that way from a second machine is ordinary. The
// fallback hands the job back to xterm — with its helper textarea focused, `execCommand("copy")`
// fires xterm's own `copy` listener, which writes THE CURRENT SELECTION.
//
// Which is why this takes the terminal's host and not merely a string: it can only ever copy what
// the terminal has selected, and must not be generalised into "write this text to the clipboard".
export async function writeTerminalSelection(host: HTMLDivElement, text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // document not focused, or permission refused — fall through instead of giving up
    }
  }
  // Focus is NOT taken here. Reaching this line means the user just dragged inside this terminal,
  // so xterm has already focused its textarea; if something else holds focus by now, stealing it
  // back would be worse than not copying.
  const textarea = host.querySelector(".xterm-helper-textarea");
  if (!textarea || document.activeElement !== textarea) return false;
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

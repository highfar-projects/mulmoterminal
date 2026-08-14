// The three calls the sandbox eats, found in a view's CODE and nowhere else.
//
// Every view renders in `sandbox="allow-scripts"` with no `allow-modals`, so the browser IGNORES
// `alert` / `confirm` / `prompt`: nothing is shown, nothing throws, and `confirm` returns `false`.
// A page that asks for a name with `prompt` submits an empty one; a withdrawal behind
// `if (!confirm(…)) return;` is a button that does nothing. The only sign is a console line the
// author has to be looking at, so publish refuses it — see `publicView.ts`.
//
// Its own module because reading a page for this is not one expression, and both directions of
// being wrong are expensive:
//
//   A MISS ships a page that fails silently, which is the whole point of the gate. A regex over
//   the raw HTML misses `window?.prompt(…)`, `self["confirm"](…)`, and — the one that bites in
//   real files — anything after a `//` inside a string, because `const cdn = "//cdn.example"`
//   swallows the rest of a minified line.
//
//   A FALSE ALARM refuses a page that works, and the author cannot act on it: `<p>alert() は
//   使えません</p>` is prose, and `const label = "confirm("` is a string. Both would be refused by
//   a pattern that reads the document rather than the code.
//
// So the page is narrowed to its script text, and the script text is walked with strings and
// comments removed, before anything is matched. It is a scanner rather than a parser: what it
// cannot see is a call built out of pieces (`window["pro" + "mpt"]`), which is not the mistake
// this is about — the gate is a help to an author, not a boundary against one.

/** Where code lives in a page. All three RUN, and the sandbox eats a modal in each of them
 *  identically — an `onclick` and a `javascript:` href are as executable as a `<script>`, and a
 *  gate that reads only the third would pass the other two straight through. */
const SCRIPT_BODY = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
// An attribute value may be quoted either way OR bare — `<button onclick=prompt()>` is valid HTML
// and runs, so an extractor that insists on quotes reads a working call as no code at all.
const INLINE_HANDLER = /\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const JAVASCRIPT_URL = /=\s*(?:"\s*javascript:([^"]*)"|'\s*javascript:([^']*)'|javascript:([^\s"'>]+))/gi;

const scriptsOf = (html: string): string[] => [
  ...[...html.matchAll(SCRIPT_BODY)].map((hit) => hit[1] ?? ""),
  ...[...html.matchAll(INLINE_HANDLER)].map((hit) => hit[1] ?? hit[2] ?? hit[3] ?? ""),
  ...[...html.matchAll(JAVASCRIPT_URL)].map((hit) => hit[1] ?? hit[2] ?? hit[3] ?? ""),
];

/** What the walker is in the middle of. `code` is the only state that reaches the match. */
type Mode = "code" | "line" | "block" | "'" | '"' | "`";

const OPENS: Record<string, Mode> = { "'": "'", '"': '"', "`": "`" };

/** One character's worth of walking: what to emit, where it leaves the walker, and whether the
 *  character after it was consumed too — the two-character markers that open and close a
 *  comment. */
interface Step {
  mode: Mode;
  emit: string;
  skip: boolean;
}

/** One character of ordinary code: what it emits, and what it puts the walker into. */
const inCode = (ch: string, next: string): Step => {
  if (ch === "/" && next === "/") return { mode: "line", emit: " ", skip: true };
  if (ch === "/" && next === "*") return { mode: "block", emit: " ", skip: true };
  const opened = OPENS[ch];
  // A string's CONTENT is dropped and its quotes are not: `"confirm("` must not become a call,
  // and `foo("x")` must keep its parentheses balanced for a reader.
  if (opened !== undefined) return { mode: opened, emit: " ", skip: false };
  return { mode: "code", emit: ch, skip: false };
};

/** One character inside a comment or a string: only its END matters. */
const inside = (mode: Mode, ch: string, next: string): { mode: Mode; skip: boolean } => {
  if (mode === "line") return { mode: ch === "\n" ? "code" : "line", skip: false };
  if (mode === "block") return ch === "*" && next === "/" ? { mode: "code", skip: true } : { mode: "block", skip: false };
  return { mode: ch === mode ? "code" : mode, skip: false };
};

/** The script with comments and string contents taken out, so what is left is code.
 *
 *  A template literal is treated as one string, `${…}` included: a modal call inside a
 *  substitution is missed. Said rather than fixed — an author writing `${prompt("x")}` is not the
 *  case this gate was built for, and a full expression parser here would be its own bug surface. */
const bare = (source: string): string => {
  let out = "";
  let mode: Mode = "code";
  let index = 0;
  while (index < source.length) {
    const ch = source[index] ?? "";
    const next = source[index + 1] ?? "";
    // An escape inside a string hides whatever follows it, quote included.
    if (mode !== "code" && mode !== "line" && mode !== "block" && ch === "\\") {
      index += 2;
      continue;
    }
    const step: Step = mode === "code" ? inCode(ch, next) : { ...inside(mode, ch, next), emit: " " };
    out += step.emit;
    mode = step.mode;
    index += step.skip ? 2 : 1;
  }
  return out;
};

/** `self["confirm"]`, `window?.prompt` and `prompt?.(…)` reach the same globals, so they are written as the plain
 *  member access — and the plain call — before anything else happens. Done on the RAW script
 *  because the bracket form carries the name in a string, which the walker above is about to
 *  remove.
 *
 *  The optional CALL is its own replacement and must come first: `prompt?.(` left to the property
 *  rule becomes `prompt.(`, which matches nothing and so reads as no call at all. */
const asMemberAccess = (source: string): string =>
  source
    .replace(/\[\s*(["'])(alert|confirm|prompt)\1\s*\]/g, ".$2")
    .replace(/\?\s*\.\s*\(/g, "(")
    .replace(/\?\s*\./g, ".");

/** The receivers that ARE the global. Dropped so the one pattern below sees a bare call, while a
 *  receiver of the author's own (`ui.alert`, `this.confirm`) keeps its dot and is left alone. */
const GLOBAL_RECEIVER = /\b(?:window|self|globalThis|top) ?\. ?/g;

const CALL = /(?<![\w.$])(alert|confirm|prompt) ?\(/;

/** The name of the first modal call in this page's code, or null. */
export const modalCallIn = (html: string): string | null => {
  for (const script of scriptsOf(html)) {
    const code = bare(asMemberAccess(script)).replace(/\s+/g, " ").replace(GLOBAL_RECEIVER, "");
    const call = CALL.exec(code);
    if (call !== null) return call[1] ?? null;
  }
  return null;
};

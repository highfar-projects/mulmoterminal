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
// comments removed — a template literal's `${…}` kept, because that is code — before anything is
// matched. It is a scanner rather than a parser: what it cannot see is a call built out of pieces
// (`window["pro" + "mpt"]`), which is not the mistake this is about — the gate is a help to an
// author, not a boundary against one.

/** Where code lives in a page. All three RUN, and the sandbox eats a modal in each of them
 *  identically — an `onclick` and a `javascript:` href are as executable as a `<script>`, and a
 *  gate that reads only the third would pass the other two straight through. */
const SCRIPT_BODY = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
// Attributes are read out of START TAGS, and out of a document the scripts have been taken out of
// — not off the raw page. `<script>const sample = "<button onclick=alert()>";</script>` is a
// STRING that draws nothing and calls nothing, and reading the whole document for attribute-shaped
// text refuses that page; so does prose that happens to say `onclick=alert()`. A refusal an author
// cannot act on is the more expensive way for this gate to be wrong.
//
const TAG_NAME = /<[a-z][a-z0-9-]*/gi;
// An attribute value may be quoted either way OR bare — `<button onclick=prompt()>` is valid HTML
// and runs, so an extractor that insists on quotes reads a working call as no code at all.
const ATTRIBUTE = /\s([a-z][a-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

/** A named reference worth the table: the ones a page actually contains. Anything else is left as
 *  written — an unknown name decodes to itself, which can only cost a miss, never a false alarm. */
const NAMED_REFERENCE: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", Tab: "\t", NewLine: "\n" };

/** An attribute value as the BROWSER sees it.
 *
 *  Character references are decoded in attributes before the value is compiled as a handler or
 *  followed as a URL, so `onclick="prom&#112;t('x')"` runs `prompt` and
 *  `href="java&#x73;cript:confirm('x')"` is a `javascript:` URL. Reading the raw text finds
 *  neither. A `<script>` BODY is the opposite — its content is raw text and is NOT decoded — which
 *  is why this is applied to attributes only.
 *
 *  The semicolon is optional for a numeric reference because browsers accept it that way in an
 *  attribute, and being permissive here can only find more code, not less. */
const decoded = (value: string): string =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (whole: string, body: string): string => {
    if (!body.startsWith("#")) return NAMED_REFERENCE[body] ?? whole;
    const code = body.startsWith("#x") || body.startsWith("#X") ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });

/** The code an attribute carries: an `on*` handler's body, or what follows `javascript:` in a URL.
 *  Decided AFTER decoding, since the scheme itself can be written `java&#x73;cript:`. */
const attributeCode = (name: string, raw: string): string | null => {
  const value = decoded(raw);
  if (name.startsWith("on")) return value;
  const url = value.trimStart();
  return /^javascript:/i.test(url) ? url.slice(url.indexOf(":") + 1) : null;
};

/** A tag's attributes, from just after its name to the `>` that ends it.
 *
 *  Walked rather than matched: a quoted value may carry a `>` (`onclick="if (a > b) prompt()"`),
 *  and the regex that says so — quoted-or-not, repeated — is the shape a linter reads as
 *  exponential backtracking. Reading to the first `>` regardless would cut that handler in half
 *  and lose the call after it. */
const attributeRegion = (markup: string, from: number): string => {
  let quote = "";
  let index = from;
  while (index < markup.length) {
    const ch = markup[index] ?? "";
    if (quote !== "") quote = ch === quote ? "" : quote;
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ">") return markup.slice(from, index);
    index += 1;
  }
  return markup.slice(from);
};

/** Every attribute of every start tag in the markup — the scripts already removed. */
const attributesOf = (markup: string): string[] =>
  [...markup.matchAll(TAG_NAME)]
    .map((tag) => attributeRegion(markup, tag.index + tag[0].length))
    .flatMap((region) => [...region.matchAll(ATTRIBUTE)])
    .map((hit) => attributeCode(hit[1] ?? "", hit[2] ?? hit[3] ?? hit[4] ?? ""))
    .filter((code): code is string => code !== null);

const scriptsOf = (html: string): string[] => [...[...html.matchAll(SCRIPT_BODY)].map((hit) => hit[1] ?? ""), ...attributesOf(html.replace(SCRIPT_BODY, " "))];

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

/** A `${…}` inside a template literal: it is CODE, not text, and the walker has to come back out
 *  of it into the template afterwards. `subs` holds one brace depth per substitution we are inside
 *  of, innermost last — a template inside a substitution inside a template is ordinary enough in a
 *  page that builds markup, and one counter could not tell those levels apart. */
interface Exit {
  /** Where the substitution ended, or null while it continues. */
  mode: Mode | null;
  subs: number[];
}

const inSubstitution = (ch: string, subs: number[]): Exit => {
  if (subs.length === 0) return { mode: null, subs };
  const depth = subs[subs.length - 1] ?? 0;
  if (ch === "{") return { mode: null, subs: [...subs.slice(0, -1), depth + 1] };
  if (ch !== "}") return { mode: null, subs };
  // The `}` that closes the substitution itself, rather than an object literal inside it.
  if (depth === 0) return { mode: "`", subs: subs.slice(0, -1) };
  return { mode: null, subs: [...subs.slice(0, -1), depth - 1] };
};

/** The script with comments and string contents taken out, so what is left is code.
 *
 *  A template literal's TEXT goes the way of any other string, but its `${…}` does not: building
 *  markup out of a substitution is ordinary, and `` `${prompt("name")}` `` calls the same
 *  sandbox-disabled global as a bare `prompt(…)`. Dropping the whole literal would read that as no
 *  code at all. */
const bare = (source: string): string => {
  let out = "";
  let mode: Mode = "code";
  let subs: number[] = [];
  let index = 0;
  while (index < source.length) {
    const ch = source[index] ?? "";
    const next = source[index + 1] ?? "";
    // An escape inside a string hides whatever follows it, quote included.
    if (mode !== "code" && mode !== "line" && mode !== "block" && ch === "\\") {
      index += 2;
      continue;
    }
    if (mode === "`" && ch === "$" && next === "{") {
      out += " ";
      mode = "code";
      subs = [...subs, 0];
      index += 2;
      continue;
    }
    const closed: Exit = mode === "code" ? inSubstitution(ch, subs) : { mode: null, subs };
    subs = closed.subs;
    if (closed.mode !== null) {
      out += " ";
      mode = closed.mode;
      index += 1;
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

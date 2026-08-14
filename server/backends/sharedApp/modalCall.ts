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
// matched. It is a scanner rather than a parser, and the line it draws is between a MISTAKE and a
// DISGUISE: a page that writes `prompt(…)` in any of the ways a person writes it is caught, and one
// that assembles the name at runtime (`window["pro" + "mpt"]`, `Function("prompt()")()`,
// `setTimeout("prompt()")`) is not. That is deliberate. Nothing here defends the app against its
// own author — they publish the page — and every rule added for a disguise costs the false alarms
// that refuse a page which works. What DOES belong here is any spelling a browser reads as the
// plain call: attribute case, character references, URL whitespace, optional calls, template
// substitutions. Those are how a page is honestly written, and each one arrived as a bug.

/** Where code lives in a page. All three RUN, and the sandbox eats a modal in each of them
 *  identically — an `onclick` and a `javascript:` href are as executable as a `<script>`, and a
 *  gate that reads only the third would pass the other two straight through. */
const SCRIPT_BODY = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const SCRIPT_ELEMENT = /(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi;
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

/** Every named character reference that stands for an ASCII character, which is the closed set
 *  that matters here.
 *
 *  A name can only help spell a call if what it produces is ASCII: `prompt` and `javascript` are
 *  letters, and no named reference produces a plain ASCII letter — the ones that exist are accented
 *  or Greek. So the punctuation and spaces below are the whole of what an encoded attribute can
 *  contribute, and `javascript&colon;confirm&lpar;&rpar;` is covered by naming them.
 *
 *  Legacy uppercase spellings (`&AMP;`) are here because browsers still take them; the rest are
 *  case-SENSITIVE on purpose — `&Colon;` is U+2237, a different character entirely. */
const NAMED_REFERENCE: Record<string, string> = {
  Tab: "\t",
  NewLine: "\n",
  excl: "!",
  quot: '"',
  QUOT: '"',
  num: "#",
  dollar: "$",
  percnt: "%",
  amp: "&",
  AMP: "&",
  apos: "'",
  lpar: "(",
  rpar: ")",
  ast: "*",
  midast: "*",
  plus: "+",
  comma: ",",
  period: ".",
  sol: "/",
  colon: ":",
  semi: ";",
  lt: "<",
  LT: "<",
  equals: "=",
  gt: ">",
  GT: ">",
  quest: "?",
  commat: "@",
  lsqb: "[",
  lbrack: "[",
  bsol: "\\",
  rsqb: "]",
  rbrack: "]",
  Hat: "^",
  lowbar: "_",
  grave: "`",
  DiacriticalGrave: "`",
  lcub: "{",
  lbrace: "{",
  verbar: "|",
  vert: "|",
  VerticalLine: "|",
  rcub: "}",
  rbrace: "}",
  nbsp: " ",
  NonBreakingSpace: " ",
};

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
  // `ONCLICK` runs exactly like `onclick`: an attribute name is case-insensitive.
  if (name.toLowerCase().startsWith("on")) return value;
  // The URL parser DROPS ASCII tab, LF and CR from a URL — anywhere in it, the scheme included —
  // so `java&#x0A;script:confirm()` is followed as `javascript:confirm()`. Reading the decoded text
  // as written finds no scheme at all.
  const url = value.replace(/[\t\n\r]/g, "").trimStart();
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

/** The `type` a `<script>` declares, lower-cased and without its parameters. */
const TYPE_ATTRIBUTE = /\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/** The MIME types a browser EXECUTES. Everything else — `text/plain`, `application/json`,
 *  `text/x-template`, `importmap` — is a data block: inert, and often holding a sample or a
 *  template that says `prompt(` on purpose. Feeding those to the scanner refuses a page that
 *  works, which is the expensive way to be wrong.
 *
 *  An absent or empty `type` means a classic script, and `module` is the modern spelling; the rest
 *  are the legacy MIME strings browsers still honour.
 *
 *  The trade-off is named rather than hidden: a `text/x-template` block whose markup the page later
 *  puts into the DOM has its handlers become live at that moment, and this will not have looked at
 *  them. Refusing every data block instead would refuse the far commoner page that merely SHOWS a
 *  sample, so the miss is the side chosen. */
const JAVASCRIPT_TYPES = new Set([
  "module",
  "text/javascript",
  "text/ecmascript",
  "text/jscript",
  "text/livescript",
  "text/x-javascript",
  "text/x-ecmascript",
  "application/javascript",
  "application/ecmascript",
  "application/x-javascript",
  "application/x-ecmascript",
]);

const runsAsScript = (attributes: string): boolean => {
  const declared = TYPE_ATTRIBUTE.exec(attributes);
  const type = decoded(declared?.[1] ?? declared?.[2] ?? declared?.[3] ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  return type === undefined || type === "" || JAVASCRIPT_TYPES.has(type);
};

/** The page with every script's CONTENT gone and its START TAG kept.
 *
 *  Kept because that tag carries attributes of its own, and they run: a `<script src=…>` that fails
 *  to load fires its `onerror`. Removing the whole element took that handler out of the page along
 *  with the body, so nothing ever read it. */
const withoutScriptBodies = (html: string): string => html.replace(SCRIPT_ELEMENT, "$1 ");

const scriptsOf = (html: string): string[] => [
  ...[...html.matchAll(SCRIPT_BODY)].filter((hit) => runsAsScript(hit[1] ?? "")).map((hit) => hit[2] ?? ""),
  // Attributes are read from EVERY start tag, executable body or not: a data block's own `onerror`
  // still fires.
  ...attributesOf(withoutScriptBodies(html)),
];

/** What the walker is in the middle of. `code` is the only state that reaches the match. */
type Mode = "code" | "line" | "block" | "'" | '"' | "`" | "re";

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
/** After these, a `/` opens a REGEX LITERAL; after anything else (a name, a number, a `)`) it is
 *  division. The distinction is the one thing a JavaScript tokenizer cannot skip, and getting it
 *  wrong here is not cosmetic: `const slash = /[//]/; prompt("x")` has a `//` INSIDE a regex, and
 *  reading it as a comment throws away the rest of the line — the call included. */
const BEFORE_REGEX = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "~", "^", "<", ">", "\n"]);

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);
const WORD = /[\w$]/;

/** …and after these WORDS, for the same reason. `return /[//]/.test(value)` is a regex, but the
 *  character before the slash is `n` — the end of a keyword — so the punctuation set above reads it
 *  as division and the `//` in the class opens a comment that eats the rest of the line. */
const KEYWORD_BEFORE_REGEX = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);

/** The identifier a piece of code ends with, if any. Walked from the end rather than matched: the
 *  pattern that says this (`\w+\s*$`) is the shape a linter reads as exponential backtracking, and
 *  it would run against a growing string on every `/`. */
const trailingWord = (code: string): string => {
  let end = code.length;
  while (end > 0 && WHITESPACE.has(code[end - 1] ?? "")) end -= 1;
  let start = end;
  while (start > 0 && WORD.test(code[start - 1] ?? "")) start -= 1;
  return code.slice(start, end);
};

const inCode = (ch: string, next: string, prev: string, word: string): Step => {
  // The comment markers come FIRST, and are not ambiguous: an empty regex literal does not exist,
  // so `//` is always a comment, and `/*` is too.
  if (ch === "/" && next === "/") return { mode: "line", emit: " ", skip: true };
  if (ch === "/" && next === "*") return { mode: "block", emit: " ", skip: true };
  if (ch === "/" && (BEFORE_REGEX.has(prev) || KEYWORD_BEFORE_REGEX.has(word))) return { mode: "re", emit: " ", skip: false };
  const opened = OPENS[ch];
  // A string's CONTENT is dropped and its quotes are not: `"confirm("` must not become a call,
  // and `foo("x")` must keep its parentheses balanced for a reader.
  if (opened !== undefined) return { mode: opened, emit: " ", skip: false };
  return { mode: "code", emit: ch, skip: false };
};

/** One character inside a comment, a string or a regex literal: only its END matters.
 *
 *  `inClass` is the regex's own bracket: `/[/]/` is a complete literal, and a `/` between `[` and
 *  `]` does not end it. */
const inside = (mode: Mode, ch: string, next: string, inClass: boolean): { mode: Mode; skip: boolean; inClass: boolean } => {
  if (mode === "line") return { mode: ch === "\n" ? "code" : "line", skip: false, inClass };
  if (mode === "block") return ch === "*" && next === "/" ? { mode: "code", skip: true, inClass } : { mode: "block", skip: false, inClass };
  if (mode !== "re") return { mode: ch === mode ? "code" : mode, skip: false, inClass };
  if (ch === "[") return { mode, skip: false, inClass: true };
  if (ch === "]") return { mode, skip: false, inClass: false };
  return ch === "/" && !inClass ? { mode: "code", skip: false, inClass: false } : { mode, skip: false, inClass };
};

/** A `${…}` inside a template literal: it is CODE, not text, and the walker has to come back out
 *  of it into the template afterwards. `subs` holds one brace depth per substitution we are inside
 *  of, innermost last — a template inside a substitution inside a template is ordinary enough in a
 *  page that builds markup, and one counter could not tell those levels apart. */
/** A walked character: a `Step`, plus whether the regex literal is inside its `[…]`. */
interface Walked extends Step {
  inClass: boolean;
}

/** The two moves that are not about one character's own kind: an escape inside a string or a regex,
 *  which hides whatever follows it, and the `${` that turns a template back into code. */
const jump = (mode: Mode, ch: string, next: string, subs: number[]): { mode: Mode; subs: number[] } | null => {
  if (mode !== "code" && mode !== "line" && mode !== "block" && ch === "\\") return { mode, subs };
  if (mode === "`" && ch === "$" && next === "{") return { mode: "code", subs: [...subs, 0] };
  return null;
};

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
  let inClass = false;
  /** The last significant character of CODE, which is what says whether a `/` starts a regex. */
  let prev = "";
  while (index < source.length) {
    const ch = source[index] ?? "";
    const next = source[index + 1] ?? "";
    const jumped = jump(mode, ch, next, subs);
    if (jumped !== null) {
      out += " ";
      mode = jumped.mode;
      subs = jumped.subs;
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
    const step: Walked = mode === "code" ? { ...inCode(ch, next, prev, trailingWord(out)), inClass } : { ...inside(mode, ch, next, inClass), emit: " " };
    inClass = step.inClass;
    out += step.emit;
    if (mode === "code" && step.emit.trim() !== "") prev = step.emit;
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
 *  receiver of the author's own (`ui.alert`, `this.confirm`) keeps its dot and is left alone.
 *  `frames` is here because it IS the window — a page calling `frames.prompt(…)` calls the same
 *  disabled global as one calling `window.prompt(…)`. */
const GLOBAL_RECEIVER = /\b(?:window|self|globalThis|top|frames) ?\. ?/g;

/** The same call with its receiver still on it. Looked for FIRST and never exempted by a binding
 *  below: `window.prompt(…)` names the global outright, so a page's own `const prompt` says
 *  nothing about it. */
const QUALIFIED_CALL = /\b(?:window|self|globalThis|top|frames) ?\. ?(alert|confirm|prompt) ?\(/;

const CALL = /(?<![\w.$])(alert|confirm|prompt) ?\(/g;

/** A name the page BINDS is the page's own, whatever it is called.
 *
 *  `const alert = (text) => banner.textContent = text;` is an ordinary thing to write in a page
 *  that shows its messages in the page — which is exactly what this gate tells authors to do — and
 *  refusing it would be refusing a view that works, with a message about a sandbox that has
 *  nothing to do with it.
 *
 *  A binding anywhere in the script exempts that name everywhere in it. Real scoping would need a
 *  parser; what this trades away is a page that shadows the name in one function and calls the
 *  global in another, or one that shadows it and then reaches the global through `window.` — both
 *  rarer than the case above, and both on the side of missing rather than of refusing. */
const DECLARED = /\b(?:const|let|var|function|class)\s+(alert|confirm|prompt)\b/g;

/** The name of the first modal call in this page's code, or null. */
export const modalCallIn = (html: string): string | null => {
  for (const script of scriptsOf(html)) {
    const code = bare(asMemberAccess(script)).replace(/\s+/g, " ");
    const qualified = QUALIFIED_CALL.exec(code);
    if (qualified !== null) return qualified[1] ?? null;
    const bareCode = code.replace(GLOBAL_RECEIVER, "");
    const own = new Set([...bareCode.matchAll(DECLARED)].map((hit) => hit[1]));
    const call = [...bareCode.matchAll(CALL)].find((hit) => !own.has(hit[1]));
    if (call !== undefined) return call[1] ?? null;
  }
  return null;
};

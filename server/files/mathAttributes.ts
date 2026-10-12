// Which attributes of MathJax's output may reach the Files preview (#3017). The preview cannot run
// DOMPurify on the server, and leaving TeX packages out is not enough: `\mmlToken` is in `base` and
// sets `href`, `style` and colours; `\color`, `\unicode`, `\tag` and error titles carry author text
// into attributes too. So the output is filtered instead, by what is PERMITTED: an attribute survives
// only when its name is one MathJax writes and its value has the shape MathJax gives it. Anything an
// author could steer elsewhere — a link, an id, a title, a font, a handler — has no entry and is dropped.

// A plain value: words, numbers, units, hex colours. No `:`, `;`, `(`, quotes or slashes, so no
// `url(…)`, no `javascript:`, no second declaration.
const PLAIN = /^[\w.\-+#% ,]*$/;
const NUMBERS = /^[-\d. ]+$/;
// Polygon corners: number pairs.
const POINTS = /^[-\d., ]+$/;
// `translate(…)`, `scale(…)`, `matrix(…)`, `rotate(…)` with numbers only, as MathJax composes them —
// checked one function at a time, so no pattern repeats a group (no catastrophic backtracking).
const TRANSFORM_PART = /^(?:translate|scale|matrix|rotate)\([-\d., ]*$/;
const isTransform = (value: string): boolean => {
  const parts = value.split(")").map((part) => part.trim());
  return parts.pop() === "" && parts.length > 0 && parts.every((part) => TRANSFORM_PART.test(part));
};
// The declarations MathJax itself writes on an `<svg>` and its container, with numeric values, one
// declaration at a time.
const STYLE_VALUE = /^(?:-?[\d.]+(?:ex|em|px|pt|%)?|relative|absolute|auto)$/;
// `\fbox`-like frames (`2px solid red`) and the fallback font a character not in MathJax's font is
// drawn in (`serif`): words and lengths only, never a function or a second declaration.
const BORDER_VALUE = /^[\d.]+(?:px|pt|em|ex) (?:solid|dashed|dotted) (?:#[\da-fA-F]{3,8}|[a-zA-Z]+)$/;
const FONT_FAMILY_VALUE = /^[a-zA-Z][a-zA-Z -]*$/;
const STYLE_CHECKS: Record<string, (value: string) => boolean> = {
  "vertical-align": (value) => STYLE_VALUE.test(value),
  "min-width": (value) => STYLE_VALUE.test(value),
  "max-width": (value) => STYLE_VALUE.test(value),
  width: (value) => STYLE_VALUE.test(value),
  height: (value) => STYLE_VALUE.test(value),
  position: (value) => STYLE_VALUE.test(value),
  "margin-left": (value) => STYLE_VALUE.test(value),
  "margin-right": (value) => STYLE_VALUE.test(value),
  "stroke-width": (value) => STYLE_VALUE.test(value),
  border: (value) => BORDER_VALUE.test(value),
  "font-family": (value) => FONT_FAMILY_VALUE.test(value),
};
const isDeclaration = (declaration: string): boolean => {
  const colon = declaration.indexOf(":");
  const check = colon > 0 ? STYLE_CHECKS[declaration.slice(0, colon).trim()] : undefined;
  return check !== undefined && check(declaration.slice(colon + 1).trim());
};
const isStyle = (value: string): boolean =>
  value
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration !== "")
    .every(isDeclaration);
// SVG path data: commands and numbers.
const PATH = /^[MmLlHhVvCcSsQqTtAaZz\d.,\s-]*$/;
const XMLNS = new Set(["http://www.w3.org/2000/svg", "http://www.w3.org/1998/Math/MathML", "http://www.w3.org/1999/xlink"]);

const plain = (value: string): boolean => PLAIN.test(value);

const SHAPED: Record<string, (value: string) => boolean> = {
  transform: isTransform,
  style: isStyle,
  d: (value) => PATH.test(value),
  viewBox: (value) => NUMBERS.test(value),
  points: (value) => POINTS.test(value),
  xmlns: (value) => XMLNS.has(value),
};

// Names MathJax's SVG output and its MathML copy use. Not listed means dropped.
const PLAIN_NAMES = new Set([
  // SVG
  "width",
  "height",
  "x",
  "y",
  "cx",
  "cy",
  "rx",
  "ry",
  "stroke-linejoin",
  "pointer-events",
  "font-family",
  "font-size",
  "x1",
  "x2",
  "y1",
  "y2",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "role",
  "focusable",
  "aria-hidden",
  "preserveAspectRatio",
  "class",
  "data-c",
  "data-mml-node",
  "data-mjx-texclass",
  "data-mjx-variant",
  "data-labels",
  "data-table",
  "data-frame",
  "data-line",
  "data-background",
  "data-bgcolor",
  "data-hitbox",
  "data-idbox",
  "data-id-align",
  "data-variant",
  "data-mjx-script-align",
  // container
  "jax",
  "display",
  "unselectable",
  // MathML
  "mathvariant",
  "mathsize",
  "mathcolor",
  "mathbackground",
  "displaystyle",
  "scriptlevel",
  "accent",
  "accentunder",
  "fence",
  "stretchy",
  "symmetric",
  "largeop",
  "movablelimits",
  "separator",
  "form",
  "lspace",
  "rspace",
  "minsize",
  "maxsize",
  "depth",
  "voffset",
  "linethickness",
  "numalign",
  "denomalign",
  "bevelled",
  "notation",
  "align",
  "columnalign",
  "rowalign",
  "columnlines",
  "rowlines",
  "columnspacing",
  "rowspacing",
  "columnwidth",
  "columnspan",
  "rowspan",
  "frame",
  "framespacing",
  "equalrows",
  "equalcolumns",
  "side",
  "minlabelspacing",
  "open",
  "close",
  "separators",
  "texclass",
]);

// The elements MathJax's SVG output and its MathML copy are built from. Not listed means the element
// is dropped with everything inside it: SVG `<title>` above all, which MathJax fills with error text
// (the author's TeX) without escaping `<` — inside an `<svg>` an HTML parser reads that as markup.
const ELEMENTS = new Set([
  "mjx-container",
  "mjx-assistive-mml",
  "svg",
  "g",
  "path",
  "rect",
  "line",
  "ellipse",
  "polygon",
  "text",
  "math",
  "mrow",
  "mi",
  "mo",
  "mn",
  "ms",
  "mtext",
  "mspace",
  "mstyle",
  "merror",
  "mpadded",
  "mphantom",
  "menclose",
  "mfrac",
  "msqrt",
  "mroot",
  "msub",
  "msup",
  "msubsup",
  "munder",
  "mover",
  "munderover",
  "mmultiscripts",
  "mprescripts",
  "none",
  "mtable",
  "mtr",
  "mlabeledtr",
  "mtd",
  "maligngroup",
  "malignmark",
  "mfenced",
]);

/** Whether an element MathJax produced may reach the preview document at all. */
export const keepMathElement = (kind: string): boolean => ELEMENTS.has(kind);

/** Whether MathJax's attribute `name="value"` may reach the preview document. */
export function keepMathAttribute(name: string, value: string): boolean {
  const shaped = SHAPED[name];
  if (shaped) return shaped(value);
  return PLAIN_NAMES.has(name) && plain(value);
}

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
// `translate(…)`, `scale(…)`, `matrix(…)`, `rotate(…)` with numbers only, as MathJax composes them —
// checked one function at a time, so no pattern repeats a group (no catastrophic backtracking).
const TRANSFORM_PART = /^(?:translate|scale|matrix|rotate)\([-\d., ]*$/;
const isTransform = (value: string): boolean => {
  const parts = value.split(")").map((part) => part.trim());
  return parts.pop() === "" && parts.length > 0 && parts.every((part) => TRANSFORM_PART.test(part));
};
// The declarations MathJax itself writes on an `<svg>` and its container, with numeric values, one
// declaration at a time.
const STYLE_PROPERTIES = new Set(["vertical-align", "min-width", "max-width", "width", "height", "position", "margin-left", "margin-right"]);
const STYLE_VALUE = /^(?:-?[\d.]+(?:ex|em|px|%)|relative|absolute|auto)$/;
const isDeclaration = (declaration: string): boolean => {
  const colon = declaration.indexOf(":");
  return colon > 0 && STYLE_PROPERTIES.has(declaration.slice(0, colon).trim()) && STYLE_VALUE.test(declaration.slice(colon + 1).trim());
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
  xmlns: (value) => XMLNS.has(value),
};

// Names MathJax's SVG output and its MathML copy use. Not listed means dropped.
const PLAIN_NAMES = new Set([
  // SVG
  "width",
  "height",
  "x",
  "y",
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

/** Whether MathJax's attribute `name="value"` may reach the preview document. */
export function keepMathAttribute(name: string, value: string): boolean {
  const shaped = SHAPED[name];
  if (shaped) return shaped(value);
  return PLAIN_NAMES.has(name) && plain(value);
}

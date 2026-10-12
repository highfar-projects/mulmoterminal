// @vitest-environment node
import { describe, it, expect } from "vitest";
import { keepMathAttribute } from "../../../server/files/mathAttributes";

// #3017. What MathJax writes for ordinary formulas must survive; what an author can steer into an
// attribute must not. The first table is taken from MathJax's real output for a corpus of formulas.
describe("keepMathAttribute", () => {
  it.each([
    ["svg", "xmlns", "http://www.w3.org/2000/svg"],
    ["svg", "style", "vertical-align: -0.186ex;"],
    ["mjx-container", "style", "min-width: 10.697ex; position: relative;"],
    ["svg", "viewBox", "0 -833.9 3845.1 915.9"],
    ["svg", "width", "8.699ex"],
    ["svg", "role", "img"],
    ["svg", "aria-hidden", "true"],
    ["svg", "preserveAspectRatio", "xMidYMid"],
    ["g", "transform", "translate(1041.8,0) scale(1,-1)"],
    ["g", "fill", "currentColor"],
    ["g", "stroke", "red"],
    ["g", "fill", "#ff0000"],
    ["g", "data-mml-node", "msup"],
    ["path", "d", "M492 213Q472 213 472 226Q472 230 477 250T482 285Z"],
    ["path", "data-c", "1D438"],
    ["rect", "fill", "none"],
    ["line", "class", "mjx-solid"],
    ["mjx-container", "class", "MathJax"],
    ["mjx-container", "jax", "SVG"],
    ["mi", "mathvariant", "double-struck"],
    ["mstyle", "mathcolor", "blue"],
    ["mtable", "columnalign", "right left"],
    ["mtable", "rowspacing", ".2em"],
    ["mpadded", "width", "+0.833em"],
    ["menclose", "notation", "updiagonalstrike"],
    ["mjx-assistive-mml", "unselectable", "on"],
    ["ellipse", "rx", "1380.7"],
    ["ellipse", "cy", "292"],
    ["rect", "rx", "267"],
    ["polygon", "points", "-115.5,822.8 1196,822.8 1085.5,712.2"],
    ["path", "stroke-linejoin", "round"],
    ["path", "style", "stroke-width: 67;"],
    ["svg", "style", "vertical-align: 0;"],
    ["g", "style", "border: 2px solid red;"],
    ["g", "style", "font-family: serif;"],
    ["text", "font-size", "884px"],
    ["text", "data-variant", "-explicitFont"],
  ])("keeps <%s %s=%j>", (_tag, name, value) => {
    expect(keepMathAttribute(name, value)).toBe(true);
  });

  it.each([
    ["href", "javascript:alert(1)"],
    ["href", "#mjx-eqn:1"],
    ["xlink:href", "#x"],
    ["id", "mjx-eqn:1"],
    ["title", "Label 'x' multiply defined"],
    ["data-mjx-error", "Undefined control sequence"],
    ["fontfamily", "Arial"],
    ["onload", "alert(1)"],
    ["style", "position:fixed;inset:0"],
    ["style", "border: 2px solid url(javascript:alert(1));"],
    ["style", "vertical-align: -1ex; background: red;"],
    ["fill", "url(javascript:alert(1))"],
    ["stroke", "url(#a)"],
    ["mathcolor", "red;position:fixed"],
    ["mathbackground", "url(x)"],
    ["notation", 'box" onload="x'],
    ["transform", "translate(1,2) url(x)"],
    ["d", "M0 0 url(x)"],
    ["xmlns", "http://evil.example/"],
    ["class", "x;y"],
    ["style", "border: 2px solid url(x);"],
    ["style", "font-family: serif; background: url(x);"],
    ["style", "font-family: evil, url(x)"],
    ["points", "1,2 url(x)"],
    ["semantics", "bspr_axiom:true"],
  ])("drops %s=%j", (name, value) => {
    expect(keepMathAttribute(name, value)).toBe(false);
  });
});

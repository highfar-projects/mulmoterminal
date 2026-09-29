// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "vue/compiler-sfc";

// A native `title` tip waits on a browser delay nothing can shorten, so every tip goes through
// `data-tip` and the shared hover tip instead. This walks each template and reports any `title`
// that reaches the DOM: on a native element, or on a component that does not declare it as a prop
// (Vue then falls it through onto the component's root element).
const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

// An iframe's title is its accessible name, not a tip.
const NATIVE_TITLE_ALLOWED = new Set(["iframe"]);

interface TemplateNode {
  type: number;
  tag?: string;
  tagType?: number;
  loc?: { start: { line: number } };
  props?: Array<{ type: number; name: string; arg?: { content?: string } }>;
  children?: TemplateNode[];
}

const NODE_ELEMENT = 1;
const PROP_ATTRIBUTE = 6;
const PROP_DIRECTIVE = 7;
const TAG_COMPONENT = 1;

const isTemplateNode = (value: unknown): value is TemplateNode => typeof value === "object" && value !== null && "type" in value;

const hasTitle = (node: TemplateNode): boolean =>
  (node.props ?? []).some(
    (prop) =>
      (prop.type === PROP_ATTRIBUTE && prop.name === "title") || (prop.type === PROP_DIRECTIVE && prop.name === "bind" && prop.arg?.content === "title"),
  );

interface TitledTag {
  tag: string;
  line: number;
  isComponent: boolean;
}

/** Every element in a template that carries `title` or `:title`. */
function titledTags(sfcSource: string): TitledTag[] {
  const root: unknown = parse(sfcSource).descriptor.template?.ast;
  const found: TitledTag[] = [];
  const walk = (node: TemplateNode): void => {
    if (node.type === NODE_ELEMENT && node.tag && hasTitle(node)) {
      found.push({ tag: node.tag, line: node.loc?.start.line ?? 0, isComponent: node.tagType === TAG_COMPONENT });
    }
    (node.children ?? []).filter(isTemplateNode).forEach(walk);
  };
  if (isTemplateNode(root)) walk(root);
  return found;
}

const vueFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return vueFiles(full);
    return entry.name.endsWith(".vue") ? [full] : [];
  });

const componentFile = new Map(vueFiles(srcDir).map((file) => [path.basename(file, ".vue"), file]));

/** Whether a component in src declares `title` in its props, so a `title` passed to it stays a prop. */
const declaresTitleProp = (component: string): boolean => {
  const file = componentFile.get(component);
  if (!file) return false;
  const script = parse(readFileSync(file, "utf8")).descriptor.scriptSetup?.content ?? "";
  const props = script.slice(script.indexOf("defineProps"));
  return /\btitle\??:/.test(props.slice(0, props.indexOf(")")));
};

describe("titledTags", () => {
  it("finds a static and a bound title on native elements and on components", () => {
    const sfc = `<template>
  <div>
    <button title="a">x</button>
    <span :title="b">y</span>
    <MyThing title="c" />
    <button data-tip="d">z</button>
  </div>
</template>`;
    expect(titledTags(sfc)).toEqual([
      { tag: "button", line: 3, isComponent: false },
      { tag: "span", line: 4, isComponent: false },
      { tag: "MyThing", line: 5, isComponent: true },
    ]);
  });

  it("finds nothing in a template with only data-tip, or no template at all", () => {
    expect(titledTags(`<template><button data-tip="x">y</button></template>`)).toEqual([]);
    expect(titledTags(`<script setup lang="ts">const a = 1;</script>`)).toEqual([]);
  });

  it("is not fooled by title inside text or another attribute's value", () => {
    expect(titledTags(`<template><p :data-tip="'title=x'">title="not an attribute"</p></template>`)).toEqual([]);
  });
});

describe("no native title tip in src", () => {
  it("reaches the DOM only as an iframe's name or a declared component prop", () => {
    const offenders = vueFiles(srcDir).flatMap((file) =>
      titledTags(readFileSync(file, "utf8"))
        .filter(({ tag, isComponent }) => (isComponent ? !declaresTitleProp(tag) : !NATIVE_TITLE_ALLOWED.has(tag)))
        .map(({ tag, line }) => `${path.relative(srcDir, file)}:${line} <${tag}>`),
    );
    expect(offenders).toEqual([]);
  });

  it("recognises the components that do declare title, and one that does not", () => {
    expect(declaresTitleProp("LauncherButton")).toBe(true);
    expect(declaresTitleProp("ToolbarPopover")).toBe(true);
    expect(declaresTitleProp("SettingsButton")).toBe(false);
  });
});

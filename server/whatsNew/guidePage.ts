// A dated setup guide (docs/guide/<lang>/v<version>.md) turned into what the What's new dialog shows.
//
// The pages are written for the Jekyll site: front matter on top, the title repeated as an H1, and
// links relative to the page (`../images/x.png`, `features.html#a`). The dialog is not on that site,
// so every relative link is resolved against where the page is published — that is also what lets
// its screenshots load from the one origin the dialog trusts.
import { GUIDE_SITE_ORIGIN, type GuideLanguage, type WhatsNewEntry } from "../../common/whatsNew.js";

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
const TITLE_KEY = "title:";
// `](target)` or `](target "title")` — the markdown link and image forms these pages use. The
// title, when there is one, follows the first space.
const LINK_BODY = /\]\(([^)]*)\)/g;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export const guidePageUrl = (language: GuideLanguage, version: string): string => `${GUIDE_SITE_ORIGIN}/guide/${language}/v${version}.html`;

const QUOTES = ['"', "'"];

const unquote = (value: string): string => {
  const trimmed = value.trim();
  const first = trimmed.charAt(0);
  const quoted = trimmed.length >= 2 && QUOTES.includes(first) && trimmed.endsWith(first);
  return quoted ? trimmed.slice(1, -1) : trimmed;
};

const titleOf = (frontMatter: string): string | null => {
  const line = frontMatter.split(/\r?\n/).find((candidate) => candidate.startsWith(TITLE_KEY));
  return line === undefined ? null : unquote(line.slice(TITLE_KEY.length));
};

// The site shows the title above the page, so the page repeats it as an H1; the dialog shows it once.
const withoutLeadingHeading = (body: string): string => {
  const trimmed = body.trimStart();
  if (!trimmed.startsWith("# ")) return body;
  const lineEnd = trimmed.indexOf("\n");
  return lineEnd < 0 ? "" : trimmed.slice(lineEnd + 1);
};

function resolveTarget(target: string, pageUrl: string): string {
  if (HAS_SCHEME.test(target)) return target;
  try {
    return new URL(target, pageUrl).href;
  } catch {
    return target;
  }
}

function absoluteLink(linkBody: string, pageUrl: string): string {
  const titleStart = linkBody.indexOf(" ");
  const target = titleStart < 0 ? linkBody : linkBody.slice(0, titleStart);
  const title = titleStart < 0 ? "" : linkBody.slice(titleStart);
  return `](${resolveTarget(target, pageUrl)}${title})`;
}

const absoluteLinks = (markdown: string, pageUrl: string): string => markdown.replace(LINK_BODY, (_match, linkBody: string) => absoluteLink(linkBody, pageUrl));

export function toWhatsNewEntry(source: string, language: GuideLanguage, version: string): WhatsNewEntry {
  const frontMatter = FRONT_MATTER.exec(source);
  const title = frontMatter?.[1] === undefined ? null : titleOf(frontMatter[1]);
  const body = frontMatter ? source.slice(frontMatter[0].length) : source;
  const url = guidePageUrl(language, version);
  return {
    version,
    title: title || version,
    markdown: absoluteLinks(withoutLeadingHeading(body), url).trim(),
    url,
  };
}

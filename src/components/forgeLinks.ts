// The repository section of the path menu: which forge the directory's remote is on, and that
// forge's own pages under their own names. Read from the `forge` field of POST /api/git-remote
// (server/git/forge-host.ts), which already tells GitHub from GitLab — including a self-hosted
// GitLab declared in `gitlabHosts`.
import { isRecord } from "../../common/isRecord";
import type { GithubIconName } from "../../common/githubIcons";

export type ForgeName = "GitHub" | "GitLab";

export interface ForgeLink {
  icon: GithubIconName;
  label: string;
  url: string;
}

export interface ForgeSection {
  name: ForgeName;
  links: ForgeLink[];
}

// [icon, label, path under the repository page]. The labels are the forge's own words — GitLab says
// merge requests and pipelines — so they are not translated, the same as the forge's name.
type LinkSpec = readonly [GithubIconName, string, string];

const GITHUB_LINKS: readonly LinkSpec[] = [
  ["repo", "Repository", ""],
  ["issue-opened", "Issues", "/issues"],
  ["git-pull-request", "Pull requests", "/pulls"],
  ["play", "Actions", "/actions"],
];

const GITLAB_LINKS: readonly LinkSpec[] = [
  ["repo", "Repository", ""],
  ["issue-opened", "Issues", "/-/issues"],
  ["git-pull-request", "Merge requests", "/-/merge_requests"],
  ["play", "Pipelines", "/-/pipelines"],
];

const FORGES: Readonly<Record<string, { name: ForgeName; links: readonly LinkSpec[] }>> = {
  github: { name: "GitHub", links: GITHUB_LINKS },
  gitlab: { name: "GitLab", links: GITLAB_LINKS },
};

// Only an https page is opened: the URL arrives from the server, but it becomes a window.open target.
const isWebUrl = (value: unknown): value is string => typeof value === "string" && value.startsWith("https://");

/** The section to show for a `forge` value, or null for no remote, an unknown host, or a bad value. */
export function forgeSectionOf(forge: unknown): ForgeSection | null {
  if (!isRecord(forge) || typeof forge.kind !== "string" || !isWebUrl(forge.webUrl)) return null;
  const spec = Object.hasOwn(FORGES, forge.kind) ? FORGES[forge.kind] : undefined;
  if (!spec) return null;
  const base = forge.webUrl.endsWith("/") ? forge.webUrl.slice(0, -1) : forge.webUrl;
  return { name: spec.name, links: spec.links.map(([icon, label, path]) => ({ icon, label, url: base + path })) };
}

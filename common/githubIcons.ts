// GitHub's own icons for GitHub destinations, so a PR or an issue looks the way it does on GitHub
// rather than like a Material Symbols guess (`error` for Issues read as an error).
//
// Path data copied from @primer/octicons 19.38.0, build/svg/<name>-16.svg (16x16 viewBox).
// Octicons is MIT licensed: Copyright (c) 2026 GitHub Inc. — https://github.com/primer/octicons
// Copied rather than depended on: four shapes do not justify a package, and a component that owns
// the paths needs no `v-html`.
export const GITHUB_ICON_PATHS = {
  repo: [
    "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z",
  ],
  "issue-opened": ["M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z", "M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"],
  "git-pull-request": [
    "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z",
  ],
  play: [
    "M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z",
  ],
} as const satisfies Record<string, readonly string[]>;

export type GithubIconName = keyof typeof GITHUB_ICON_PATHS;

// How a configured icon asks for one of these instead of a Material Symbols name.
export const GITHUB_ICON_PREFIX = "github:";

const isGithubIconName = (name: string): name is GithubIconName => Object.hasOwn(GITHUB_ICON_PATHS, name);

/** The Octicon an icon string names (`github:<name>`), or null when it names a Material Symbol. */
export function githubIconOf(icon: string | null | undefined): GithubIconName | null {
  if (!icon?.startsWith(GITHUB_ICON_PREFIX)) return null;
  const name = icon.slice(GITHUB_ICON_PREFIX.length);
  return isGithubIconName(name) ? name : null;
}

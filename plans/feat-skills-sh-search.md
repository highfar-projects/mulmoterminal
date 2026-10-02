# feat: search skills.sh from the Skills viewer (#2835)

The Skills viewer reads skills on disk. A second mode, **skills.sh**, searches the public directory for
skills that are not on disk yet, and reads one before anyone installs it. It installs nothing.

## The endpoints

Both are the ones Vercel's official CLI (`vercel-labs/skills`, MIT) calls, unauthenticated, on one host:

- `GET https://skills.sh/api/search?q=&limit=` — `npx skills find`. Hits are `{ id, source, skillId, name, installs }`, in relevance order.
- `GET https://skills.sh/api/download/<owner>/<repo>/<skillId>` — what `npx skills add` downloads: `{ files: [{ path, contents }], hash }`.

Neither is documented, so every answer is parsed against a schema and anything else is "could not read it".

## Decisions (the four open points in the issue)

- **Where SKILL.md is**: the download snapshot carries it at its top, with every other file, so there is no
  GitHub tree walk and no GitHub rate limit.
- **Sending to an outside service**: no setting. Nothing is sent until the user switches to skills.sh and
  presses Search; typing sends nothing. The browser never talks to skills.sh — the server does, so the page's
  CSP is untouched and the host is fixed.
- **The audit API**: not used. It is undocumented too, and the file list already shows the part that matters.
- **When it breaks**: "could not search skills.sh" with a link to the site.

## Safety

- Search hits and file names are strangers' text: shown as text, control characters stripped, names that
  would not go safely into a URL dropped, and the request params checked again on the route.
- SKILL.md goes through `MarkdownProse` (DOMPurify; remote images not fetched). Bounded in size.
- Installing is the risk — a skill is instructions the agent follows with the user's permissions, and may
  bring scripts. So the viewer lists every file, warns about the ones that can run code, and offers only the
  install line to copy.

## Order

Results keep skills.sh's relevance order. Sorting by installs was tried and put popular skills that barely
matched above the right one (the CLI asks for fewer hits, which hides it).

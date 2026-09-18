# feat: full-text search over the open directory (#2140)

## What this is, and why it is not an extension of the name finder

#2099 gave the Files pane a finder for file NAMES. It works by shipping every path once
(`/api/files/browse/index`) and filtering in the browser on each keystroke. That is the right shape
for names and it cannot carry contents: there is no version of this where the browser holds every
file's text.

So the two features share a purpose and almost no mechanism. Content search is **server-side, one
request per query**, debounced, with the previous request aborted; results carry a line and a
snippet rather than a path alone. The existing `FileFinder.vue` is left untouched and the new panel
is its sibling — a mode switch inside it would mean two unrelated row shapes in one list and a
rewrite of a component that currently works.

## The engine: `git grep`, and why no dependency is added

`server/files/project-files.ts` already established the rule this inherits: **`.gitignore` is
honoured by ASKING GIT, never by parsing it here**, because a nested ignore file, `.git/info/exclude`,
the user's global excludes and negation patterns all decide it.

Content search needs the same authority, and git answers it directly. Measured by running each case
rather than read from documentation:

| condition | flag | what happens |
|---|---|---|
| in a repository | `--untracked` | finds a new untracked file; still skips a `.gitignore`d one |
| outside a repository | `--no-index` | works; there is no ignore file to honour, which is honest |
| binaries | `-I` | required — without it the output is `Binary file … matches` |
| a query starting with `-` | `--` | protected; without the separator it would parse as a flag |

That is one engine for both cases, so this does not even need the git/walk split `listProjectFiles`
carries. **ripgrep is not a dependency and must not be assumed on a user's machine** — it happens to
be installed on the maintainer's, which is exactly how that assumption would get made. Adding
`@vscode/ripgrep` would bundle per-platform binaries; that is a dependency decision to take
separately and on purpose, not a detail of this change.

Latency is not the constraint: a query against this repository returns in well under the time a
typist takes to reach the next keystroke, and does not grow with the hit count once the caps below
apply. Re-measure with `git grep -n -I -F --untracked -- <query>` rather than trusting this
sentence.

## Three traps, each with the decision it forces

### 1. Never `--cached`

The default reads the **working tree**; `--cached` reads the index. Measured: a tracked file edited
on disk and not staged is found by the default with its NEW content and not found by `--cached`,
and a word deleted from disk is correctly absent from the default while `--cached` still reports it.

So the ordinary "I just saved" state works, and — the reason this matters for this app — **writes by
the agent running in that directory are visible immediately**. `--cached` would silently search a
snapshot of whenever the user last staged.

### 2. An unsaved editor buffer is invisible to any on-disk search

Not a `git grep` limitation; ripgrep and a hand-rolled scan have the identical hole. What makes it
cheap to close here is that `FilesPane` opens exactly one file at a time (`openPath` is a single
ref), so at most one buffer can be dirty. That one string is searched in the browser and merged into
the results, marked as unsaved.

### 3. The inverse is the silent failure, and it is the one to design for

A hit found on disk at `foo.ts:42` while `foo.ts` is open and dirty describes a file the user is not
looking at. The line number and the snippet both refer to the saved text, so jumping lands in the
wrong place and the snippet shows something not on screen.

Missing a match is loud; jumping to the wrong line is quiet. **For the open dirty file, its hits are
re-derived from the buffer** rather than reported from disk. Exactly one file can be in that state,
so this is a special case with a bounded cost, not a general reconciliation problem.

## Design

**Server** — `GET /api/files/browse/search` in `server/files/files-browse.ts`, using the gates the
sibling routes already use: `browseBase` for the directory, `containedFor` / `resolveContained` for
containment, and `git()` from `server/git/worktrees.ts` for the subprocess (argv with no shell, a
timeout, stderr drained so a chatty repo cannot deadlock the pipe, and it never rejects — a missing
git or a non-repo is `ok:false` and the caller falls back).

The argv construction and the output parsing go in **their own file as pure functions**, which is
where the tests can reach them: building the flags from a query and options is a decision, and
parsing `path:line:text` has to survive a path containing a colon.

**Caps**, in the same discipline as `MAX_PROJECT_FILES` / `MAX_WALK_ENTRIES`: a maximum number of
matches, a maximum per file, and a maximum snippet length. **Truncation is reported to the UI**, and
the finder's own rule is what makes this non-optional — *the one wrong answer a search can give is
"it is not there" when it only means "I did not look at all of it"*. A long line is cut for transport
rather than sent whole, because one minified file would otherwise dominate the response.

**Client** — a new panel beside `FileFinder.vue`, opened from a toolbar button and from a new entry
in `KEYMAP_ACTIONS`. It belongs in `NEEDS_A_CURRENT_TERMINAL` for the reason `files-find` does: the
pane it opens exists only in the enlarged row, so in a tiled grid the key declines rather than
guessing which of nine terminals was meant.

## Decisions taken, with the reasoning rather than just the verdict

These are recorded here so a reviewer argues with the reason and not the choice. The checklist on
#2140 is where the user can overrule any of them.

- **Literal matching by default**, regex behind a toggle. Someone searching for `foo(bar)` means those
  characters; making them escape the parens to find their own code is the wrong default.
- **Smart case** — a lower-case query ignores case, a query containing an upper-case letter respects
  it — with an explicit toggle. It is what every comparable tool does, so it is what a hand reaches for.
- **Jump to the matching line is in scope.** `CmEditor` today exposes `setDoc / getDoc / destroy` and
  cannot scroll to a line; without adding that, clicking a result opens the file at the top and the
  search does half of what it looks like it does.
- **One PR**, API and UI together. An API-only PR adds nothing a user can see, and its route would be
  reviewed without the one thing that shows whether the response shape is right.

## Deliberately out of scope

- **Replace across files.** A different feature with a different risk profile — it writes.
- **An index or a cache.** The measurement says a subprocess per query is fast enough, and a cache
  would have to be invalidated against an agent writing files continuously, which is the hard half of
  a problem this does not have.
- **Searching outside the open directory.** The pane is about one directory; a project-wide or
  multi-root search is a different request.
- **ripgrep.** See above — a dependency decision, not part of this.

## What the build added that the plan did not foresee

Three things, each found by running something rather than by reading:

- **`git grep` caps the output at `-m`, which HIDES the truncation.** Asked for exactly the per-file
  limit, a file with that many matches and a file with a thousand produce identical output and
  nothing downstream can tell them apart — the cap was silently unreportable. It now asks for ONE
  MORE than it shows and drops the extra after counting it. The same reasoning `walkFiles` already
  records for its entry budget, arrived at the same way: a test said `truncated` was false when it
  should have been true.

- **`git()` could not say why it failed.** It returns `ok: code === 0`, and `git grep` exits 1 for
  "nothing matched" — a complete answer — and 128 for "not a repository". Both are `ok: false` with
  empty output, so the `--no-index` fallback would have fired on every empty search and answered it
  with `node_modules`. The helper now carries the exit code; the field is additive and its ~30 other
  callers are untouched.

- **The shared toolbar button nearly shipped a behaviour change.** Extracting the repeated utility
  run (which the styling rule requires) gave `@pointerdown.stop` to all four buttons, when the source
  had it on exactly one — the finder's, which needs it because the panel closes on any pointerdown
  outside and would otherwise shut on the gesture that opened it. Given to "reload" and "close" it
  would have left an open panel up. It is now an opt-in prop named for its reason, and a spec pins
  both directions.

## Verification

- The **argv builder** and the **output parser** as pure functions, in both directions: a query with a
  leading dash, a path containing a colon, a CRLF line, a non-ASCII path, an empty result.
- The **route**, against a real temporary directory in both modes — a git repository (asserting an
  untracked file is found and a `.gitignore`d one is not) and a plain directory (asserting
  `--no-index` answers and that the UI is told `.gitignore` was not applied).
- **The `--cached` trap pinned as a test**: a tracked file edited on disk and not staged must be found
  with its new content. That is the assertion that goes red if someone "optimises" the flags later.
- **Caps and truncation**: a fixture that exceeds each cap, asserting both that the response is cut
  and that it says so.
- Break-verify each by mutation, as ever: a guard that passes when the thing it guards is removed is
  not a guard.

All of the above was done. The sweeps, and what each one proved:

- **argv** — dropping `--untracked`, adding `--cached`, passing the pattern without `-e`, dropping
  `-I`, and asking git for exactly the cap rather than one more: every one goes red.
- **the fallback** — making `isNotARepository` answer true for "nothing matched" goes red, which is
  the assertion protecting a clean empty search from being re-answered with `node_modules`.
- **the wiring** — handing the buffer over when it is CLEAN, dropping the `revealLine` call, and
  jumping without awaiting the reveal: all three go red. The last one did NOT at first; the fake
  editor had no document, so call ORDER was invisible to it. Recording the sequence is what made the
  property testable, and it is worth noting that the comment asserting it came before the test could
  see it.
- **the toolbar button** — always stopping the pointerdown goes red.

The tree was compared against a pristine copy before and after each mutation. One sweep was
interrupted by a timeout and left its mutation in the working tree; it was caught by that check
rather than by the suite, which is the reason the check exists.

## Not verified in a browser

The panel is exercised through `@vue/test-utils` — the real component, its real template and real
reactivity — and the pane wiring through a real `FilesPane` mount. Nothing here has been rendered in
a browser: booting a second server would share `~/.mulmoterminal` with the one already running on
this machine and would run its idle-session sweep. The specific risk that leaves open is visual
(layout, overflow of a long matching line, the panel over a narrow pane), not behavioural.

# Blueprints: start an example without making, typing and trusting a folder first

Issue: #2399

## Why

To try an example, a person had to create an empty folder, type its full path, and have Claude Code trust it, before pressing Start. None of that was explained, and an ordinary user stops at the first step.

## Shape

- `server/blueprint/newFolder.ts` holds the pure decisions:
  - `folderPlan`: a folder that exists is used as it is. A folder that does not exist yet is created inside its existing parent. A missing parent (`no-parent`), a file in the way, or a relative path or a root is refused.
  - `folderHomes`: the parents of the person's recent builds, newest first, then the workspace.
  - `nameCandidates`: the name, then `name-2`, `name-3` and so on.
- `server/blueprint/folderSuggestion.ts` does the reads. It finds the first home that exists with a free name whose new folder Claude Code would trust. Trust is asked of the new path itself.
- The create route:
  - asks trust of the path before making anything;
  - makes the folder last of all the checks, with a single non-recursive `mkdir`;
  - if the build cannot then be created, takes back only the samples it placed, and removes the folder only if that leaves it empty.
- `GET /api/blueprints/folder-suggestion?name=<slug>`: when an example is chosen and the folder field is empty, the form fills in the suggestion and says it is a new folder in a trusted place. It never replaces what the person typed, including something typed while the suggestion was on its way, and only the latest example's suggestion is used.

## Verification

- Pure: every combination of folder and parent presence; home order and duplicates; name candidates.
- Routes over real HTTP:
  - a new folder made, with samples placed;
  - a missing parent refused, nothing made;
  - an untrusted new folder refused before it is made;
  - taken back on failure;
  - left alone when something else appeared in it;
  - suggestions: beside recent builds, skipping an untrusted place, null, and a bad name.
- The form:
  - fills the suggestion and shows its note;
  - drops the note when the field is edited;
  - never overwrites typed text, even typed while the suggestion was pending.
- Each decision inverted in turn goes red.
- On the test server, in Japanese:
  - choosing the itinerary example suggested `~/ss/llm/osaka-kyoto`, and Start made it with the sample in it;
  - the build ran its first two steps with no trust prompt.

## Not addressed

- A local process replacing the checked parent with a link between the check and `mkdir`: such a process can already write anywhere the person can, so the race buys it nothing.

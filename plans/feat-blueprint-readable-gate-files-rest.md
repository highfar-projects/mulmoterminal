# Blueprints: readable views for the remaining document gates

Issue: #2439 (the first two views landed in #2443; this finishes the issue)

## Why

After #2443, three document gates still pointed at JSON records:

- write's outline, before the drafts;
- polish's list, before any document changes;
- style's gathered texts, before the rules are written.

## Shape

The same plain-text, label-free views as #2443, one small pure module per pack:

- `write/checks/outlineView.mjs`, `outlineText`: each part's title, `→` the file it goes to, and its points. A point's later lines are indented.
- `style/checks/sourcesView.mjs`, `sourcesText`: `- copy ← where it came from`, one line each.
- `polish/checks/targetsView.mjs`, `targetsText`: one line per chosen document.

Each check writes its view only once the record checks out:

- `parts.mjs outline` writes `.blueprint/outline.txt`;
- `sources.mjs` writes `.blueprint/sources.txt`;
- `targets.mjs survey` writes `.blueprint/polish.txt`.

The gates' `reads` point at the views. The pack spec added in #2443, which makes a gate read the view wherever a check writes one, now covers these three.

Each view keeps its own few lines of helpers rather than importing them from the base pack. The views are imported directly by the specs as pure modules, and going through the base pack would tie them to an environment variable.

## Verification

- The views: exact output, including a newline in a point, a blank line in an origin, and a newline in a file name.
- The checks, run for real against the stand-in chaff, write each view.
- Packs: each gate reads the view.
- Each decision inverted in turn goes red.
- Rendered from three real finished builds (the style, write and polish examples): each reads as intended.

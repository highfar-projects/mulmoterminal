# Blueprints: group the examples by base

Issue: #2418

## Why

「例から始める」 listed every example in one row, with document and app examples mixed. Someone who came for documents had to read every card.

## Shape

- `presetGroups` (pure, `blueprintView.ts`): each example under its base's title.
  - Bases come in the base selector's order, and examples keep their own order.
  - A base with no examples is left out.
  - An example whose base is not installed goes last, under its slug.
- The form renders one group per base, each with its heading.

## Verification

- `presetGroups`: selector order and example order; empty bases; an uninstalled base last.
- The form: each base's examples under its title, and only those.
- Each decision inverted in turn goes red.
- On the test server, in Japanese, the examples showed under 文書のフォルダ, Firebase and ローカル.

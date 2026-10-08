# adopt offers the GitHub workflow only in a git repository (#2748)

adopt writes its workflow to `.github/workflows/chaff.yml` in the build's folder, which only runs when that folder
is the top of a git repository. Elsewhere 「GitHub の PR に指摘を出すワークフローを作る」 is a choice that cannot work.

- `needsFile` (#2744) becomes `needsPath`: a path in the folder that is a file or a folder — not a link, a pipe or a device. `.git` is a
  folder in a repository and a file in a worktree, so both count. The helpers, the route's query (`?path=`) and the
  form follow the name. It shipped hours earlier and only the bundled packs use it, so there is nothing to migrate.
- adopt's `ci` marks the workflow option as needing `.git`. Without it the question is not asked and the build goes on
  with 「作らない」.
- A folder named `chaff.yaml` now counts as the file, where #2744 did not. The build's own checks still read it as a
  file and fail there; it is not worth a second kind of entry.

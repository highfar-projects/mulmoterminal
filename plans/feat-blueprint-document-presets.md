# Document blueprints: examples that bring their own sample documents

Issue: #2342

## Why

「例から始める」 lists only app examples, so an ordinary user has no way to see what the document blueprints do.
They also cannot start one without a document in the folder. An example should work the same way the app
examples do: press it, name an empty folder, press Start, and watch.

## Shape

- A usecase pack may ship sample files for a preset in `presets/<preset-id>/` (plain files, no subfolders).
  The preset listing gains `samples`, the file names, and the form tells the person which files will be placed.
- `common/blueprint/samples.ts` (pure): `samplePlan(samples, existing)` decides which samples to copy, which are
  already there with the same content, and which names clash with a different file. A sample name must be a
  plain file name.
- The create route takes an optional `preset`. When it is given, the server reads the preset's samples and
  plans them against the folder. On any clash it refuses (409) before writing anything; otherwise it copies the
  missing ones, then writes the answers and creates the run. An unknown preset is refused (400).
- The form sends `preset` only while the answers still come from that example for the same base and usecase.
- Examples, each with self-written samples:
  - review: 業務委託契約書, with a reference to a missing article, a numbering gap and two payment terms that
    disagree;
  - verify: a two-night itinerary with a wrong weekday, two legs out of order, and a total that is off;
  - ask: an expense manual, with three questions (one it does not answer);
  - polish: a notice with long, roundabout sentences;
  - style: two model texts in one voice, to take a house style from;
  - write: answers only (a short guide), and it needs no sample.

## Verification

- `samplePlan` is pure and covered both ways (copy, same, clash, bad names).
- Server: presets list their samples; create with a preset copies into an empty folder, leaves a same-content
  file alone, refuses a clash without writing, and refuses an unknown preset.
- Every document preset's answers pass its hearing, and every file its answers name (documents, targets,
  sources) is one of its samples. So each example can actually run.
- The form sends `preset` for an applied example and drops it when the pair changes by hand.
- A real run from each new example on the test server, from an empty folder.

// Sample documents an example ships (a usecase pack's presets/<id>/), placed in the project folder when a build
// starts from that example. Pure: the server reads the files and applies the plan.

/** A sample is a plain file name, placed at the top of the folder: no path, no hidden file. */
export const SAMPLE_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,127}$/u;

export type Sample = { readonly name: string; readonly content: string };

export type SamplePlan = {
  /** Not in the folder yet: copy these. */
  readonly copy: readonly Sample[];
  /** Already there with the same content: nothing to do. */
  readonly present: readonly string[];
  /** There with other content: the person's own file, which must not be overwritten. */
  readonly clashes: readonly string[];
};

/** What to do with each sample, given what the folder holds under the same names (undefined when absent). */
export function samplePlan(samples: readonly Sample[], existing: Readonly<Record<string, string | undefined>>): SamplePlan {
  const copy = samples.filter((sample) => existing[sample.name] === undefined);
  const present = samples.filter((sample) => existing[sample.name] === sample.content).map((sample) => sample.name);
  const clashes = samples.filter((sample) => existing[sample.name] !== undefined && existing[sample.name] !== sample.content).map((sample) => sample.name);
  return { copy, present, clashes };
}

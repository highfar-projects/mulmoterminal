// @vitest-environment node
// The hash that tells a copy of a build's source taken again from the one it started from.
import { describe, expect, it } from "vitest";
import { SOURCE_RECORD_PATH, sourceFingerprint } from "../../../server/blueprint/sourceFingerprint";

const RECORDS = ".blueprint/source/collections/books/records.jsonl";
const SCHEMA = ".blueprint/source/collections/books/schema.json";
const COVER = ".blueprint/source/files/a.png";
const BOTH = '{"id":"1"}\n{"id":"2"}\n';
// A copy as the snapshot makes one; source.json says when it was taken, which differs every time.
const copy = (records = BOTH, schema = '{"title":"Books"}', cover: Buffer | null = Buffer.from([1]), takenAt = 1) => [
  { path: SOURCE_RECORD_PATH, content: `{"takenAt":${takenAt}}` },
  { path: SCHEMA, content: schema },
  { path: RECORDS, content: records },
  ...(cover === null ? [] : [{ path: COVER, content: cover }]),
];

describe("sourceFingerprint", () => {
  it("is the same for the same copy, whatever source.json says and in whatever order the files and records come", () => {
    const first = sourceFingerprint(copy());
    expect(sourceFingerprint(copy('{"id":"2"}\n{"id":"1"}\n', undefined, undefined, 2))).toBe(first);
    expect(sourceFingerprint(copy().toReversed())).toBe(first);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it.each([
    ["a record changed", () => copy('{"id":"1"}\n{"id":"3"}\n')],
    ["a record added", () => copy(`${BOTH}{"id":"3"}\n`)],
    ["the schema changed", () => copy(BOTH, '{"title":"Books!"}')],
    ["a file removed", () => copy(BOTH, undefined, null)],
    ["a file's bytes changed", () => copy(BOTH, undefined, Buffer.from([2]))],
  ])("differs when %s", (_label, changed) => {
    expect(sourceFingerprint(changed())).not.toBe(sourceFingerprint(copy()));
  });

  it("does not let one file's content run into the next file's name", () => {
    expect(sourceFingerprint([{ path: "a", content: "bc" }])).not.toBe(sourceFingerprint([{ path: "ab", content: "c" }]));
  });
});

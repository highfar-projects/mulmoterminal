// @vitest-environment node
//
// WHICH ROWS a preview page is handed, decided without a session: the cap a page declared, the
// published-only filter a `public.readPublished` collection carries, and the reader's own rows. The
// one-shot read and the listener both go through these, so a page cannot see more after a change.
import { describe, it, expect } from "vitest";

import { capped, visibleRows } from "../../../server/backends/sharedApp/preview.js";
import { rowsFor } from "../../../server/backends/sharedApp/previewWatch.js";

describe("the window a capped page is handed", () => {
  // `capped` is what stands between the pane and "the preview showed a row the page never gets".
  // Exercised directly as well as through a preview, because the interesting cases are BOUNDARIES —
  // which of two rows the cap keeps — and they are unreachable through a fixture that has to
  // publish an app first.
  const want = { cid: "messages", scope: "all" as const, limit: { rows: 2, field: "at" } };

  it("keeps the newest, and drops a row with no stamp at all", () => {
    // Firestore does not sort an unstamped document last — it does not RETURN it.
    const rows = [{ id: "a", at: "2026-08-22T09:00:00Z" }, { id: "b", at: "2026-08-22T11:00:00Z" }, { id: "c" }, { id: "d", at: "2026-08-22T10:00:00Z" }];
    expect(capped(want, rows).map((row) => row.id)).toEqual(["b", "d"]);
    // And with no cap declared, the rows are handed over untouched — unstamped ones included.
    expect(capped({ cid: "messages", scope: "all" }, rows).map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("separates two Timestamps inside the same second", () => {
    // `seconds + nanoseconds / 1e9` cannot: at epoch scale a double resolves no finer than ~240ns,
    // so these two would collapse to one value and the boundary would fall by input order.
    const rows = [
      { id: "a", at: { seconds: 1_800_000_000, nanoseconds: 1 } },
      { id: "b", at: { seconds: 1_800_000_000, nanoseconds: 2 } },
      { id: "c", at: { seconds: 1_799_999_999, nanoseconds: 999_999_999 } },
    ];
    expect(capped(want, rows).map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("breaks an exact tie by document name DESCENDING, as the query's implicit __name__ does", () => {
    // Input order is name ascending. Left alone, the boundary would keep the opposite row from the
    // one the published page is handed.
    const rows = [
      { id: "a", at: "2026-08-22T09:00:00Z" },
      { id: "b", at: "2026-08-22T09:00:00Z" },
      { id: "c", at: "2026-08-22T09:00:00Z" },
    ];
    expect(capped(want, rows).map((row) => row.id)).toEqual(["c", "b"]);
  });
});

describe("the rows a page is handed", () => {
  // `visibleRows` is the one answer both the one-shot read and the listener give.
  const who = { uid: "u1", email: "me@example.jp" };
  const rows = [
    { id: "a", shown: true, by: "u1" },
    { id: "b", shown: false, by: "u1" },
    { id: "c", shown: true, by: "u2" },
  ];

  it("keeps every row when nothing narrows it", () => {
    expect(visibleRows({ cid: "q", scope: "all" }, rows, who).map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps only published rows when the page reads a readPublished collection", () => {
    expect(visibleRows({ cid: "q", scope: "all", publishedField: "shown" }, rows, who).map((row) => row.id)).toEqual(["a", "c"]);
  });

  it("applies the published filter and the reader's own together", () => {
    expect(visibleRows({ cid: "q", scope: "own", uidField: "by", publishedField: "shown" }, rows, who).map((row) => row.id)).toEqual(["a"]);
  });

  it("is what the listener hands a page too", () => {
    const docs = rows.map(({ id, ...data }) => ({ id, data: () => data }));
    const watch = { key: "public:public", want: { cid: "q", scope: "all" as const, publishedField: "shown" } };
    expect(rowsFor(docs, watch, who).map((row) => row.id)).toEqual(["a", "c"]);
  });

  it("filters before the cap, as the query's where comes before its limit", () => {
    const stamped = [
      { id: "old", shown: true, at: 1 },
      { id: "new", shown: false, at: 3 },
      { id: "mid", shown: true, at: 2 },
    ];
    const want = { cid: "q", scope: "all" as const, publishedField: "shown", limit: { rows: 1, field: "at" } };
    expect(visibleRows(want, stamped, who).map((row) => row.id)).toEqual(["mid"]);
  });
});

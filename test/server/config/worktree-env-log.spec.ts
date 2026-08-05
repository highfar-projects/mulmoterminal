// @vitest-environment node
import { describe, it, expect } from "vitest";
import { heldReservation, parseReservations, releaseLine, reservationLine, type WorktreeEnvReservation } from "../../../server/config/worktree-env-log";

const entry = (over: Partial<WorktreeEnvReservation> = {}): WorktreeEnvReservation => ({
  dir: "/w/fix-login",
  name: "PORT",
  kind: "port",
  base: 3000,
  value: "3010",
  ...over,
});

const log = (...lines: string[]): string => lines.join("");

describe("parseReservations", () => {
  it("reads back what the writers appended", () => {
    expect(parseReservations(log(reservationLine(entry())))).toEqual([entry()]);
  });

  // Ordering is the whole point of replaying rather than unioning: a re-reservation must not
  // leave the value it replaced behind, or the old port stays out of circulation forever.
  it("lets a later line for the same directory and variable win", () => {
    const parsed = parseReservations(log(reservationLine(entry()), reservationLine(entry({ value: "3020" }))));
    expect(parsed).toEqual([entry({ value: "3020" })]);
  });

  it("keeps two variables of one directory apart", () => {
    const parsed = parseReservations(log(reservationLine(entry()), reservationLine(entry({ name: "API_PORT", base: 4000, value: "4010" }))));
    expect(parsed.map((r) => r.name).sort()).toEqual(["API_PORT", "PORT"]);
  });

  it("drops everything a released directory held", () => {
    const lines = log(
      reservationLine(entry()),
      reservationLine(entry({ name: "DB_NAME", kind: "slug", base: null, value: "app_x" })),
      releaseLine("/w/fix-login"),
    );
    expect(parseReservations(lines)).toEqual([]);
  });

  it("releases only the named directory", () => {
    const other = entry({ dir: "/w/add-search", value: "3020" });
    expect(parseReservations(log(reservationLine(entry()), reservationLine(other), releaseLine("/w/fix-login")))).toEqual([other]);
  });

  // A file cut off mid-append costs its last line and nothing else — the reason the newline
  // leads rather than trails.
  it("drops an unparseable line on its own", () => {
    const lines = log(reservationLine(entry()), "\n{ not json", reservationLine(entry({ name: "API_PORT", base: 4000, value: "4010" })));
    expect(
      parseReservations(lines)
        .map((r) => r.name)
        .sort(),
    ).toEqual(["API_PORT", "PORT"]);
  });

  it("drops a line whose shape is wrong", () => {
    expect(parseReservations('\n{"dir":"/w/x","name":"PORT","kind":"nonsense","base":3000,"value":"3010"}')).toEqual([]);
    expect(parseReservations('\n{"dir":"/w/x","name":"PORT","kind":"port","base":3000}')).toEqual([]);
  });

  it("reads an empty or blank log as nothing held", () => {
    expect(parseReservations("")).toEqual([]);
    expect(parseReservations("\n\n  \n")).toEqual([]);
  });
});

describe("heldReservation", () => {
  it("finds what this directory holds for this variable", () => {
    expect(heldReservation([entry()], "/w/fix-login", "PORT", 3000)).toEqual(entry());
  });

  it("does not answer for another directory or another variable", () => {
    expect(heldReservation([entry()], "/w/add-search", "PORT", 3000)).toBeNull();
    expect(heldReservation([entry()], "/w/fix-login", "API_PORT", 3000)).toBeNull();
  });

  // Editing `base` in the project's config must move the value. Otherwise a project that went
  // from 3000 to 4000 keeps exporting 3010 with nothing anywhere saying why.
  it("ignores a reservation made against a different base", () => {
    expect(heldReservation([entry()], "/w/fix-login", "PORT", 4000)).toBeNull();
  });

  it("matches a slug's absent base", () => {
    const slug = entry({ name: "DB_NAME", kind: "slug", base: null, value: "app_x" });
    expect(heldReservation([slug], "/w/fix-login", "DB_NAME", null)).toEqual(slug);
  });
});

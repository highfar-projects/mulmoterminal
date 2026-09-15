// @vitest-environment node
//
// The query behind the phone's copilot conversation view (#1822).
//
// Copilot keeps ONE store for the whole machine — `$COPILOT_HOME/session-store.db` — where every
// other transcript source is bound to a directory by where its file lives. So the cwd scoping that
// the others get for free has to be IN the SQL here, and that is what most of this file pins: an id
// alone would read another project's conversation into this cell, which is the hole
// `copilotSessionExistsForCwd` was added to close on the resume path (Codex review on #2063).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { COPILOT_TURNS_READ_LIMIT, listCopilotTurns } from "../../../server/agents/copilot-sessions.js";

const HERE = "/work/project";
const ELSEWHERE = "/work/other";
const ID = "1293238c-ae59-4592-8665-2088ee30032d";

let home: string;
let priorHome: string | undefined;

const withDb = (fn: (db: DatabaseSync) => void): void => {
  const db = new DatabaseSync(path.join(home, "session-store.db"));
  try {
    fn(db);
  } finally {
    db.close();
  }
};

const addSession = (id: string, cwd: string): void => {
  withDb((db) => db.prepare("INSERT INTO sessions (id, cwd) VALUES (?, ?)").run(id, cwd));
};

const addTurn = (id: string, turnIndex: number, user: string, assistant: string): void => {
  withDb((db) =>
    db
      .prepare("INSERT INTO turns (session_id, turn_index, user_message, assistant_response, timestamp) VALUES (?, ?, ?, ?, ?)")
      .run(id, turnIndex, user, assistant, `2026-09-13T20:0${turnIndex % 10}:00.000Z`),
  );
};

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "mt-copilot-"));
  priorHome = process.env.COPILOT_HOME;
  process.env.COPILOT_HOME = home;
  withDb((db) => {
    db.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, cwd TEXT)");
    db.exec(
      "CREATE TABLE turns (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, turn_index INTEGER, user_message TEXT, assistant_response TEXT, timestamp TEXT)",
    );
  });
});

afterEach(() => {
  if (priorHome === undefined) delete process.env.COPILOT_HOME;
  else process.env.COPILOT_HOME = priorHome;
  rmSync(home, { recursive: true, force: true });
});

describe("listCopilotTurns", () => {
  it("answers the session's turns oldest first, whatever order they were written in", async () => {
    addSession(ID, HERE);
    addTurn(ID, 2, "third", "c");
    addTurn(ID, 0, "first", "a");
    addTurn(ID, 1, "second", "b");
    const rows = await listCopilotTurns(ID, HERE);
    expect(rows.map((row) => row.user_message)).toEqual(["first", "second", "third"]);
  });

  // THE POINT OF THE JOIN. A real id, asked from the wrong directory, must answer nothing — not the
  // conversation. Without the cwd in the query a person could put another project's conversation in
  // this cell by hand-editing `?session=`.
  it("answers nothing for a real id asked from a different directory", async () => {
    addSession(ID, ELSEWHERE);
    addTurn(ID, 0, "private to the other project", "and its reply");
    expect(await listCopilotTurns(ID, HERE)).toEqual([]);
    expect(await listCopilotTurns(ID, ELSEWHERE)).toHaveLength(1);
  });

  // A turn row whose session row is missing is not attributable to any directory, so it is not
  // readable from one. The JOIN gives this for free; a `WHERE session_id = ?` would not.
  it("answers nothing for turns whose session row is gone", async () => {
    addTurn(ID, 0, "orphan", "reply");
    expect(await listCopilotTurns(ID, HERE)).toEqual([]);
  });

  it("answers nothing for an id that is not in the store", async () => {
    addSession(ID, HERE);
    addTurn(ID, 0, "q", "a");
    expect(await listCopilotTurns("77777777-6666-4555-8444-333333333333", HERE)).toEqual([]);
  });

  // The store is shared with every copilot session on the machine, so the read is bounded. Keeping
  // the NEWEST is what makes the bound invisible: the phone shows the end of a conversation.
  it("keeps the newest turns when a session is longer than the read limit", async () => {
    addSession(ID, HERE);
    const total = COPILOT_TURNS_READ_LIMIT + 5;
    for (let i = 0; i < total; i += 1) addTurn(ID, i, `q${i}`, `a${i}`);
    const rows = await listCopilotTurns(ID, HERE);
    expect(rows).toHaveLength(COPILOT_TURNS_READ_LIMIT);
    expect(rows[0]?.user_message).toBe(`q${total - COPILOT_TURNS_READ_LIMIT}`);
    expect(rows[rows.length - 1]?.user_message).toBe(`q${total - 1}`);
  });

  // Before copilot's first session there is no database at all, which is indistinguishable from a
  // schema that moved — and both mean "nothing to say" to this caller (sqlite-read.ts).
  it("answers nothing rather than throwing when there is no store", async () => {
    process.env.COPILOT_HOME = path.join(home, "nothing-here");
    expect(await listCopilotTurns(ID, HERE)).toEqual([]);
  });
});

// @vitest-environment node
// Unit tests for the google.calendar.* command handlers: param validation,
// clamping, and wiring — the Google engine is stubbed (no network, no token).
import { describe, it, expect } from "vitest";
import { DEFAULT_LIST_MAX_RESULTS, MAX_LIST_RESULTS } from "@mulmoclaude/core/google";
import type { CalendarColors, CalendarEventInput, CalendarEventSummary, CalendarSummary, ListEventsInput } from "@mulmoclaude/core/google";
import type { JsonObject } from "@mulmoclaude/core/remote-host";
import { isRecord } from "../../../common/isRecord.js";

import {
  createGoogleCalendarColors,
  createGoogleCalendarCreateEvent,
  createGoogleCalendarListCalendars,
  createGoogleCalendarListEvents,
  type GoogleCalendarDeps,
} from "./googleCalendar.js";

const sampleEvent: CalendarEventSummary = {
  id: "ev1",
  summary: "Standup",
  start: "2026-07-17T09:00:00+09:00",
  end: "2026-07-17T09:15:00+09:00",
  htmlLink: "https://calendar.google.com/event?eid=ev1",
  status: "confirmed",
  colorId: "",
  description: "",
  location: "",
  // A plain one-off with no attendees and no conference attached. `updated` and `eventType` come
  // back on every Google event; the next four are omitted here and the engine flattens them to
  // "". The last two are DERIVED from `attendees` / `conferenceData`, not Google fields at all,
  // so "" means neither is present — an event that has either one carries a value.
  recurringEventId: "",
  originalStartTime: "",
  updated: "2026-07-16T12:00:00Z",
  transparency: "",
  eventType: "default",
  hangoutLink: "",
  selfResponseStatus: "",
  conferenceVideoUri: "",
};

const sampleCalendar: CalendarSummary = {
  id: "team@group.calendar.google.com",
  summary: "Team",
  description: "shared",
  primary: false,
  accessRole: "reader",
  backgroundColor: "#16a765",
  foregroundColor: "#1d1d1d",
  colorId: "8",
  // The zone a pushed offset-less clock is read in. Matches sampleEvent's +09:00 so the
  // fixture describes one coherent calendar.
  timeZone: "Asia/Tokyo",
};

const sampleColors: CalendarColors = {
  event: { "1": { background: "#a4bdfc", foreground: "#1d1d1d" } },
  calendar: { "8": { background: "#16a765", foreground: "#1d1d1d" } },
};

interface StubCalls {
  createInputs: CalendarEventInput[];
  listInputs: ListEventsInput[];
  tokenRequests: number;
  listCalendarsCalls: number;
  getColorsCalls: number;
}

const stubDeps = (): { deps: GoogleCalendarDeps; calls: StubCalls } => {
  const calls: StubCalls = { createInputs: [], listInputs: [], tokenRequests: 0, listCalendarsCalls: 0, getColorsCalls: 0 };
  const deps: GoogleCalendarDeps = {
    getAccessToken: async () => {
      calls.tokenRequests += 1;
      return "stub-access-token";
    },
    createEvent: async (_token, input) => {
      calls.createInputs.push(input);
      return sampleEvent;
    },
    listEvents: async (_token, input = {}) => {
      calls.listInputs.push(input);
      return [sampleEvent];
    },
    listCalendars: async () => {
      calls.listCalendarsCalls += 1;
      return [sampleCalendar];
    },
    getColors: async () => {
      calls.getColorsCalls += 1;
      return sampleColors;
    },
  };
  return { deps, calls };
};

describe("createGoogleCalendarCreateEvent", () => {
  const validParams = { summary: "Standup", start: "2026-07-17T09:00:00+09:00", end: "2026-07-17T09:15:00+09:00" };

  it("creates an event and returns it under { event }", async () => {
    const { deps, calls } = stubDeps();
    const result = await createGoogleCalendarCreateEvent(deps)({ ...validParams, description: "daily" });
    expect(result).toEqual({ event: sampleEvent });
    expect(calls.tokenRequests).toBe(1);
    expect(calls.createInputs).toEqual([{ summary: "Standup", startDateTime: validParams.start, endDateTime: validParams.end, description: "daily" }]);
  });

  it("passes description as undefined when omitted", async () => {
    const { deps, calls } = stubDeps();
    await createGoogleCalendarCreateEvent(deps)({ ...validParams });
    expect(calls.createInputs[0]?.description).toBeUndefined();
  });

  it.each(["summary", "start", "end"])("rejects when %s is missing", async (key) => {
    const { deps } = stubDeps();
    const params = Object.fromEntries(Object.entries(validParams).filter(([name]) => name !== key));
    await expect(Promise.resolve(createGoogleCalendarCreateEvent(deps)(params))).rejects.toThrow(new RegExp(`${key} must be a non-empty string`));
  });

  it("rejects an empty summary", async () => {
    const { deps } = stubDeps();
    await expect(Promise.resolve(createGoogleCalendarCreateEvent(deps)({ ...validParams, summary: "  " }))).rejects.toThrow(
      /summary must be a non-empty string/,
    );
  });

  it.each([
    ["a non-date start", "not-a-date"],
    ["a date-only start (Google would 400 on dateTime)", "2026-07-17"],
    ["a start without a timezone offset", "2026-07-17T09:00:00"],
    ["a well-shaped but impossible date", "2026-13-01T09:00:00Z"],
  ])("rejects %s", async (_label, given) => {
    const { deps } = stubDeps();
    await expect(Promise.resolve(createGoogleCalendarCreateEvent(deps)({ ...validParams, start: given }))).rejects.toThrow(
      /start must be an ISO 8601 date-time with a timezone offset/,
    );
  });

  it.each([
    ["a UTC (Z) start", "2026-07-17T09:00:00Z"],
    ["fractional seconds with an offset", "2026-07-17T09:00:00.500+09:00"],
  ])("accepts %s", async (_label, given) => {
    const { deps, calls } = stubDeps();
    await createGoogleCalendarCreateEvent(deps)({ ...validParams, start: given });
    // Asserted on the whole input rather than the one field: a span is now either the flat
    // pair or the structured one, and these handlers speak the flat spelling — so which
    // spelling reaches the engine is part of what this pins.
    expect(calls.createInputs).toEqual([{ summary: "Standup", startDateTime: given, endDateTime: validParams.end }]);
  });

  it("does not fetch a token when validation fails", async () => {
    const { deps, calls } = stubDeps();
    await expect(Promise.resolve(createGoogleCalendarCreateEvent(deps)({}))).rejects.toThrow();
    expect(calls.tokenRequests).toBe(0);
  });

  it("passes calendarId and colorId through when given (trimmed)", async () => {
    const { deps, calls } = stubDeps();
    await createGoogleCalendarCreateEvent(deps)({ ...validParams, calendarId: "  team@group.calendar.google.com  ", colorId: "5" });
    expect(calls.createInputs[0]?.calendarId).toBe("team@group.calendar.google.com");
    expect(calls.createInputs[0]?.colorId).toBe("5");
  });

  it("leaves calendarId and colorId undefined when omitted", async () => {
    const { deps, calls } = stubDeps();
    await createGoogleCalendarCreateEvent(deps)({ ...validParams });
    expect(calls.createInputs[0]?.calendarId).toBeUndefined();
    expect(calls.createInputs[0]?.colorId).toBeUndefined();
  });

  it.each([
    ["a blank calendarId", "calendarId", "   "],
    ["a non-string colorId", "colorId", 5],
  ])("rejects %s", async (_label, key, given) => {
    const { deps } = stubDeps();
    await expect(Promise.resolve(createGoogleCalendarCreateEvent(deps)({ ...validParams, [key]: given }))).rejects.toThrow(
      new RegExp(`${key} must be a non-empty string`),
    );
  });
});

describe("createGoogleCalendarListEvents", () => {
  it("lists events with defaults when no params are given", async () => {
    const { deps, calls } = stubDeps();
    const result = await createGoogleCalendarListEvents(deps)({});
    expect(result).toEqual({ events: [sampleEvent] });
    expect(calls.listInputs).toEqual([{ timeMin: undefined, maxResults: DEFAULT_LIST_MAX_RESULTS }]);
  });

  it("passes a valid timeMin through", async () => {
    const { deps, calls } = stubDeps();
    await createGoogleCalendarListEvents(deps)({ timeMin: "2026-07-17T00:00:00Z" });
    expect(calls.listInputs[0]?.timeMin).toBe("2026-07-17T00:00:00Z");
  });

  it.each([
    ["a malformed timeMin", "yesterday-ish"],
    ["a date-only timeMin", "2026-07-17"],
    ["a non-string timeMin", 12345],
  ])("rejects %s", async (_label, given) => {
    const { deps } = stubDeps();
    await expect(Promise.resolve(createGoogleCalendarListEvents(deps)({ timeMin: given }))).rejects.toThrow(
      /timeMin must be an ISO 8601 date-time with a timezone offset/,
    );
  });

  it.each([
    ["keeps an in-range maxResults", 5, 5],
    ["keeps the lower bound", 1, 1],
    ["raises 0 to the lower bound", 0, 1],
    ["raises negatives to the lower bound", -3, 1],
    ["caps oversized maxResults", MAX_LIST_RESULTS + 100, MAX_LIST_RESULTS],
    ["falls back to default for non-integers", 2.5, DEFAULT_LIST_MAX_RESULTS],
    ["falls back to default for strings", "20", DEFAULT_LIST_MAX_RESULTS],
    ["falls back to default when absent", undefined, DEFAULT_LIST_MAX_RESULTS],
  ])("%s", async (_label, given, expected) => {
    const { deps, calls } = stubDeps();
    const params: JsonObject = given === undefined ? {} : { maxResults: given };
    await createGoogleCalendarListEvents(deps)(params);
    expect(calls.listInputs[0]?.maxResults).toBe(expected);
  });

  it("passes calendarId through (default primary when omitted)", async () => {
    const { deps, calls } = stubDeps();
    await createGoogleCalendarListEvents(deps)({ calendarId: "team@group.calendar.google.com" });
    expect(calls.listInputs[0]?.calendarId).toBe("team@group.calendar.google.com");
    await createGoogleCalendarListEvents(deps)({});
    expect(calls.listInputs[1]?.calendarId).toBeUndefined();
  });
});

describe("createGoogleCalendarListCalendars", () => {
  it("returns the user's calendars under { calendars }", async () => {
    const { deps, calls } = stubDeps();
    const result = await createGoogleCalendarListCalendars(deps)({});
    expect(result).toEqual({ calendars: [sampleCalendar] });
    expect(calls.listCalendarsCalls).toBe(1);
    expect(calls.tokenRequests).toBe(1);
  });
});

describe("createGoogleCalendarColors", () => {
  it("returns the event/calendar colour palettes under { colors }", async () => {
    const { deps, calls } = stubDeps();
    const result = await createGoogleCalendarColors(deps)({});
    expect(result).toEqual({ colors: sampleColors });
    expect(calls.getColorsCalls).toBe(1);
  });
});

// What actually leaves this machine for an event.
//
// The handlers answer `{ ...event }`, so the wire's contents are decided by whatever
// `CalendarEventSummary` holds — an upstream type. Widening it publishes the new fields to the
// paired phone over Firestore with no diff in this repo, which is how `hangoutLink` (the Meet
// join URL), `conferenceVideoUri` (the Zoom/Teams one) and the user's own RSVP arrived.
//
// The spread stays: MulmoClaude's handler is the same `{ ...event }`, and narrowing one host
// would give the same phone two different answers. What this pins is that the next widening is
// a DECISION — the list goes red and someone says yes — rather than a silent publication. The
// other assertions here cannot do it: they compare the result against the very object the stub
// returned, so they hold for any key set.
describe("the event shape published to the paired phone", () => {
  const PUBLISHED_EVENT_KEYS = [
    "colorId",
    "conferenceVideoUri",
    "description",
    "end",
    "eventType",
    "hangoutLink",
    "htmlLink",
    "id",
    "location",
    "originalStartTime",
    "recurringEventId",
    "selfResponseStatus",
    "start",
    "status",
    "summary",
    "transparency",
    "updated",
  ];

  // Cast-free on purpose: a handler answers `JsonValue`, so reading `.event` off it is exactly
  // the narrowing the repo's own guard exists for.
  const keysOf = (value: unknown): string[] => {
    if (!isRecord(value)) throw new Error(`expected an object to read keys from, got ${typeof value}`);
    return Object.keys(value).sort();
  };
  const eventOf = (result: unknown): unknown => (isRecord(result) ? result.event : undefined);
  const firstEventOf = (result: unknown): unknown => {
    const events = isRecord(result) ? result.events : undefined;
    return Array.isArray(events) ? events[0] : undefined;
  };

  it("carries exactly the keys recorded here, from both arms", async () => {
    const { deps } = stubDeps();
    const created = await createGoogleCalendarCreateEvent(deps)({ summary: "Standup", start: "2026-07-17T09:00:00+09:00", end: "2026-07-17T09:15:00+09:00" });
    const listed = await createGoogleCalendarListEvents(deps)({});
    // Read off the RESULT, not off the fixture: the fixture is an input, and a handler that
    // dropped or added a key on the way out would still match it.
    expect(keysOf(eventOf(created))).toEqual(PUBLISHED_EVENT_KEYS);
    expect(keysOf(firstEventOf(listed))).toEqual(PUBLISHED_EVENT_KEYS);
  });
});

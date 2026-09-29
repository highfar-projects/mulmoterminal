// @vitest-environment node
// The verify pack's machine judgement (rules.mjs) and its test of the AI's reading (facts.mjs), called
// directly: what each rule catches, and the look-alikes it must leave alone.
import { describe, expect, it } from "vitest";
import { datesIn, monthDaysIn, numbersIn, shapeProblems, timesIn, unquotedValues, weekdaysIn, yearDatesIn } from "../../../blueprints/verify/checks/facts.mjs";
import {
  isMonthDay,
  minutesOf,
  problemsIn,
  weekdayIndex,
  weekdayOfDate,
  type Amount,
  type Event,
  type Facts,
  type Total,
} from "../../../blueprints/verify/checks/rules.mjs";

const citation = (quote: string) => ({ source: "trip.md", address: "h1", quote });
const event = (id: string, date: string, extra: Partial<Event> = {}): Event => ({ id, date, title: id, citation: citation(date), ...extra });
const amount = (id: string, value: number, unit = "円"): Amount => ({ id, label: id, value, unit, citation: citation(String(value)) });
const total = (id: string, value: number, parts: string[], unit = "円"): Total => ({ ...amount(id, value, unit), parts });
const rulesOf = (facts: Facts): string[] => problemsIn(facts).map((problem) => problem.id);

describe("weekdayIndex", () => {
  const cases: readonly (readonly [unknown, number | undefined])[] = [
    ["木", 4],
    ["(木)", 4],
    ["（木）", 4],
    ["木曜", 4],
    ["木曜日", 4],
    ["日", 0],
    ["Thu", 4],
    ["thu.", 4],
    ["Thursday", 4],
    ["SUNDAY", 0],
    ["Thumb", undefined],
    ["Th", undefined],
    ["週", undefined],
    ["", undefined],
    [undefined, undefined],
    [4, undefined],
  ];
  it.each(cases)("%s → %s", (written, expected) => expect(weekdayIndex(written)).toBe(expected));
});

describe("weekdayOfDate", () => {
  const cases: readonly (readonly [unknown, number | undefined])[] = [
    ["2026-10-01", 4],
    ["2024-02-29", 4],
    ["2025-02-29", undefined],
    ["2026-13-01", undefined],
    ["2026-10-1", undefined],
    ["10/1", undefined],
    [null, undefined],
  ];
  it.each(cases)("%s → %s", (iso, expected) => expect(weekdayOfDate(iso)).toBe(expected));
});

describe("isMonthDay", () => {
  const cases: readonly (readonly [unknown, boolean])[] = [
    ["10-01", true],
    ["02-29", true],
    ["02-30", false],
    ["13-01", false],
    ["10-1", false],
    ["2026-10-01", false],
    [undefined, false],
  ];
  it.each(cases)("%s → %s", (value, expected) => expect(isMonthDay(value)).toBe(expected));
});

describe("minutesOf", () => {
  const cases: readonly (readonly [unknown, number | undefined])[] = [
    ["09:05", 545],
    ["9:05", 545],
    ["00:00", 0],
    ["23:59", 1439],
    ["24:00", undefined],
    ["12:60", undefined],
    ["9", undefined],
    ["9:5", undefined],
    [undefined, undefined],
  ];
  it.each(cases)("%s → %s", (time, expected) => expect(minutesOf(time)).toBe(expected));
});

describe("problemsIn: finds", () => {
  it("a weekday that is not the date's", () => {
    const [found] = problemsIn({ events: [event("d1", "2026-10-01", { weekday: "金" })] });
    expect(found).toMatchObject({ id: "weekday-mismatch-d1", rule: "weekday-mismatch", detail: { written: "金", actual: "木" } });
  });

  it("one wrong weekday once, however many events carry it, and another date separately", () => {
    const facts = {
      events: [event("a", "2026-10-01", { weekday: "金" }), event("b", "2026-10-01", { weekday: "(金)" }), event("c", "2026-10-02", { weekday: "土" })],
    };
    expect(problemsIn(facts).map((found) => [found.id, found.entries])).toEqual([
      ["weekday-mismatch-a", ["a", "b"]],
      ["weekday-mismatch-c", ["c"]],
    ]);
  });

  it("an event that ends before it starts", () => {
    expect(rulesOf({ events: [event("e", "2026-10-01", { start: "11:00", end: "09:00" })] })).toEqual(["end-before-start-e"]);
  });

  it("a later event dated earlier, and one starting earlier on the same day", () => {
    expect(rulesOf({ events: [event("a", "2026-10-02"), event("b", "2026-10-01")] })).toEqual(["out-of-order-a-b"]);
    const sameDay = { events: [event("a", "2026-10-01", { start: "13:00" }), event("b", "2026-10-01", { start: "09:00" })] };
    expect(rulesOf(sameDay)).toEqual(["out-of-order-a-b"]);
  });

  it("an event out of order among dates written without a year", () => {
    expect(rulesOf({ events: [event("a", "10-02"), event("b", "10-01")] })).toEqual(["out-of-order-a-b"]);
    const sameDay = { events: [event("a", "10-01", { start: "13:00", end: "15:00" }), event("b", "10-01", { start: "14:00" })] };
    expect(rulesOf(sameDay)).toEqual(["overlap-a-b"]);
  });

  it("an overlap or a misordering across an untimed entry between two timed ones", () => {
    const overlap = {
      events: [event("a", "2026-10-01", { start: "09:00", end: "12:00" }), event("note", "2026-10-01"), event("b", "2026-10-01", { start: "11:00" })],
    };
    expect(rulesOf(overlap)).toEqual(["overlap-a-b"]);
    const order = { events: [event("a", "2026-10-01", { start: "13:00" }), event("note", "2026-10-01"), event("b", "2026-10-01", { start: "09:00" })] };
    expect(rulesOf(order)).toEqual(["out-of-order-a-b"]);
  });

  it("an overlap with the latest timed event, not the first of the day", () => {
    const facts = {
      events: [
        event("a", "2026-10-01", { start: "09:00", end: "10:00" }),
        event("b", "2026-10-01", { start: "10:00", end: "12:00" }),
        event("note", "2026-10-01"),
        event("c", "2026-10-01", { start: "11:00" }),
      ],
    };
    expect(rulesOf(facts)).toEqual(["overlap-b-c"]);
  });

  it("a pair out of order once, not also as an overlap", () => {
    const facts = { events: [event("a", "2026-10-02", { start: "13:00", end: "16:00" }), event("b", "2026-10-02", { start: "09:00" })] };
    expect(rulesOf(facts)).toEqual(["out-of-order-a-b"]);
  });

  it("an event that starts before the previous one ends", () => {
    const facts = { events: [event("a", "2026-10-01", { start: "09:00", end: "11:30" }), event("b", "2026-10-01", { start: "11:00" })] };
    expect(rulesOf(facts)).toEqual(["overlap-a-b"]);
  });

  it("a total that is not the sum of its parts, with decimals compared in cents", () => {
    const facts = { amounts: [amount("x", 12000), amount("y", 24000)], totals: [total("t", 35000, ["x", "y"])] };
    expect(problemsIn(facts)).toEqual([
      { id: "total-mismatch-t", rule: "total-mismatch", entries: ["t"], detail: { written: 35000, sum: 36000, unit: "円", writtenIs: "less", by: 1000 } },
    ]);
    const cents = { amounts: [amount("x", 1.1, "USD"), amount("y", 2.2, "USD")], totals: [total("t", 3.3, ["x", "y"], "USD")] };
    expect(rulesOf(cents)).toEqual([]);
  });

  it("says which way a total is off, and by how much, in cents", () => {
    const over = { amounts: [amount("x", 28000), amount("y", 24000), amount("z", 3500)], totals: [total("t", 56000, ["x", "y", "z"])] };
    expect(problemsIn(over)[0]?.detail).toEqual({ written: 56000, sum: 55500, unit: "円", writtenIs: "more", by: 500 });
    const cents = { amounts: [amount("x", 1.1, "USD"), amount("y", 2.2, "USD")], totals: [total("t", 3.25, ["x", "y"], "USD")] };
    expect(problemsIn(cents)[0]?.detail).toMatchObject({ writtenIs: "less", by: 0.05 });
  });

  it("parts in another unit than the total, instead of a sum across units", () => {
    const facts = { amounts: [amount("x", 100, "USD"), amount("y", 100)], totals: [total("t", 200, ["x", "y"])] };
    expect(rulesOf(facts)).toEqual(["unit-mismatch-t"]);
  });
});

describe("problemsIn: leaves alone", () => {
  const cases: readonly (readonly [string, Facts])[] = [
    ["nothing at all", {}],
    ["a right weekday", { events: [event("d", "2026-10-01", { weekday: "(木)" })] }],
    ["an English weekday that is right", { events: [event("d", "2026-10-01", { weekday: "Thursday" })] }],
    ["no weekday", { events: [event("d", "2026-10-01")] }],
    ["a weekday the machine cannot read", { events: [event("d", "2026-10-01", { weekday: "週" })] }],
    ["events in order across days", { events: [event("a", "2026-10-01", { start: "18:00" }), event("b", "2026-10-02", { start: "08:00" })] }],
    ["same day, one without a time", { events: [event("a", "2026-10-01", { start: "13:00" }), event("b", "2026-10-01")] }],
    [
      "a late end, then an early start the next day",
      { events: [event("a", "2026-10-01", { start: "18:00", end: "23:00" }), event("b", "2026-10-02", { start: "08:00" })] },
    ],
    ["a date with its year, then a later one without", { events: [event("a", "2026-10-01"), event("b", "10-02")] }],
    ["two events starting at the same time", { events: [event("a", "2026-10-01", { start: "09:00" }), event("b", "2026-10-01", { start: "09:00" })] }],
    ["back to back", { events: [event("a", "2026-10-01", { start: "09:00", end: "11:30" }), event("b", "2026-10-01", { start: "11:30" })] }],
    ["an end without a start", { events: [event("a", "2026-10-01", { end: "09:00" })] }],
    ["a total with one part", { amounts: [amount("x", 500)], totals: [total("t", 500, ["x"])] }],
  ];
  it.each(cases)("%s", (_name, facts) => expect(problemsIn(facts)).toEqual([]));
});

describe("what a quotation writes", () => {
  it("month-days in the forms itineraries use", () => {
    expect([...monthDaysIn("2026-10-01 と 10/2、10月3日、１０月４日")]).toEqual(expect.arrayContaining(["10-1", "10-2", "10-3", "10-4"]));
    expect([...monthDaysIn("Thursday, 1 October; Oct. 2; November 3")]).toEqual(expect.arrayContaining(["10-1", "10-2", "11-3"]));
    expect(monthDaysIn("9:00 発、11:30 着").size).toBe(0);
    expect(monthDaysIn("on 1 day").size).toBe(0);
    expect([...monthDaysIn("2026-10-01")]).toEqual(["10-1"]);
    expect([...monthDaysIn("2026年 10 月 1 日")]).toEqual(["10-1"]);
  });

  it("a range that writes AM/PM once, for both of its times", () => {
    const sorted = (quote: string) => [...timesIn(quote)].sort((a, b) => a - b);
    // English writes it after the end, so the start gains the afternoon reading beside its plain one.
    expect(sorted("1:00–5:00 PM The Met")).toEqual([60, 780, 1020]);
    // A bare number is not a time on its own, so it takes no share: it may as well be a day.
    expect(sorted("3–6 pm museum")).toEqual([1080]);
    expect(sorted("1:00 to 5:30 p.m.")).toContain(780);
    // Japanese writes it before the start, so the end gains it.
    expect(sorted("午後1時〜5時")).toEqual([300, 780, 1020]);
    expect(sorted("午後1:00〜5:30 見学")).toContain(1050);
    expect(sorted("午後1時〜5時半")).toContain(1050);
    // A time with its own marker, and a range with none, are read as before.
    expect(sorted("9:00 AM–1:00 PM")).toEqual([540, 780]);
    expect(sorted("1:00–5:00")).toEqual([60, 300]);
    expect(sorted("午前9時〜午後1時")).toEqual([540, 780]);
    // A Japanese start that closes with 分, and a marker written without a space or a word break after it.
    expect(sorted("午後1時30分〜5時")).toContain(1020);
    expect(sorted("1:00PMPM")).toEqual([780]);
    // Only a range shares, and only with an end that writes no marker of its own.
    expect(sorted("1:00 発 5:00 PM 着")).toEqual([60, 1020]);
    expect(sorted("午前11:00–1:00 PM")).toEqual([660, 780]);
    expect(sorted("午後11時〜1:00 AM")).toEqual([60, 1380]);
    expect(sorted("October 1 to 5:30 pm")).toEqual([1050]);
    expect(sorted("October 1 to 5 pm")).toEqual([1020]);
    expect(sorted("Oct. 1–5 pm")).toEqual([1020]);
    expect(sorted("10/1-5 pm")).toEqual([1020]);
    expect(sorted("1 to 5:30 pm")).toEqual([1050]);
    expect(sorted("10月 1-5 pm")).toEqual([1020]);
    expect(sorted("2026年 10 月 1 to 5 pm")).toEqual([1020]);
  });

  it("times with a colon or in Japanese", () => {
    expect([...timesIn("9:05 発 11時着 13時半 14時15分 ９：４５")].sort((a, b) => a - b)).toEqual([545, 585, 660, 810, 855]);
    expect(timesIn("10月1日").size).toBe(0);
    expect([...timesIn("9時15")]).toEqual([555]);
    expect([...timesIn("午後3:00")]).toContain(900);
    expect([...timesIn("3:00 pm")]).toContain(900);
    expect([...timesIn("3 PM")]).toEqual([900]);
    expect([...timesIn("12 a.m.")]).toEqual([0]);
    expect([...timesIn("午前12時")]).toEqual([0]);
    expect([...timesIn("午後2時半")]).toEqual([870]);
    expect([...timesIn("午後 3時")]).toEqual([900]);
    expect([...timesIn("午後　3:00")]).toEqual([900]);
    expect([...timesIn("午前　12時")]).toEqual([0]);
    expect(timesIn("109:00便 13:001 9時151").size).toBe(0);
  });

  it("numbers with thousands separators, full-width digits and 万", () => {
    expect([...numbersIn("¥12,000 と ２４，０００円 と 1.2万円 と 1,234,567")]).toEqual(expect.arrayContaining([12000, 24000, 12000, 1234567]));
    expect(numbersIn("12,34").has(1234)).toBe(false);
    expect([...numbersIn("1.2万円")]).toEqual([12000]);
    expect([...numbersIn("割引 -1,200円 / ▲500 / △ 30")]).toEqual([-1200, -500, -30]);
    expect([...numbersIn("2026-10-01 A-1")]).toEqual([2026, 10, 1]);
    expect([...numbersIn("USD (310.50) と（1,200）")]).toEqual([310.5, -310.5, 1200, -1200]);
    expect([...numbersIn("宿泊費（2泊）")]).toEqual([2]);
  });
});

describe("what a quotation writes: years and weekdays", () => {
  it("each date once, with its year when it is written", () => {
    expect(datesIn("2026-10-01")).toEqual([{ year: 2026, month: 10, day: 1 }]);
    expect(datesIn("October 1st, 2025 と 10/2")).toEqual([
      { year: 2025, month: 10, day: 1 },
      { year: undefined, month: 10, day: 2 },
    ]);
    expect(monthDaysIn("123/4").size).toBe(0);
  });

  it("dates with their year", () => {
    expect([...yearDatesIn("2026-10-01 と ２０２５年１０月２日、10/3")]).toEqual(["2026-10-1", "2025-10-2"]);
    expect([...yearDatesIn("October 1, 2025 and 2 October 2024; Oct. 3")]).toEqual(["2025-10-1", "2024-10-2"]);
  });

  it("weekdays only where they are written as weekdays", () => {
    expect([...weekdaysIn("10月1日（木）と 2日(金) と 土曜日")]).toEqual([4, 5, 6]);
    expect([...weekdaysIn("Thursday, 1 October; Fri. 2")]).toEqual([4, 5]);
    expect(weekdaysIn("10月1日").size).toBe(0);
    expect(weekdaysIn("monthly Thumb sunny").size).toBe(0);
  });
});

describe("unquotedValues: a value the quotation does not contain was not read from the document", () => {
  const withQuote = (quote: string, extra: Partial<Event> = {}): Event => ({ ...event("d", "2026-10-01", extra), citation: citation(quote) });

  it("accepts an event whose every value is in its quotation", () => {
    expect(unquotedValues("events", withQuote("10月1日（木）9:00 東京駅発 → 11:30 新大阪駅着", { weekday: "(木)", start: "09:00", end: "11:30" }))).toEqual([]);
  });

  it("names each value that is not", () => {
    const missing = unquotedValues("events", withQuote("10月2日（金）9:00 発", { weekday: "木", start: "09:00", end: "11:30" }));
    expect(missing).toEqual(["the date 2026-10-01", "the weekday 木", "end 11:30"]);
  });

  it("accepts a date without a year from a quotation without one, and refuses a year the quotation writes", () => {
    expect(unquotedValues("events", { ...withQuote("10月1日 出発"), date: "10-01" })).toEqual([]);
    expect(unquotedValues("events", { ...withQuote("2026年10月1日 出発"), date: "10-01" })).toEqual(["the date 10-01"]);
  });

  it("rejects a date whose written year is another", () => {
    expect(unquotedValues("events", withQuote("2025-10-01 出発"))).toEqual(["the date 2026-10-01"]);
    expect(unquotedValues("events", withQuote("2026年10月1日 出発"))).toEqual([]);
    expect(unquotedValues("events", withQuote("10月1日 出発"))).toEqual([]);
    expect(unquotedValues("events", withQuote("October 1, 2025: depart"))).toEqual(["the date 2026-10-01"]);
    expect(unquotedValues("events", withQuote("October 1st, 2025: depart"))).toEqual(["the date 2026-10-01"]);
    expect(unquotedValues("events", withQuote("1st October 2026: depart"))).toEqual([]);
    expect(unquotedValues("events", withQuote("1 Oct. 2025: depart"))).toEqual(["the date 2026-10-01"]);
  });

  it("does not take the 日 of a date for Sunday", () => {
    expect(unquotedValues("events", { ...withQuote("10月4日 出発"), date: "2026-10-04", weekday: "日" })).toEqual(["the weekday 日"]);
    expect(unquotedValues("events", { ...withQuote("10月4日（日）出発"), date: "2026-10-04", weekday: "日" })).toEqual([]);
  });

  it("accepts a 24-hour time read from a 12-hour one", () => {
    expect(unquotedValues("events", withQuote("10月1日 午後3:00 集合", { start: "15:00" }))).toEqual([]);
    expect(unquotedValues("events", withQuote("October 1, 3 PM meet", { start: "15:00" }))).toEqual([]);
  });

  it("checks an amount's digits", () => {
    expect(unquotedValues("amounts", { ...amount("x", 24000), citation: citation("宿泊費 24,000円") })).toEqual([]);
    expect(unquotedValues("amounts", { ...amount("x", 42000), citation: citation("宿泊費 24,000円") })).toEqual(["42000"]);
    expect(unquotedValues("amounts", { ...amount("d", -1200), citation: citation("割引 -1,200円") })).toEqual([]);
    expect(unquotedValues("amounts", { ...amount("d", 1200), citation: citation("割引 -1,200円") })).toEqual(["1200"]);
  });
});

describe("shapeProblems", () => {
  const good = { events: [event("d", "2026-10-01")], amounts: [amount("x", 1)], totals: [total("t", 1, ["x"])] };

  it("accepts well-formed facts", () => expect(shapeProblems(good)).toEqual([]));

  const cases: readonly (readonly [string, unknown, string])[] = [
    ["a list that is not an array", { events: {} }, '"events" must be an array'],
    ["an entry that is not an object", { events: [1] }, "events[0]: not an object"],
    ["a bad id", { events: [event("Bad Id", "2026-10-01")] }, '"id" must be'],
    ["an impossible date", { events: [event("d", "2026-02-30")] }, "is not a real date"],
    ["a date that is neither YYYY-MM-DD nor MM-DD", { events: [event("d", "10/01")] }, "is not a real date"],
    ["a weekday on a date without a year", { events: [event("d", "10-01", { weekday: "木" })] }, 'a "weekday" needs the year'],
    ["an unreadable weekday", { events: [event("d", "2026-10-01", { weekday: "週" })] }, "is not a weekday"],
    ["a bad time", { events: [event("d", "2026-10-01", { start: "9時" })] }, '"start" must be HH:MM'],
    ["no title", { events: [{ ...event("d", "2026-10-01"), title: " " }] }, 'needs a "title"'],
    ["a quotation of only spaces", { events: [{ ...event("d", "2026-10-01"), citation: citation("  ") }] }, '"citation"'],
    ["no citation", { events: [{ id: "d", date: "2026-10-01", title: "t" }] }, '"citation"'],
    ["a value that is a string", { amounts: [{ ...amount("x", 1), value: "1" }] }, '"value" must be a number'],
    ["no unit", { amounts: [{ ...amount("x", 1), unit: "" }] }, 'needs a "unit"'],
    ["an id used twice", { events: [event("d", "2026-10-01")], amounts: [amount("d", 1)] }, 'id "d" is used twice'],
    ["a total naming no amount", { amounts: [amount("x", 1)], totals: [total("t", 1, ["y"])] }, '"parts" must list the ids of amounts'],
    ["a part counted twice", { amounts: [amount("a", 100), amount("b", 100)], totals: [total("t", 300, ["a", "b", "a"])] }, "names an amount twice"],
    ["a total with no parts", { totals: [total("t", 1, [])] }, '"parts" must list the ids of amounts'],
  ];
  it.each(cases)("rejects %s", (_name, facts, message) => expect(shapeProblems(facts).join("\n")).toContain(message));
});

// What is wrong with the facts an AI extracted from an itinerary or an estimate, decided by machine alone:
// a weekday beside the wrong date, events out of order or overlapping, a total that is not the sum of its
// parts. Pure — the checks read files and call these.

const JA_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const EN_WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const CENTS = 100;

/** 0 (Sunday) to 6, from a weekday as a document writes it: 「木」「木曜」「(木)」, "Thu", "Thursday". */
export const weekdayIndex = (written) => {
  const bare = String(written ?? "")
    .trim()
    .replace(/^[（(［[]|[）)］\]]$/gu, "")
    .replace(/曜日?$/u, "")
    .toLowerCase();
  const ja = JA_WEEKDAYS.indexOf(bare);
  if (ja !== -1) return ja;
  const en = EN_WEEKDAYS.findIndex((day) => [day, day.slice(0, 3), `${day.slice(0, 3)}.`].includes(bare));
  return en === -1 ? undefined : en;
};

/** Weekday `index` written the way `written` is: 金 beside 木 or (木), Friday beside Thursday, Fri beside Thu, Fri. beside Thu.. */
export const weekdayLike = (written, index) => {
  const bare = String(written ?? "")
    .trim()
    .replace(/^[（(［[]|[）)］\]]$/gu, "");
  const english = EN_WEEKDAYS[index];
  if (!/^[a-z]/iu.test(bare) || english === undefined) return JA_WEEKDAYS[index];
  const cased = `${english[0].toUpperCase()}${english.slice(1)}`;
  if (bare.length > 4) return cased;
  return bare.endsWith(".") ? `${cased.slice(0, 3)}.` : cased.slice(0, 3);
};

/** The weekday of a YYYY-MM-DD date, or undefined when it is not a real date. */
export const weekdayOfDate = (iso) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(iso ?? ""));
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getUTCDay() : undefined;
};

const LEAP_YEAR = 2024;

/** A date written without its year, as MM-DD: what an itinerary gives when neither it nor the person says the year. */
export const isMonthDay = (value) => /^\d{2}-\d{2}$/u.test(String(value ?? "")) && weekdayOfDate(`${LEAP_YEAR}-${value}`) !== undefined;

/** Two dates as comparable keys: whole when both have a year, month-day when either does not. */
const dayKeys = (a, b) => (isMonthDay(a) || isMonthDay(b) ? [a.slice(-5), b.slice(-5)] : [a, b]);

/** Minutes after midnight for "HH:MM", or undefined. */
export const minutesOf = (time) => {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(String(time ?? ""));
  if (!match) return undefined;
  const [hours, minutes] = match.slice(1).map(Number);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : undefined;
};

const problem = (rule, entries, detail) => ({ id: `${rule}-${entries.join("-")}`, rule, entries, detail });

const hasWrongWeekday = (event) => {
  const [written, actual] = [weekdayIndex(event.weekday), weekdayOfDate(event.date)];
  return written !== undefined && actual !== undefined && written !== actual;
};

/** One problem per wrong date-and-weekday, however many events sit under it (a heading's 「10月1日（金）」 covers the day). */
const weekdayProblems = (events) => {
  const groups = new Map();
  events.filter(hasWrongWeekday).forEach((event) => {
    const key = `${event.date}|${weekdayIndex(event.weekday)}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  });
  return [...groups.values()].map((group) => {
    const [first] = group;
    const detail = { date: first.date, written: first.weekday, actual: weekdayLike(first.weekday, weekdayOfDate(first.date)) };
    return {
      ...problem(
        "weekday-mismatch",
        group.map((event) => event.id),
        detail,
      ),
      id: `weekday-mismatch-${first.id}`,
    };
  });
};

const endBeforeStart = (events) =>
  events.flatMap((event) => {
    const [start, end] = [minutesOf(event.start), minutesOf(event.end)];
    return start !== undefined && end !== undefined && end < start ? [problem("end-before-start", [event.id], { start: event.start, end: event.end })] : [];
  });

const sameDay = (a, b) => {
  const [day, otherDay] = dayKeys(a.date, b.date);
  return day === otherDay;
};

/** The latest event before `index`, on the same day, that states `field` — an untimed note between two legs is skipped. */
const lastTimed = (events, index, field) =>
  events
    .slice(0, index)
    .reverse()
    .find((before) => sameDay(before, events[index]) && minutesOf(before[field]) !== undefined);

/** A later day dated earlier than the entry before it, or a later start on one day earlier than the last start before it. */
const orderProblems = (events) =>
  events.slice(1).flatMap((event, offset) => {
    const index = offset + 1;
    const before = events[offset];
    if (!sameDay(event, before)) {
      const [day, previousDay] = dayKeys(event.date, before.date);
      return day < previousDay ? [problem("out-of-order", [before.id, event.id], { before: before.date, after: event.date })] : [];
    }
    const started = lastTimed(events, index, "start");
    const start = minutesOf(event.start);
    if (started === undefined || start === undefined || start >= minutesOf(started.start)) return [];
    return [problem("out-of-order", [started.id, event.id], { before: started.start, after: event.start })];
  });

// A start earlier than the last start is out-of-order; its apparent overlap is the same mistake, so it is left to that rule.
const overlapProblems = (events) =>
  events.slice(1).flatMap((event, offset) => {
    const index = offset + 1;
    const [ended, started] = [lastTimed(events, index, "end"), lastTimed(events, index, "start")];
    const start = minutesOf(event.start);
    if (ended === undefined || start === undefined || start >= minutesOf(ended.end)) return [];
    if (started !== undefined && start < minutesOf(started.start)) return [];
    return [problem("overlap", [ended.id, event.id], { ends: ended.end, starts: event.start })];
  });

const inCents = (value) => Math.round(Number(value) * CENTS);

const totalProblems = (amounts, totals) => {
  const byId = new Map(amounts.map((amount) => [amount.id, amount]));
  return totals.flatMap((total) => {
    const parts = total.parts.map((id) => byId.get(id)).filter((part) => part !== undefined);
    const units = [...new Set(parts.map((part) => part.unit))];
    if (units.some((unit) => unit !== total.unit)) return [problem("unit-mismatch", [total.id], { total: total.unit, parts: units })];
    const sum = parts.reduce((cents, part) => cents + inCents(part.value), 0);
    const written = inCents(total.value);
    if (sum === written) return [];
    // The direction is decided here, not left to the report's prose: it has been written the wrong way round.
    const detail = {
      written: total.value,
      sum: sum / CENTS,
      unit: total.unit,
      writtenIs: written > sum ? "more" : "less",
      by: Math.abs(written - sum) / CENTS,
    };
    return [problem("total-mismatch", [total.id], detail)];
  });
};

/** Every problem in well-formed facts ({ events, amounts, totals }), in a stable order. */
export const problemsIn = (facts) => {
  const events = facts.events ?? [];
  return [
    ...weekdayProblems(events),
    ...endBeforeStart(events),
    ...orderProblems(events),
    ...overlapProblems(events),
    ...totalProblems(facts.amounts ?? [], facts.totals ?? []),
  ];
};

// The facts an AI extracted (.blueprint/facts.json): whether they are well formed, and whether each value is
// written in the passage it quotes. The second is what catches the AI's own misreading by machine — a date,
// a time or an amount that the quotation does not contain was not read from the document. Pure.
import { isMonthDay, minutesOf, weekdayIndex, weekdayOfDate } from "./rules.mjs";

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const MAN = 10000;
const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Full-width digits, separators and spaces as ASCII, so ２０２６／１０／１ and 2026/10/1 read the same. */
export const asciiDigits = (text) =>
  String(text ?? "")
    .replace(/[０-９／：，．－]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/gu, " ");

const monthOf = (name) => EN_MONTHS.indexOf(name.slice(0, 3)) + 1;
const ORDINAL = "(?:st|nd|rd|th)?";

// Each form once, with its year when it has one. A form WITH a year is read first and blanked out, so the
// same text is never read again as a date without one: the two sets below cannot disagree about it.
const DATE_FORMS = [
  [/(?<!\d)(\d{4}) ?[-/.年] ?(\d{1,2}) ?[-/.月] ?(\d{1,2})(?!\d)/gu, (m) => [m[1], m[2], m[3]]],
  [new RegExp(`\\b([a-z]{3,9})\\.? (\\d{1,2})${ORDINAL},? (\\d{4})\\b`, "gu"), (m) => [m[3], monthOf(m[1]), m[2]]],
  [new RegExp(`\\b(\\d{1,2})${ORDINAL} ([a-z]{3,9})\\.?,? (\\d{4})\\b`, "gu"), (m) => [m[3], monthOf(m[2]), m[1]]],
  [/(?<!\d)(\d{1,2}) ?[-/.月] ?(\d{1,2})(?!\d)/gu, (m) => [undefined, m[1], m[2]]],
  [new RegExp(`\\b([a-z]{3,9})\\.?\\s+(\\d{1,2})${ORDINAL}(?!\\d)`, "gu"), (m) => [undefined, monthOf(m[1]), m[2]]],
  [new RegExp(`\\b(\\d{1,2})${ORDINAL}\\s+([a-z]{3,9})\\b`, "gu"), (m) => [undefined, monthOf(m[2]), m[1]]],
];

/** Every date a quotation writes, as { year (undefined when not written), month, day }. */
export const datesIn = (quote) => {
  const found = [];
  DATE_FORMS.reduce((text, [form, read]) => {
    [...text.matchAll(form)].forEach((match) => found.push(read(match)));
    return text.replace(form, (match) => " ".repeat(match.length));
  }, asciiDigits(quote).toLowerCase());
  return found
    .map(([year, month, day]) => ({ year: year === undefined ? undefined : Number(year), month: Number(month), day: Number(day) }))
    .filter((date) => date.month > 0);
};

/** Every month-day a quotation writes, as "M-D": 2026-10-01, 10/1, 10月1日, 1 October, Oct. 1st. */
export const monthDaysIn = (quote) => new Set(datesIn(quote).map((date) => `${date.month}-${date.day}`));

/** Every date a quotation writes with its year, as "Y-M-D": 2026-10-01, 2026年10月1日, October 1st, 2025. */
export const yearDatesIn = (quote) =>
  new Set(
    datesIn(quote)
      .filter((date) => date.year !== undefined)
      .map((date) => `${date.year}-${date.month}-${date.day}`),
  );

/** The weekdays a quotation writes AS weekdays: 「（木）」「木曜」, or an English day name as a word. 「1日」 is not Sunday. */
export const weekdaysIn = (quote) => {
  const text = String(quote ?? "");
  const ja = [...text.matchAll(/[（(] ?([日月火水木金土]) ?[)）]|([日月火水木金土])曜/gu)].map((match) => match[1] ?? match[2]);
  const en = [...text.matchAll(/\b[a-z]+\.?/giu)].map((match) => match[0]);
  return new Set([...ja, ...en].map(weekdayIndex).filter((index) => index !== undefined));
};

const HALF_DAY = 12;

/** A 12-hour clock's hour on the 24-hour clock: 午後3 / 3 pm → 15, 午前12 / 12 am → 0. */
const onTwentyFour = (hours, marker) => {
  const afternoon = /^(?:午後|p)/iu.test(marker ?? "");
  const morning = /^(?:午前|a)/iu.test(marker ?? "");
  if (afternoon && hours < HALF_DAY) return hours + HALF_DAY;
  return morning && hours === HALF_DAY ? 0 : hours;
};

const clock = (hours, minutes) => minutesOf(`${hours}:${String(minutes).padStart(2, "0")}`);

const MARKER_AFTER = /^ ?([ap])\.?m/iu;
// Between the two ends of a range: a dash, a tilde, or "to" (分 may close a Japanese start: 1時30分〜5時).
const RANGE_JOIN = /^分? ?(?:[–—〜~～-]|to) ?$/u;

const token = (match, hours, minutes, before, after) => ({ at: match.index, end: match.index + match[0].length, hours, minutes, before, after });

// Every time the text writes, with where it sits and the AM/PM (午前/午後) written before or after it. Only what is
// written as a time: the 3 of "3–6 pm" is not listed, since a bare number may as well be a day (October 1 to 5 pm).
function timeTokens(text) {
  const afterOf = (match) => MARKER_AFTER.exec(text.slice(match.index + match[0].length))?.[1];
  const colon = [...text.matchAll(/(午前|午後)? ?(?<!\d)(\d{1,2}):(\d{2})(?!\d)/gu)].map((match) =>
    token(match, Number(match[2]), Number(match[3]), match[1], afterOf(match)),
  );
  const kanji = [...text.matchAll(/(午前|午後)? ?(?<!\d)(\d{1,2})時(\d{0,2})(?!\d)(半?)/gu)].map((match) =>
    token(match, Number(match[2]), match[4] ? 30 : Number(match[3] || 0), match[1], undefined),
  );
  const bare = [...text.matchAll(/(?<![\d:])(\d{1,2}) ?([ap])\.?m\b/giu)].map((match) => token(match, Number(match[1]), 0, undefined, match[2]));
  return [...colon, ...kanji, ...bare].sort((a, b) => a.at - b.at);
}

// A range often writes AM/PM once for both ends: 1:00–5:00 PM (after the end), 午後1時〜5時 (before the start). The
// unmarked end gains a reading with the shared marker; its own plain reading stays.
function sharedReading(first, second, text) {
  if (!RANGE_JOIN.test(text.slice(first.end, second.at))) return [];
  if (first.before === undefined && first.after === undefined && second.after !== undefined) {
    return [clock(onTwentyFour(first.hours, second.after), first.minutes)];
  }
  if (first.before !== undefined && second.before === undefined && second.after === undefined) {
    return [clock(onTwentyFour(second.hours, first.before), second.minutes)];
  }
  return [];
}

/** Every time a quotation writes, as minutes after midnight: 9:05, 9時5分, 9時15, 9時半, 午後3:00, 3 PM, 1:00–5:00 PM. */
export const timesIn = (quote) => {
  const text = asciiDigits(quote);
  const tokens = timeTokens(text);
  const plain = tokens.map((entry) => clock(onTwentyFour(entry.hours, entry.before ?? entry.after), entry.minutes));
  const shared = tokens.slice(1).flatMap((second, index) => sharedReading(tokens[index], second, text));
  return new Set([...plain, ...shared].filter((minutes) => minutes !== undefined));
};

const SIGNS = ["-", "−", "▲", "△"];

/** A sign right before the number (one space allowed), not itself after a digit or letter: 2026-10 is not -10. */
const isNegative = (text, at) => {
  const signAt = text[at - 1] === " " ? at - 2 : at - 1;
  return SIGNS.includes(text[signAt]) && !/[\p{L}\d]/u.test(text[signAt - 1] ?? "");
};

/** 「(1,200)」 alone in parentheses: an accounting negative, or a plain aside — the quotation cannot say which. */
const inParentheses = (text, match) => /[(（]/u.test(text[match.index - 1] ?? "") && /[)）]/u.test(text[match.index + match[0].length] ?? "");

/**
 * Every number a quotation writes, with thousands separators removed and 万 multiplied out: ¥12,000 / 1.2万円.
 * A sign belongs to its number: 「割引 -1,200円」「▲1,200」 write -1200, not 1200.
 */
export const numbersIn = (quote) => {
  const text = asciiDigits(quote).replace(/(\d),(?=\d{3}(?!\d))/gu, "$1");
  const numbers = [...text.matchAll(/([\d.]+)(万?)/gu)].flatMap((match) => {
    const value = (isNegative(text, match.index) ? -1 : 1) * Number(match[1]) * (match[2] ? MAN : 1);
    return inParentheses(text, match) ? [value, -value] : [value];
  });
  return new Set(numbers.filter((number) => Number.isFinite(number)));
};

const citationProblem = (citation) =>
  typeof citation?.source === "string" && typeof citation?.address === "string" && typeof citation?.quote === "string" && citation.quote.trim()
    ? null
    : 'needs "citation": { "source", "address", "quote" }';

const eventProblem = (event) => {
  if (weekdayOfDate(event.date) === undefined && !isMonthDay(event.date)) {
    return `"date" ${JSON.stringify(event.date)} is not a real date: YYYY-MM-DD, or MM-DD when no year is known`;
  }
  if (event.weekday !== undefined && isMonthDay(event.date)) return 'a "weekday" needs the year: give the date as YYYY-MM-DD, or leave the weekday out';
  if (event.weekday !== undefined && weekdayIndex(event.weekday) === undefined) return `"weekday" ${JSON.stringify(event.weekday)} is not a weekday`;
  const badTime = ["start", "end"].find((key) => event[key] !== undefined && minutesOf(event[key]) === undefined);
  if (badTime) return `"${badTime}" must be HH:MM`;
  return typeof event.title === "string" && event.title.trim() ? null : 'needs a "title"';
};

const amountProblem = (amount) => {
  if (typeof amount.value !== "number" || !Number.isFinite(amount.value)) return '"value" must be a number';
  if (typeof amount.unit !== "string" || !amount.unit.trim()) return 'needs a "unit" (円, USD, …)';
  return typeof amount.label === "string" && amount.label.trim() ? null : 'needs a "label"';
};

const listOf = (facts, key) => (facts?.[key] === undefined ? [] : facts[key]);

/** What is malformed in facts.json, one line each: an entry, an id, a total's parts. Empty when it is well formed. */
export const shapeProblems = (facts) => {
  const lists = ["events", "amounts", "totals"].map((key) => [key, listOf(facts, key)]);
  const notArrays = lists.filter(([, list]) => !Array.isArray(list)).map(([key]) => `"${key}" must be an array`);
  if (notArrays.length > 0) return notArrays;
  const checks = { events: eventProblem, amounts: amountProblem, totals: amountProblem };
  const entries = lists.flatMap(([key, list]) => list.map((entry, index) => ({ key, entry, index })));
  const problems = entries.flatMap(({ key, entry, index }) => {
    const named = typeof entry?.id === "string" ? ` (${entry.id})` : "";
    const where = `${key}[${index}]${named}`;
    if (typeof entry !== "object" || entry === null) return [`${where}: not an object`];
    if (typeof entry.id !== "string" || !ID_RE.test(entry.id)) return [`${where}: "id" must be lower-case letters, digits and -`];
    const found = checks[key](entry) ?? citationProblem(entry.citation);
    return found ? [`${where}: ${found}`] : [];
  });
  const ids = entries.map(({ entry }) => entry?.id);
  const repeated = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].map((id) => `id "${id}" is used twice`);
  const amountIds = new Set(listOf(facts, "amounts").map((amount) => amount?.id));
  const badParts = listOf(facts, "totals")
    .filter((total) => !Array.isArray(total?.parts) || total.parts.length === 0 || total.parts.some((id) => !amountIds.has(id)))
    .map((total) => `totals (${total?.id}): "parts" must list the ids of amounts`);
  const doubleCounted = listOf(facts, "totals")
    .filter((total) => Array.isArray(total?.parts) && new Set(total.parts).size !== total.parts.length)
    .map((total) => `totals (${total?.id}): "parts" names an amount twice, which would count it twice`);
  return [...problems, ...repeated, ...badParts, ...doubleCounted];
};

/** "10-1" for 2026-10-01 and for 10-01. */
const monthDay = (date) => {
  const [month, day] = date.split("-").slice(-2).map(Number);
  return `${month}-${day}`;
};

/** The quotation writes this month-day with a year, and never with the entry's year: 2025-10-01 is not 2026-10-01. */
const yearConflicts = (quote, date) => {
  const sameDay = [...yearDatesIn(quote)].filter((dated) => dated.slice(dated.indexOf("-") + 1) === monthDay(date));
  // A year the quotation writes and the extraction dropped is a misread too.
  if (isMonthDay(date)) return sameDay.length > 0;
  return sameDay.length > 0 && !sameDay.includes(`${Number(date.slice(0, 4))}-${monthDay(date)}`);
};

/** The values of one well-formed entry that its own quotation does not contain. */
export const unquotedValues = (key, entry) => {
  const quote = entry.citation.quote;
  if (key !== "events") return numbersIn(quote).has(entry.value) ? [] : [`${entry.value}`];
  const missing = [];
  if (!monthDaysIn(quote).has(monthDay(entry.date)) || yearConflicts(quote, entry.date)) missing.push(`the date ${entry.date}`);
  if (entry.weekday !== undefined && !weekdaysIn(quote).has(weekdayIndex(entry.weekday))) missing.push(`the weekday ${entry.weekday}`);
  ["start", "end"]
    .filter((field) => entry[field] !== undefined && !timesIn(quote).has(minutesOf(entry[field])))
    .forEach((field) => missing.push(`${field} ${entry[field]}`));
  return missing;
};

// A moment as a reader places it: the time alone for today, with the date once it is older —
// "11:31" is enough for this morning and useless for Tuesday. An unparseable moment shows nothing
// rather than "Invalid Date". `now` is read only after the moment has parsed, as the panes did.
export function clockLabel(at: string | number | null, now: () => Date = () => new Date()): string {
  if (at === null) return "";
  const moment = new Date(at);
  if (Number.isNaN(moment.getTime())) return "";
  const time = moment.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const startOfToday = now();
  startOfToday.setHours(0, 0, 0, 0);
  return moment.getTime() >= startOfToday.getTime() ? time : `${moment.toLocaleDateString([], { month: "numeric", day: "numeric" })} ${time}`;
}

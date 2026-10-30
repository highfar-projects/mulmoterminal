// Narrowing the resume list to what the person typed. Pure: the rows and the query are handed in.
import type { ResumableSession } from "../composables/useDirLists";

/** Below this many rows the whole list is already in view and a box would only be in the way. */
export const RESUME_FILTER_MIN_ROWS = 6;

/** The words of a query, lower-cased; none for a blank one. */
const wordsOf = (query: string): string[] => query.toLowerCase().split(/\s+/).filter(Boolean);

/** The rows whose title holds EVERY word of the query, in any order, ignoring case. A blank query
 *  keeps the list as it is. */
export function filterResumable(sessions: readonly ResumableSession[], query: string): ResumableSession[] {
  const words = wordsOf(query);
  if (words.length === 0) return [...sessions];
  return sessions.filter((session) => {
    const title = session.title.toLowerCase();
    return words.every((word) => title.includes(word));
  });
}

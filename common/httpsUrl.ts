// A URL that arrives as DATA and goes into an `<a href>`: `javascript:` in that attribute runs on
// click, so the scheme is not the data's decision. https only — github.com and GitHub Enterprise
// both serve it, and the cost of refusing anything else is a missing link beside text that still shows.
export const safeHttpsUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || value === "") return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
};

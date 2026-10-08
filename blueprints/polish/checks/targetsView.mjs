// The documents a polish build chose, as plain text a person can check before any is changed. Label-free and
// plain, like the other gate views.

/** Each chosen document, a line each. */
const targetLine = (target) => `- ${String(target.file).split("\n").join(" ")}`;

// Said rather than left blank: an empty page at the gate reads as a list that failed to load.
const NOTHING = "整える文書はありません（指定した文書に、直す所が見つかりませんでした）";

export const targetsText = (targets) => (targets.length === 0 ? `${NOTHING}\n` : [...targets.map(targetLine), ""].join("\n"));

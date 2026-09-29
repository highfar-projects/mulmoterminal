// The interview's answers, written into the project before the first step runs: the spec step
// reads them, and every later step can see what the user actually said rather than a summary.
import path from "node:path";
import { lstat } from "node:fs/promises";
import { writeFileAtomic } from "../files/atomic-write.js";
import type { HearingAnswers } from "../../common/blueprint/hearing.js";

export const ANSWERS_FILE = path.join(".blueprint", "answers.json");
export const RECORD_DIR = ".blueprint";

/** Whether the project's `.blueprint` is absent or a real folder; a link or a file would carry a write out of the project. */
export const recordFolderIsReal = (projectDir: string): Promise<boolean> =>
  lstat(path.join(projectDir, RECORD_DIR)).then(
    (found) => found.isDirectory(),
    (err: unknown) => err instanceof Error && "code" in err && err.code === "ENOENT",
  );

export async function writeAnswers(projectDir: string, answers: HearingAnswers): Promise<void> {
  // Checked just before the write: one swapped in between is the gap left, as for the other files the host places.
  if (!(await recordFolderIsReal(projectDir)))
    throw new Error(`${path.join(projectDir, RECORD_DIR)} is a link or a file, not a folder; nothing is written there`);
  await writeFileAtomic(path.join(projectDir, ANSWERS_FILE), `${JSON.stringify(answers, null, 2)}\n`);
}

// The documents a usecase reads, as the interview names them (one path per line), and what may be done
// with them: quote from them, and prove they were not changed.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, normalize } from "node:path";
import { fail } from "./chaff.mjs";

/** The documents `listed` names, each once, inside this folder and a file. Stops the check otherwise. */
export const documentsNamed = (listed) => {
  const documents = [
    ...new Set(
      String(listed ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .map((line) => normalize(line)),
    ),
  ];
  if (documents.length === 0) fail("the interview names no document");
  const outside = documents.filter((file) => isAbsolute(file) || file.split(/[\\/]/u)[0] === "..");
  if (outside.length > 0) fail(`documents must be inside this folder: ${outside.join(", ")}`);
  const absent = documents.filter((file) => !existsSync(file) || !statSync(file).isFile());
  if (absent.length > 0) fail(`not a file in this folder: ${absent.join(", ")}`);
  return documents;
};

export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const fingerprint = (file) => digest(readFileSync(file));

/** A quotation's source for quotationProblems: accepted only when it is one of `documents`, however it is spelled. */
export const documentSource = (documents) => (source) =>
  documents.includes(normalize(source)) ? { path: normalize(source) } : { problem: `cites ${source}, which is not one of the documents` };

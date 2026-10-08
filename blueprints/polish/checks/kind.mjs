// The kind of document the person named, as the genre chaff measures it by. Only with chaff's own style: a
// folder's chaff.yaml already names its genre, and --genre would win over it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CHAFF_DEFAULT_STYLE = "chaff の既定のまま";
export const FOLDER_STYLE = "このフォルダの規約（STYLE.md と chaff.yaml）";
export const FIX_SHELVED = "棚上げした指摘も直す";

/** The genre for the answers' `kind`, from `kinds` ({ option, genre }[]); null when none applies. */
export const genreOf = (answers, kinds) => {
  if (answers?.style !== CHAFF_DEFAULT_STYLE) return null;
  const chosen = kinds.find((kind) => kind.option === answers?.kind);
  return chosen?.genre ?? null;
};

/** The arguments that make chaff measure by `genre`; none without one. */
export const genreArgs = (genre) => (genre ? ["--genre", genre] : []);

const ANSWERS = ".blueprint/answers.json";

/** The kinds in the pack at `usecaseDir`. */
export const readKinds = (usecaseDir) => JSON.parse(readFileSync(join(usecaseDir, "kinds.json"), "utf8")).kinds;

/**
 * The arguments that show the findings the folder's baseline shelved, when the person asked to fix those too. Only
 * with the folder's style: the baseline is the folder's, and chaff's own style has none to show.
 */
export const shelvedArgs = (answers) => (answers?.style === FOLDER_STYLE && answers?.shelved === FIX_SHELVED ? ["--show-baseline"] : []);

const readAnswers = () => (existsSync(ANSWERS) ? JSON.parse(readFileSync(ANSWERS, "utf8")) : null);

/** This build's genre, from the folder's answers (BLUEPRINT_USECASE is the pack); null when its kind has none. */
export const kindGenre = () => {
  const answers = readAnswers();
  return answers === null ? null : genreOf(answers, readKinds(process.env.BLUEPRINT_USECASE));
};

/** The arguments every chaff run of this build takes for its kind. */
export const kindArgs = () => genreArgs(kindGenre());

/** The arguments every chaff run that measures this build's documents takes: its kind, and the shelved findings when asked. */
export const measureArgs = () => [...kindArgs(), ...shelvedArgs(readAnswers())];

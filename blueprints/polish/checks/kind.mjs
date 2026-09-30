// The kind of document the person named, as the genre chaff measures it by. Only with chaff's own style: a
// folder's chaff.yaml already names its genre, and --genre would win over it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CHAFF_DEFAULT_STYLE = "chaff の既定のまま";

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

/** This build's genre, from the folder's answers (BLUEPRINT_USECASE is the pack); null when its kind has none. */
export const kindGenre = () => (existsSync(ANSWERS) ? genreOf(JSON.parse(readFileSync(ANSWERS, "utf8")), readKinds(process.env.BLUEPRINT_USECASE)) : null);

/** The arguments every chaff run of this build takes for its kind. */
export const kindArgs = () => genreArgs(kindGenre());

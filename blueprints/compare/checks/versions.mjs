// The two versions the person named, read the same way by every check: one file each, inside this folder, with
// its articles as chaff's tree gives them.
import { readFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
import { articlesIn } from "./articles.mjs";
const { fail, readJson } = await import(fromBase("chaff.mjs"));
const { documentsNamed, fingerprint } = await import(fromBase("documents.mjs"));
const { treeOf } = await import(fromBase("places.mjs"));

const oneFile = (listed, which) => {
  const files = documentsNamed(listed);
  if (files.length !== 1) fail(`the ${which} version must be one file; the answer names ${files.length}`);
  return files[0];
};

const articlesOf = (file, which) => {
  const tree = treeOf(file);
  if (tree === null) fail(`chaff could not read the ${which} version, ${file}`);
  const articles = articlesIn(tree, readFileSync(file, "utf8"));
  if (articles.length === 0) fail(`the ${which} version, ${file}, has no article chaff reads (第1条, Article 1): this compares documents numbered by article`);
  return articles;
};

/** Both versions: their files, articles and fingerprints. */
export const readVersions = () => {
  const answers = readJson(".blueprint/answers.json", "the interview answers");
  const [oldFile, newFile] = [oneFile(answers.old, "old"), oneFile(answers.new, "new")];
  if (oldFile === newFile) fail("the old and the new version are the same file");
  return {
    old: { file: oldFile, articles: articlesOf(oldFile, "old"), print: fingerprint(oldFile) },
    new: { file: newFile, articles: articlesOf(newFile, "new"), print: fingerprint(newFile) },
  };
};

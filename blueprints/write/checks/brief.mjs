// The brief is written and the material it depends on is here:
// - .blueprint/brief.md has its five sections, each with something in it;
// - when the person named sources, they are collected in .blueprint/sources/ and listed with their origin;
// - when the person asked for the folder's style, the style is in the folder.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fromBase } from "./base.mjs";
const { fail, readJson } = await import(fromBase("chaff.mjs"));
const { missingSections } = await import(fromBase("markdown.mjs"));

const BRIEF = ".blueprint/brief.md";
const SECTIONS = [
  ["目的", "Purpose"],
  ["読者", "Audience"],
  ["要点", "Key points"],
  ["資料から取る事実", "Facts from sources"],
  ["決まっていないこと", "Open questions"],
];
const FOLDER_STYLE = "このフォルダの規約（STYLE.md と chaff.yaml）";

const answers = readJson(".blueprint/answers.json", "the interview answers the build wrote");
if (!existsSync(BRIEF)) fail(`${BRIEF} is missing`);
const missing = missingSections(readFileSync(BRIEF, "utf8"), SECTIONS);
if (missing.length > 0) fail(`${BRIEF} lacks sections: ${missing.join(", ")}`);

if (typeof answers.sources === "string" && answers.sources.trim() !== "") {
  const listed = readJson(".blueprint/sources.json", 'an array of { "file", "origin" } for the sources the person named');
  if (!Array.isArray(listed) || listed.length === 0) fail(".blueprint/sources.json lists no source, but the person named some");
  const onDisk = existsSync(".blueprint/sources") ? readdirSync(".blueprint/sources") : [];
  const absent = listed.filter((entry) => typeof entry?.file !== "string" || !onDisk.includes(entry.file)).map((entry) => String(entry?.file));
  if (absent.length > 0) fail(`listed but not in .blueprint/sources/: ${absent.join(", ")}`);
  const unsourced = listed.filter((entry) => typeof entry?.origin !== "string" || entry.origin.trim() === "").map((entry) => entry.file);
  if (unsourced.length > 0) fail(`sources without an origin: ${unsourced.join(", ")}`);
}

if (answers.style === FOLDER_STYLE) {
  const absentStyle = ["STYLE.md", "chaff.yaml"].filter((file) => !existsSync(file));
  if (absentStyle.length > 0)
    fail(
      `the person chose this folder's style, but ${absentStyle.join(" and ")} is not here: make the style first (the style pack), or choose chaff's defaults`,
    );
}
console.log("brief written");

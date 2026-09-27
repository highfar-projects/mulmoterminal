// The sources are collected: each file in .blueprint/sources/ is Markdown, not empty, and listed in
// .blueprint/sources.json with where it came from. There is enough text to measure a style from.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fail, readJson } from "./chaff.mjs";

const SOURCES_DIR = ".blueprint/sources";
const SOURCES_FILE = ".blueprint/sources.json";
// A style measured from one short text is that text's habits, not a style.
const MIN_DOCUMENTS = 2;
const MIN_CHARACTERS = 2000;

const listed = readJson(SOURCES_FILE, 'an array of { "file", "origin" }');
if (!Array.isArray(listed)) fail(`${SOURCES_FILE} must be an array of { "file", "origin" }`);
const bad = listed.findIndex((entry) => typeof entry?.file !== "string" || typeof entry?.origin !== "string" || entry.origin.trim() === "");
if (bad !== -1) fail(`${SOURCES_FILE} entry ${bad + 1} needs a "file" and a non-empty "origin"`);

const onDisk = existsSync(SOURCES_DIR) ? readdirSync(SOURCES_DIR).filter((name) => !name.startsWith(".")) : [];
const names = listed.map((entry) => entry.file);
const missing = names.filter((name) => !onDisk.includes(name));
if (missing.length > 0) fail(`listed but not in ${SOURCES_DIR}/: ${missing.join(", ")}`);
const unlisted = onDisk.filter((name) => !names.includes(name));
if (unlisted.length > 0) fail(`in ${SOURCES_DIR}/ but not listed with an origin: ${unlisted.join(", ")}`);
const notMarkdown = names.filter((name) => !name.endsWith(".md"));
if (notMarkdown.length > 0) fail(`sources must be Markdown (.md): ${notMarkdown.join(", ")}`);

const sizes = names.map((name) => readFileSync(join(SOURCES_DIR, name), "utf8").replace(/\s/gu, "").length);
const empty = names.filter((_name, index) => sizes[index] === 0);
if (empty.length > 0) fail(`empty sources: ${empty.join(", ")}`);
if (names.length < MIN_DOCUMENTS) fail(`${names.length} source(s): at least ${MIN_DOCUMENTS} are needed to tell a style from one text's habits`);
const total = sizes.reduce((sum, size) => sum + size, 0);
if (total < MIN_CHARACTERS) fail(`the sources hold ${total} characters: at least ${MIN_CHARACTERS} are needed to measure a style`);
console.log(`${names.length} sources, ${total} characters`);

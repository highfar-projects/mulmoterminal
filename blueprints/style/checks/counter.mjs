// The style bites: each deliberately bad text in .blueprint/counter/ is listed with the part of the guide
// it breaks, chaff finds something in every one of them, and between them at least a few different rules
// fire. A style that no bad text can trip is a style nothing checks.
import { existsSync, readdirSync } from "node:fs";
import { actionable, fail, findingsIn, readJson } from "./chaff.mjs";

const COUNTER_DIR = ".blueprint/counter";
const COUNTER_FILE = ".blueprint/counter.json";
const MIN_RULES = 3;

const listed = readJson(COUNTER_FILE, 'an array of { "file", "breaks" }');
if (!Array.isArray(listed) || listed.length === 0) fail(`${COUNTER_FILE} must list at least one text`);
const bad = listed.findIndex((entry) => typeof entry?.file !== "string" || typeof entry?.breaks !== "string" || entry.breaks.trim() === "");
if (bad !== -1) fail(`${COUNTER_FILE} entry ${bad + 1} needs a "file" and what it "breaks"`);
const onDisk = existsSync(COUNTER_DIR) ? readdirSync(COUNTER_DIR) : [];
const missing = listed.filter((entry) => !onDisk.includes(entry.file)).map((entry) => entry.file);
if (missing.length > 0) fail(`listed but not in ${COUNTER_DIR}/: ${missing.join(", ")}`);

const findings = findingsIn(COUNTER_DIR).filter(actionable);
const silent = listed.filter((entry) => !findings.some((finding) => finding.file.endsWith(entry.file))).map((entry) => entry.file);
if (silent.length > 0) fail(`chaff found nothing in: ${silent.join(", ")} — the style does not reach what these texts break`);
const rules = new Set(findings.map((finding) => finding.rule));
if (rules.size < MIN_RULES) fail(`only ${rules.size} rule(s) fired (${[...rules].join(", ")}): break the guide in more ways, at least ${MIN_RULES}`);
console.log(`${listed.length} counter text(s); ${rules.size} rules fired: ${[...rules].sort().join(", ")}`);

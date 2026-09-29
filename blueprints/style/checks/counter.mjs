// The style bites: each deliberately bad text in .blueprint/counter/ is listed with the part of the guide
// it breaks, chaff finds something in every one of them, and between them at least a few different rules
// fire. A style that no bad text can trip is a style nothing checks.
import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { fromBase } from "./base.mjs";
import { configuredRules, unprovenRules } from "./configured.mjs";
const { actionable, fail, findingsIn, readJson, runChaff } = await import(fromBase("chaff.mjs"));

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

const everyFinding = findingsIn(COUNTER_DIR);
const findings = everyFinding.filter(actionable);
// The exact file, not a path ending in its name: a finding in "za.md" must not count for "a.md".
const target = (file) => relative(process.cwd(), resolve(file));
const silent = listed.filter((entry) => !findings.some((finding) => target(finding.file) === join(COUNTER_DIR, entry.file))).map((entry) => entry.file);
if (silent.length > 0) fail(`chaff found nothing in: ${silent.join(", ")} — the style does not reach what these texts break`);
const rules = new Set(findings.map((finding) => finding.rule));
if (rules.size < MIN_RULES) fail(`only ${rules.size} rule(s) fired (${[...rules].join(", ")}): break the guide in more ways, at least ${MIN_RULES}`);
// Every rule the style turns on must be seen to fire: a setting nothing trips is a claim, and a report built on it
// can say a rule "does not react" when no text gave it the chance. A note (info) counts here; consistency rules speak so.
const rulesRun = runChaff(["rules", "--json"]);
if (rulesRun.code !== 0) fail(`chaff could not load chaff.yaml:\n${rulesRun.stderr}`);
const unproven = unprovenRules(configuredRules(JSON.parse(rulesRun.stdout), "chaff.yaml"), everyFinding);
if (unproven.length > 0) fail(`chaff.yaml turns on ${unproven.join(", ")}, but no counter text trips it: write one that does, or set it off with a reason`);
console.log(`${listed.length} counter text(s); ${rules.size} rules fired: ${[...rules].sort().join(", ")}`);

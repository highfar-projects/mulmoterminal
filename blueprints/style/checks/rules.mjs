// The style is written down and holds on its own sources:
// - chaff.yaml loads, and names its genre and language rather than leaving them to a guess;
// - every rule level it sets has a reason in .blueprint/rule-decisions.json, and every decision is in effect
//   (chaff ignores a rule name it does not know, so a misspelt rule would otherwise do nothing, silently);
// - the sources raise no finding under their own style — a style its own examples break cannot be followed;
// - STYLE.md, the guide the writer reads, has the sections a later step relies on.
import { existsSync, readFileSync } from "node:fs";

import { fromBase } from "./base.mjs";
import { configuredRules } from "./configured.mjs";
const { actionable, fail, findingsIn, readJson, runChaff } = await import(fromBase("chaff.mjs"));
const { missingSections } = await import(fromBase("markdown.mjs"));

const CONFIG = "chaff.yaml";
const DECISIONS = ".blueprint/rule-decisions.json";
const GUIDE = "STYLE.md";
// Each section may be written in Japanese or in English, whichever the documents are in.
const GUIDE_SECTIONS = [
  ["誰に・何のために", "Audience and purpose"],
  ["語調と文末", "Voice and tone"],
  ["用語と表記", "Terms and spelling"],
  ["構成", "Structure"],
  ["機械が確かめること", "What chaff checks"],
];

if (!existsSync(CONFIG)) fail(`${CONFIG} is missing`);
const rulesRun = runChaff(["rules", "--json"]);
if (rulesRun.code !== 0) fail(`chaff could not load ${CONFIG}:\n${rulesRun.stderr}`);
const current = JSON.parse(rulesRun.stdout);
if (!current.detected?.genre || !current.detected?.language) fail(`${CONFIG} must set both genre and language`);

const configured = configuredRules(current, CONFIG);
const known = new Set(current.rules.map((rule) => rule.id));

const decisions = readJson(DECISIONS, '{ "<rule>": { "level", "why" } } for each rule chaff.yaml sets');
if (decisions === null || typeof decisions !== "object" || Array.isArray(decisions)) fail(`${DECISIONS} must be an object keyed by rule`);
const problems = [];
Object.entries(decisions).forEach(([id, decision]) => {
  if (!known.has(id)) problems.push(`${id}: chaff has no such rule`);
  else if (configured.get(id) !== decision?.level)
    problems.push(`${id}: decided "${decision?.level}", but ${CONFIG} gives "${configured.get(id) ?? "nothing"}"`);
  if (typeof decision?.why !== "string" || decision.why.trim() === "") problems.push(`${id}: no reason given`);
});
[...configured.keys()].filter((id) => !(id in decisions)).forEach((id) => problems.push(`${id}: set in ${CONFIG} without a recorded reason`));
if (problems.length > 0) fail(`rule decisions:\n  ${problems.join("\n  ")}`);

const againstSources = findingsIn(".blueprint/sources").filter(actionable);
if (againstSources.length > 0) {
  const lines = againstSources.map((finding) => `${finding.file}: ${finding.rule} (${finding.level})`);
  fail(`the sources break their own style — relax the rule, or say in STYLE.md why the sources are not the model there:\n  ${lines.join("\n  ")}`);
}

if (!existsSync(GUIDE)) fail(`${GUIDE} is missing`);
const absent = missingSections(readFileSync(GUIDE, "utf8"), GUIDE_SECTIONS);
if (absent.length > 0) fail(`${GUIDE} lacks sections: ${absent.join(", ")}`);
console.log(`${configured.size} rule setting(s), each with a reason; the sources raise no finding`);

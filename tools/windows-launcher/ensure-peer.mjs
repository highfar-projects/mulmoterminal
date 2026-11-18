// Adds the WSL server to ~/.mulmoterminal/config.json's `peers`, for the launcher's `-Runtime both`.
// Run by mulmoterminal-launcher.ps1 with the Windows node:
//   node ensure-peer.mjs <config.json> <id> <label> <url>
// Prints one word the launcher reads back: present / added <backup> / conflict <url> / invalid / invalid-peers.
//
// Only `peers` is touched, and the file is copied to config.json.bak-peers (or -2, -3, ...) before it
// is rewritten. JSON goes through node rather than PowerShell 5.1, whose ConvertTo-Json reshapes it.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const BOM = 0xfeff;
const [file, id, label, url] = process.argv.slice(2);

function finish(word) {
  process.stdout.write(`${word}\n`);
  process.exit(0);
}

function withoutTrailingSlashes(u) {
  if (typeof u !== "string") return u;
  let end = u.length;
  while (end > 0 && u[end - 1] === "/") end--;
  return u.slice(0, end);
}

function nextBackupName() {
  let name = `${file}.bak-peers`;
  let n = 2;
  while (fs.existsSync(name)) {
    name = `${file}.bak-peers-${n}`;
    n++;
  }
  return name;
}

const exists = fs.existsSync(file);
const raw = exists ? fs.readFileSync(file, "utf8") : "{}";
const text = raw.charCodeAt(0) === BOM ? raw.slice(1) : raw;
let cfg;
try {
  cfg = JSON.parse(text);
} catch {
  finish("invalid");
}
if (cfg === null || typeof cfg !== "object" || Array.isArray(cfg)) finish("invalid");
if (cfg.peers !== undefined && !Array.isArray(cfg.peers)) finish("invalid-peers");

const peers = cfg.peers ?? [];
const sameId = peers.find((p) => p && p.id === id);
if (sameId) finish(withoutTrailingSlashes(sameId.url) === url ? "present" : `conflict ${sameId.url}`);
if (peers.some((p) => p && withoutTrailingSlashes(p.url) === url)) finish("present");

let backup = "";
if (exists) {
  backup = nextBackupName();
  fs.copyFileSync(file, backup);
} else {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}
cfg.peers = [...peers, { id, label, url }];
// Keep the file's own indentation, so the rewrite does not reformat a config the user wrote by hand.
const indent = (text.match(/\n([ \t]+)"/) || [])[1] || "  ";
fs.writeFileSync(file, `${JSON.stringify(cfg, null, indent)}\n`);
finish(`added ${backup}`);

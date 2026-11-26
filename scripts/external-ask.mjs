#!/usr/bin/env node
// A small client for the external ask routes (fork-only, plans/feat-external-ask.md): type a request
// into one session and print the answer. For trying the feature by hand, and for an agent in one
// session asking another; the first real caller is a program of its own (edgar).
//
//   node scripts/external-ask.mjs <session-id> <expected-cwd> "<text>" [--no-wait] [--max-wait <seconds>]
//   node scripts/external-ask.mjs <session-id> --wait <askId> [--max-wait <seconds>]
//   node scripts/external-ask.mjs --list
//   (each also takes --port <n> and --token <file>)
//
// Waiting stops after --max-wait seconds (default 540, under the 10 minutes an agent's shell call may
// last) with exit code 2 and the askId, so a long turn is picked up again with --wait rather than lost.
// --list marks the session this script runs in (MULMOTERMINAL_SESSION_ID): a send to it is always busy.
//
// The token defaults to ~/.mulmoterminal/external-ask-token of the user running this script, which is
// the right file only when this script and the server share a home: a server in WSL has its own.
//
// From Git Bash on Windows, set MSYS_NO_PATHCONV=1 before passing a POSIX <expected-cwd>: without it
// /home/... is rewritten into a Windows path and the server answers 400 invalid-request.
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const WAIT_SECONDS = 60;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: "string", default: process.env.MULMOTERMINAL_PORT ?? "34567" },
    token: { type: "string", default: path.join(os.homedir(), ".mulmoterminal", "external-ask-token") },
    list: { type: "boolean", default: false },
    "no-wait": { type: "boolean", default: false },
    wait: { type: "string" },
    "max-wait": { type: "string", default: "540" },
  },
});

const base = `http://localhost:${values.port}/api/external/sessions`;
const headers = { Authorization: `Bearer ${readFileSync(values.token, "utf8").trim()}`, "Content-Type": "application/json" };

async function call(url, init = {}) {
  const res = await fetch(url, { ...init, headers });
  return { status: res.status, body: await res.json() };
}

function stateOf(s) {
  if (s.permissionPending) return "permission";
  if (s.questionOpen) return "question";
  return s.working ? "working" : "idle";
}

async function list() {
  const { status, body } = await call(base);
  if (status !== 200) return fail(status, body);
  for (const s of body.sessions) {
    const memo = s.memo ? `  (${s.memo})` : "";
    const self = s.id === process.env.MULMOTERMINAL_SESSION_ID ? "  [this session]" : "";
    console.log(`${s.id}  ${s.agent}  ${stateOf(s)}  allowed=${s.allowed}  ${s.cwd}${memo}${self}`);
  }
}

async function ask(session, expectCwd, text) {
  const sent = await call(`${base}/${session}/asks`, { method: "POST", body: JSON.stringify({ text, expectCwd }) });
  if (sent.status !== 202) return fail(sent.status, sent.body);
  console.error(`sent as ${sent.body.askId}`);
  if (values["no-wait"]) return console.log(sent.body.askId);
  return wait(session, sent.body.askId);
}

async function wait(session, askId) {
  const deadline = Date.now() + Number(values["max-wait"]) * 1000;
  for (;;) {
    const left = Math.max(0, Math.min(WAIT_SECONDS, Math.floor((deadline - Date.now()) / 1000)));
    const { status, body } = await call(`${base}/${session}/asks/${askId}?waitSeconds=${left}`);
    if (status !== 200) return fail(status, body);
    if (body.status === "answered") return console.log(body.reply);
    if (left === 0) break;
    console.error(`pending (seen=${body.seen}, working=${body.working})`);
  }
  console.error(`no answer yet; wait again with: --wait ${askId}`);
  process.exitCode = 2;
}

function fail(status, body) {
  console.error(`${status} ${body.error ?? ""}: ${body.message ?? JSON.stringify(body)}`);
  process.exitCode = 1;
}

const USAGE = [
  'usage: external-ask.mjs <session-id> <expected-cwd> "<text>" [--no-wait] [--max-wait s]',
  "       external-ask.mjs <session-id> --wait <askId> [--max-wait s]",
  "       external-ask.mjs --list",
  "       (all take --port N and --token file)",
].join("\n");

if (values.list) await list();
else if (values.wait && positionals.length === 1) await wait(positionals[0], values.wait);
else if (positionals.length === 3) await ask(...positionals);
else {
  console.error(USAGE);
  process.exitCode = 1;
}

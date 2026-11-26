#!/usr/bin/env node
// A small client for the external ask routes (fork-only, plans/feat-external-ask.md): type a request
// into one session and print the answer. For trying the feature by hand and checking that a server
// has it switched on; the real caller is a program of its own (edgar).
//
//   node scripts/external-ask.mjs <session-id> <expected-cwd> "<text>" [--port 34567] [--token <file>] [--no-wait]
//   node scripts/external-ask.mjs --list [--port 34567] [--token <file>]
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
const MAX_WAITS = 10;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: "string", default: process.env.MULMOTERMINAL_PORT ?? "34567" },
    token: { type: "string", default: path.join(os.homedir(), ".mulmoterminal", "external-ask-token") },
    list: { type: "boolean", default: false },
    "no-wait": { type: "boolean", default: false },
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
    console.log(`${s.id}  ${s.agent}  ${stateOf(s)}  allowed=${s.allowed}  ${s.cwd}${memo}`);
  }
}

async function ask(session, expectCwd, text) {
  const sent = await call(`${base}/${session}/asks`, { method: "POST", body: JSON.stringify({ text, expectCwd }) });
  if (sent.status !== 202) return fail(sent.status, sent.body);
  console.error(`sent as ${sent.body.askId}`);
  if (values["no-wait"]) return;
  for (let i = 0; i < MAX_WAITS; i += 1) {
    const { status, body } = await call(`${base}/${session}/asks/${sent.body.askId}?waitSeconds=${WAIT_SECONDS}`);
    if (status !== 200) return fail(status, body);
    if (body.status === "answered") return console.log(body.reply);
    console.error(`pending (seen=${body.seen}, working=${body.working})`);
  }
  console.error(`no answer yet; ask again later with askId ${sent.body.askId}`);
  process.exitCode = 2;
}

function fail(status, body) {
  console.error(`${status} ${body.error ?? ""}: ${body.message ?? JSON.stringify(body)}`);
  process.exitCode = 1;
}

if (values.list) await list();
else if (positionals.length === 3) await ask(...positionals);
else {
  console.error(
    'usage: external-ask.mjs <session-id> <expected-cwd> "<text>" [--port N] [--token file] [--no-wait]\n       external-ask.mjs --list [--port N] [--token file]',
  );
  process.exitCode = 1;
}

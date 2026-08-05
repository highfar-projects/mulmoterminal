// `mulmoterminal room post|read <room> …` — taking part in a conversation room from a shell (#1456).
//
// This is how everything that is NOT an agent joins in: a person at a prompt, a shell cell beside
// the agents, a CI job posting a test result into the discussion. The agents themselves call
// nothing — the round-table runner reads their turns and writes for them — so this CLI and the
// runner are the room's only writers, and both are things a human started.
//
// It talks to a RUNNING server over loopback rather than touching the room file directly: the
// server owns the append, so one writer cannot half-write a line another is reading.

const DEFAULT_PORT = 34567;

const usage = () => {
  console.log(`
Usage: mulmoterminal room <command>

  room read <room> [--since <epoch-ms>]   Print what has been said
  room post <room> <text…>                Add a message
  room list                               Rooms that exist

Options:
  --port <n>    Server port (default: ${DEFAULT_PORT})
  --from <name> Who the message is from (default: your username, or "cli")

The server must be running — this posts over http://localhost:<port>.
`);
};

/** The port to talk to: `--port`, else PORT from the environment, else the default. Read the same
 *  way the server itself reads it, so a user who moved the server does not have to say so twice. */
function portFrom(args) {
  const at = args.indexOf("--port");
  const named = at >= 0 ? Number(args[at + 1]) : Number(process.env.PORT);
  return Number.isFinite(named) && named > 0 ? named : DEFAULT_PORT;
}

/** The flags this CLI knows, and that each takes a value. Everything else is TEXT.
 *
 *  Named explicitly rather than "anything starting with --", because the text being parsed is a
 *  MESSAGE somebody is posting: `room post standup "use --force carefully"` would otherwise lose
 *  both `--force` and the word after it, silently (Codex review on #1456). A message is the one
 *  argument that must survive whatever it happens to contain. */
const VALUE_FLAGS = new Set(["--port", "--from", "--since"]);

function flag(args, name) {
  const at = args.indexOf(name);
  return at >= 0 && VALUE_FLAGS.has(name) ? args[at + 1] : undefined;
}

/** Everything that is not one of the known flags or its value — the command, the room id, and the
 *  message text exactly as it was typed. `--` ends flag parsing, so a message that really does
 *  start with a known flag can still be posted. */
function positional(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      out.push(...args.slice(i + 1));
      break;
    }
    if (VALUE_FLAGS.has(arg)) {
      i++; // its value
      continue;
    }
    out.push(arg);
  }
  return out;
}

export const positionalForTest = positional;
export const flagForTest = flag;

const speaker = (args) => flag(args, "--from") || process.env.USER || "cli";

async function request(port, path, init) {
  const url = `http://localhost:${port}${path}`;
  try {
    // Origin, because posting is same-origin guarded: this IS the local machine, and saying so is
    // what the guard asks for.
    const res = await fetch(url, { ...init, headers: { ...(init?.headers ?? {}), Origin: `http://localhost:${port}` } });
    if (!res.ok) {
      console.error(`mulmoterminal room: server answered ${res.status}`);
      return null;
    }
    return await res.json();
  } catch {
    console.error(`mulmoterminal room: could not reach the server at ${url} — is it running?`);
    return null;
  }
}

export async function runRoom(args) {
  const [command, room, ...rest] = positional(args);
  const port = portFrom(args);

  if (!command || command === "--help" || command === "help") return usage();

  if (command === "list") {
    const body = await request(port, "/api/rooms");
    if (body) (body.rooms ?? []).forEach((name) => console.log(name));
    return;
  }

  if (!room) {
    console.error("mulmoterminal room: which room?");
    return usage();
  }

  if (command === "read") {
    const since = Number(flag(args, "--since")) || 0;
    const body = await request(port, `/api/rooms/${encodeURIComponent(room)}?since=${since}`);
    if (!body) return;
    (body.messages ?? []).forEach((message) => {
      console.log(`--- ${message.from} ---`);
      console.log(message.text);
      console.log("");
    });
    return;
  }

  if (command === "post") {
    const text = rest.join(" ").trim();
    if (!text) {
      console.error("mulmoterminal room: nothing to post");
      return;
    }
    const body = await request(port, `/api/rooms/${encodeURIComponent(room)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: speaker(args), text }),
    });
    if (body?.ok) console.log(`posted to ${room}`);
    return;
  }

  console.error(`mulmoterminal room: unknown command ${JSON.stringify(command)}`);
  usage();
}

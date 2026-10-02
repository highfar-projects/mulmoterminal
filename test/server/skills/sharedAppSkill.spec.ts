// @vitest-environment node
//
// The declaration in the skill is COPIED by the agent, verbatim, into a user's repository. The one
// this shipped with could not be deployed at all — `auth: "anonymous"` is refused, `initialStatus`
// needs a `statusField` beside it, and an identity-binding submit needs `submitOnly` — and nothing
// caught it, because prose is not run.
//
// So it is run here: the sample is lifted out of the file and put through the same gate a deploy
// puts it through. Documentation that stops matching the engine fails as a test rather than as a
// user's first attempt.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CollectionSchemaZ } from "@mulmoclaude/core/collection/server";
import { parseAuthoredApp, publishProblems } from "@receptron/sharedapp";

const SKILL = path.join(process.cwd(), "server/skills/mulmoterminal-shared-app/SKILL.md");
const body = readFileSync(SKILL, "utf-8");

/** Every ```json block in the skill, in order. */
const jsonBlocks = (): unknown[] => [...body.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => JSON.parse(match[1] ?? "null") as unknown);

/** The blocks that are whole declarations (as opposed to the one-key fragments the prose uses to
 *  point at a single line). */
const declarations = (): Record<string, unknown>[] =>
  jsonBlocks().filter((block): block is Record<string, unknown> => typeof block === "object" && block !== null && ("members" in block || "public" in block));

describe("the shared-app skill's sample declarations", () => {
  it("has some to check", () => {
    expect(declarations().length).toBeGreaterThan(0);
  });

  it("parse, and pass the gate a deploy puts them through", () => {
    for (const declaration of declarations()) {
      // The samples are fragments of one app: the roster is in the first, the public block in the
      // second. Merged with an aid and an owner, each must be a declaration that would deploy.
      const whole = { aid: "app-under-test", members: { "owner@example.com": { "*": "owner" } }, ...declaration };
      const parsed = parseAuthoredApp(JSON.stringify(whole));
      expect(parsed.ok ? [] : parsed.problems).toEqual([]);
      if (!parsed.ok) continue;
      const collections = Object.keys(parsed.app.public?.submit ?? {}).map((cid) => ({ cid, primaryKey: "id" }));
      expect(publishProblems(parsed.app, collections, "owner@example.com")).toEqual([]);
    }
  });
});

describe("the shared-app skill's operations", () => {
  // Every one of these was learned by watching the agent do it the other way: compose the
  // declaration from memory (and guess the owner), rewrite the file to recover from a refusal, and
  // find out only at deploy that it would not deploy.
  it("sends the declaration through the tool rather than describing the file", () => {
    for (const fact of ['action: "init"', 'action: "check"', 'action: "invite"']) {
      expect(body).toContain(fact);
    }
  });

  it("says why the owner cannot be composed by hand", () => {
    expect(body).toContain("SIGNED IN");
  });
});

describe("the shared-app skill's schema advice", () => {
  // The agent that followed this wrote `fields` as a LIST of `{ name, title }`, with no
  // `primaryKey` and no `icon` — a shape nothing in the engine accepts. The skill now sends it to
  // `schemaDocs` instead of describing the shape, and this pins the two facts that made the
  // guess wrong.
  it("names the tool that owns the shape rather than describing it", () => {
    expect(body).toContain("schemaDocs");
    expect(body).toContain("putSchema");
  });

  // The run this was written from tried to CREATE a collection with `putSchema` and was refused:
  // it is edit-only. Getting that backwards costs the agent its whole first attempt.
  it("says that a new collection is created by writing the files", () => {
    expect(body).toContain("EDIT-ONLY");
    expect(body).toContain("SKILL.md");
  });

  it("says what a guessed schema gets wrong", () => {
    for (const fact of ["`fields` is an OBJECT", "`primaryKey`", "`icon` are required", "`label`"]) {
      expect(body).toContain(fact);
    }
  });

  it("agrees with the engine about the shape it warns of", () => {
    const guessed = { title: "Responses", storage: { type: "firestore" }, fields: [{ name: "name", type: "string", title: "Name" }] };
    const engine = {
      title: "Responses",
      icon: "assignment",
      primaryKey: "id",
      storage: { type: "firestore" },
      fields: { id: { type: "string", label: "ID", primary: true, required: true } },
    };
    expect(CollectionSchemaZ.safeParse(guessed).success).toBe(false);
    expect(CollectionSchemaZ.safeParse(engine).success).toBe(true);
  });
});

describe("the skill's question about showing what was sent", () => {
  // The skill offers the author three choices and lists what publish refuses. Each is a declaration
  // an agent will write from that prose, so each is put through the gate here.
  const app = (overrides: { collections?: object; public?: object; submit?: object } = {}) => ({
    aid: "app-under-test",
    members: { "owner@example.com": { "*": "owner" } },
    collections: overrides.collections ?? {},
    public: { enabled: true, submit: { questions: { auth: "anonymous", createFields: ["text"], ...overrides.submit } }, ...overrides.public },
  });
  const problems = (declaration: object): string[] => {
    const parsed = parseAuthoredApp(JSON.stringify(declaration));
    return parsed.ok ? publishProblems(parsed.app, [{ cid: "questions", primaryKey: "id" }], "owner@example.com") : parsed.problems;
  };
  const chosen = { collections: { questions: { publishField: "shown" } }, public: { readPublished: ["questions"] } };

  it("offers three choices, and each deploys", () => {
    expect(problems(app())).toEqual([]);
    expect(problems(app(chosen))).toEqual([]);
    expect(problems(app({ public: { read: ["questions"] } }))).toEqual([]);
  });

  const sender = { auth: "verifiedEmail", emailField: "email", createFields: ["text", "email"] };
  it.each([
    ["readPublished with no publishField", app({ public: { readPublished: ["questions"] } }), "publishField is not declared"],
    [
      "a collection in both read and readPublished",
      app({ ...chosen, public: { read: ["questions"], readPublished: ["questions"] } }),
      "public.read names it too",
    ],
    ["a publishField a sender creates", app({ ...chosen, submit: { createFields: ["text", "shown"] } }), "createFields includes 'shown'"],
    [
      "a publishField a sender updates",
      app({
        ...chosen,
        submit: { ...sender, selfUpdate: { open: ["shown"] } },
        collections: { questions: { publishField: "shown", statusField: "status", submitOnly: true } },
      }),
      "selfUpdate.open includes 'shown'",
    ],
    [
      "a publishField named like the status field",
      app({ ...chosen, collections: { questions: { publishField: "status", statusField: "status" } } }),
      "also the statusField",
    ],
  ])("refuses %s, as the skill says", (_label, declaration, reason) => {
    expect(problems(declaration)).toEqual([expect.stringContaining(reason)]);
  });

  // publishField may not share a name with any field that already means something to the rules.
  it.each([
    ["statusField", { collections: { questions: { publishField: "f", statusField: "f" } } }],
    ["assigneeField", { collections: { questions: { publishField: "f", assigneeField: "f" } } }],
    ["stampField", { submit: { stampField: "f" } }],
    ["idField", { submit: { idField: "f" } }],
    ["uidField", { submit: { uidField: "f" } }],
    ["emailField", { submit: { auth: "verifiedEmail", emailField: "f", createFields: ["text", "f"] } }],
  ])("refuses a publishField named like the %s", (key, overrides) => {
    const declaration = app({ collections: { questions: { publishField: "f" } }, public: { readPublished: ["questions"] }, ...overrides });
    expect(problems(declaration)).toContainEqual(expect.stringContaining(`which is also the ${key}`));
  });

  it("names the keys and refusals in the question", () => {
    const question = body.slice(body.indexOf("## Before you ask the user a question"), body.indexOf("## Where people actually look"));
    expect(question).toContain("Four things are worth asking");
    ["`public.readPublished`", "publishField", "`public.read: [cid]`", "/m/{slug}", "templates/tally.md"].forEach((phrase) =>
      expect(question).toContain(phrase),
    );
  });
});

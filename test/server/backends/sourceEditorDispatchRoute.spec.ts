// @vitest-environment node
//
// The shared source-editor dispatch route, driven with a fake plugin so every branch is reachable
// without a package: which kinds it takes, what it refuses, and when a save is announced.
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import { appRequest } from "../../helpers/appRequest.js";

const published: string[] = [];
vi.mock("../../../server/backends/fileChange.js", () => ({
  publishFileChange: async (changedPath: string) => {
    published.push(changedPath);
  },
}));

const { mountSourceEditorDispatchRoute } = await import("../../../server/backends/sourceEditorDispatchRoute.js");

const ROUTE = "/api/plugin/presentFake";
const FALL_THROUGH_STATUS = 299;

type FakeArgs = { kind: "loadFake"; path: string } | { kind: "saveFake"; path: string; body: string };

const isFakeArgs = (value: unknown): value is FakeArgs => {
  if (typeof value !== "object" || value === null || !("kind" in value) || !("path" in value)) return false;
  if (typeof value.path !== "string") return false;
  if (value.kind === "loadFake") return true;
  return value.kind === "saveFake" && "body" in value && typeof value.body === "string";
};

const executed: FakeArgs[] = [];

function call(body: unknown): Promise<Response> {
  const app = express();
  app.use(express.json());
  mountSourceEditorDispatchRoute(app, {
    route: ROUTE,
    loadKind: "loadFake",
    saveKind: "saveFake",
    isDispatchArgs: isFakeArgs,
    invalidArgsError: "invalid presentFake dispatch args",
    execute: async (args) => {
      executed.push(args);
      if (args.path === "boom") throw new Error("disk on fire");
      return { done: args.kind };
    },
  });
  app.post(ROUTE, (_req, res) => {
    res.status(FALL_THROUGH_STATUS).json({ fellThrough: true });
  });
  return appRequest(app)(ROUTE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const MATRIX = [undefined, "loadFake", "saveFake", "other", 1].flatMap((kind) =>
  [undefined, "a", "boom", 2].flatMap((sentPath) => [undefined, "x", 0].map((body) => ({ kind, path: sentPath, body }))),
);

async function expectOwnKindsOnly(sent: { kind: unknown; path: unknown; body: unknown }): Promise<void> {
  published.length = 0;
  executed.length = 0;
  const res = await call(sent);
  const ownKind = sent.kind === "loadFake" || sent.kind === "saveFake";
  expect(res.status === FALL_THROUGH_STATUS, JSON.stringify(sent)).toBe(!ownKind);
  expect(executed).toHaveLength(ownKind && isFakeArgs(JSON.parse(JSON.stringify(sent))) ? 1 : 0);
  const savedOk = res.status === 200 && sent.kind === "saveFake";
  expect(published).toEqual(savedOk ? [sent.path] : []);
}

beforeEach(() => {
  published.length = 0;
  executed.length = 0;
});

describe("mountSourceEditorDispatchRoute", () => {
  it.each([{}, { kind: "packFake", path: "a" }, { kind: 7 }, []])("leaves %j to the next handler", async (body) => {
    const res = await call(body);
    expect(res.status).toBe(FALL_THROUGH_STATUS);
    expect(executed).toEqual([]);
  });

  it.each([{ kind: "loadFake" }, { kind: "saveFake", path: "a" }, { kind: "saveFake", path: "a", body: 3 }])(
    "refuses malformed %j before executing",
    async (body) => {
      const res = await call(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid presentFake dispatch args" });
      expect(executed).toEqual([]);
    },
  );

  it("answers a load with the result and announces nothing", async () => {
    const res = await call({ kind: "loadFake", path: "a" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ done: "loadFake" });
    expect(published).toEqual([]);
  });

  it("announces a save under its path", async () => {
    const res = await call({ kind: "saveFake", path: "dir/a", body: "x" });
    expect(res.status).toBe(200);
    expect(published).toEqual(["dir/a"]);
  });

  it("turns a failing execute into a 400 with its message, and announces nothing", async () => {
    const res = await call({ kind: "saveFake", path: "boom", body: "x" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "disk on fire" });
    expect(published).toEqual([]);
  });

  // Property over the whole kind x path x body matrix: only the two declared kinds are ever
  // executed, and a file change is announced exactly when a save succeeded.
  it("executes only its own kinds, and publishes exactly on a successful save", async () => {
    for (const sent of MATRIX) await expectOwnKindsOnly(sent);
  });
});

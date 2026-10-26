// @vitest-environment node
// The gates every request passes first (#3188), on a real Express server: a request addressed to a
// name the server does not answer to reaches no route and no static file; an allowed one does.
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import express from "express";
import http from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { mountRequestGates } from "../../../server/routes/request-gates.js";
import { createIsAllowedHost, createIsAllowedOrigin } from "../../../server/infra/http/allowed-origin.js";

const reached: string[] = [];
let server: http.Server;
let port = 0;

beforeAll(async () => {
  const app = express();
  mountRequestGates(app, { isAllowedHost: createIsAllowedHost(new Set()), isAllowedOrigin: createIsAllowedOrigin(new Set()) });
  app.get("/api/sessions", (_req, res) => {
    reached.push("route");
    res.json({ secret: true });
  });
  app.use((_req, res) => {
    reached.push("fallback");
    res.send("<!doctype html>");
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  port = address && typeof address === "object" ? (address satisfies AddressInfo).port : 0;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const get = (path: string, host: string): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method: "GET", headers: { host } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });

describe("mountRequestGates", () => {
  it.each(["/api/sessions", "/", "/assets/index.js"])("refuses %s addressed to a foreign name, before any route or fallback", async (path) => {
    reached.length = 0;
    const answer = await get(path, `attacker.example:${port}`);
    expect(answer.status).toBe(403);
    expect(answer.body).not.toContain("secret");
    expect(reached).toEqual([]);
  });

  it("refuses a Host smuggling a loopback name behind userinfo", async () => {
    reached.length = 0;
    expect((await get("/api/sessions", `evil.example@localhost:${port}`)).status).toBe(403);
    expect(reached).toEqual([]);
  });

  it.each(["localhost", "127.0.0.1"])("answers a request addressed to %s", async (name) => {
    reached.length = 0;
    const answer = await get("/api/sessions", `${name}:${port}`);
    expect(answer.status).toBe(200);
    expect(reached).toEqual(["route"]);
  });
});

// The gates only protect what is mounted after them, so mountAppRoutes must call them before
// anything else. Read from the function's own body, comments stripped, so a comment cannot satisfy it.
describe("mountAppRoutes", () => {
  it("mounts the request gates as its first statement", () => {
    const source = readFileSync(new URL("../../../server/routes/app-routes.ts", import.meta.url), "utf8");
    const body = source.slice(source.indexOf("export function mountAppRoutes("));
    const statements = body
      .slice(body.indexOf("{") + 1)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("//"));
    expect(statements[0]).toBe("mountRequestGates(app, deps);");
  });
});

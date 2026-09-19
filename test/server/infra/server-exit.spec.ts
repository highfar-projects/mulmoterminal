// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { serverErrorExit, PORT_IN_USE_EXIT_CODE, SERVER_ERROR_EXIT_CODE } from "../../../server/infra/server-exit.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("serverErrorExit", () => {
  describe("a port taken at bind time", () => {
    it("asks for the launcher's retry code", () => {
      expect(serverErrorExit({ code: "EADDRINUSE" }, 34567).code).toBe(PORT_IN_USE_EXIT_CODE);
    });

    it("names the port and how to change it", () => {
      expect(serverErrorExit({ code: "EADDRINUSE" }, 34567).message).toBe("[mulmoterminal] Port 34567 is already in use — set PORT=<n> or pass --port <n>.");
    });

    it("takes the port as given, whether a number or a string", () => {
      expect(serverErrorExit({ code: "EADDRINUSE" }, "8080").message).toContain("Port 8080 ");
    });
  });

  describe("any other failure", () => {
    // Retrying on a different port cannot fix these, so the launcher must be told to stop.
    it.each([
      ["a different errno", { code: "EACCES" }],
      ["an Error", new Error("socket hang up")],
      ["an errno-less object", { message: "nope" }],
      ["a string", "nope"],
      ["a number", 7],
      ["null", null],
      ["undefined", undefined],
    ])("exits %s with the generic code", (_label, err) => {
      expect(serverErrorExit(err, 34567).code).toBe(SERVER_ERROR_EXIT_CODE);
    });

    it("carries an Error's own message", () => {
      expect(serverErrorExit(new Error("socket hang up"), 34567).message).toBe("[mulmoterminal] server error: socket hang up");
    });

    it("renders a thrown non-Error rather than dropping it", () => {
      expect(serverErrorExit("nope", 34567).message).toBe("[mulmoterminal] server error: nope");
    });

    // EACCES on a privileged port is the near miss: it looks port-related, but a retry on
    // another port is the launcher's job to decide, not this one's — and today it stops.
    it("does not treat a permission error as a port clash", () => {
      expect(serverErrorExit({ code: "EACCES" }, 80).code).not.toBe(PORT_IN_USE_EXIT_CODE);
    });
  });

  // Both files carry the number as a literal and a comment asking the other to keep in step.
  // Nothing enforced it: changing one side silently breaks the retry — the app just fails to
  // start on a busy port, with no sign of why.
  //
  // The launcher side of the literal lives in bin/server-supervision.js, which is where the
  // launcher now asks what an exit MEANS; bin/mulmoterminal.js imports it from there, so there is
  // one launcher-side copy and this still pins the pair.
  describe("the contract with bin/server-supervision.js", () => {
    const supervision = readFileSync(path.join(REPO_ROOT, "bin", "server-supervision.js"), "utf8");

    it("uses the exit code the launcher retries on", () => {
      const declared = supervision.match(/PORT_IN_USE_EXIT_CODE\s*=\s*(\d+)/);
      expect(declared, "bin/server-supervision.js no longer declares PORT_IN_USE_EXIT_CODE — the retry contract moved or was renamed").not.toBeNull();
      expect(Number(declared?.[1])).toBe(PORT_IN_USE_EXIT_CODE);
    });

    it("is still what the launcher-side decision branches on", () => {
      expect(supervision).toMatch(/code === PORT_IN_USE_EXIT_CODE/);
    });

    it("is the only launcher-side copy of the number", () => {
      // Asked of the whole of bin/ rather than of the two files above: a third copy is how the
      // pair drifted in the first place, and it would satisfy any guard that only knows about two.
      const binDir = path.join(REPO_ROOT, "bin");
      const declaring = readdirSync(binDir)
        .filter((name) => name.endsWith(".js"))
        .filter((name) => /PORT_IN_USE_EXIT_CODE\s*=\s*\d+/.test(readFileSync(path.join(binDir, name), "utf8")));
      expect(declaring).toEqual(["server-supervision.js"]);
    });
  });
});

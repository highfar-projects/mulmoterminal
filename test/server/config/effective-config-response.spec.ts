// @vitest-environment node
//
// `--agent` changes what /api/config ANSWERS and must never change what gets WRITTEN (#2082).
//
// The two share `toPublicAppConfig` — it is what `serializableAppConfig` persists — so merging the
// flag one level too high would edit the user's own config.json on the next save. A one-launch flag
// quietly becoming a permanent setting is the kind of thing nobody notices until they wonder why
// the app stopped opening on Claude months later.
import { describe, it, expect } from "vitest";
import { emptyConfig, serializableAppConfig, toPublicAppConfig } from "../../../server/config/app-config.js";
import { effectiveConfigResponse } from "../../../server/config/config-routes.js";

describe("the --agent flag and the config file", () => {
  // Asserted against the DISK writer specifically, because that is the half that can do damage.
  it("never writes a defaultAgent the file did not already have", () => {
    const written = serializableAppConfig(emptyConfig(), {});
    expect(written.defaultAgent).toBeNull();
  });

  it("round-trips a defaultAgent the user really did set", () => {
    const written = serializableAppConfig({ ...emptyConfig(), defaultAgent: "codex" }, {});
    expect(written.defaultAgent).toBe("codex");
  });

  // The response and the file are built from the same function, which is exactly why the override
  // has to sit outside it. If this ever fails, the flag has been merged too early.
  it("keeps toPublicAppConfig ignorant of the flag — it is shared with the disk writer", () => {
    expect(toPublicAppConfig(emptyConfig()).defaultAgent).toBeNull();
  });

  // THE OTHER HALF, and this file did not have it (Codex, round 1 of #2084).
  //
  // Everything above asserts the flag does NOT reach somewhere. All of it stays green if the
  // override is deleted outright — "it is not here" is satisfied perfectly by a feature that does
  // not exist.
  //
  // The override is passed as an ARGUMENT rather than read from module state, because the first
  // attempt at this test asserted against `ARGV_DEFAULT_AGENT` — which is null under vitest, so it
  // compared null to null and survived deleting the very line it was guarding. A test that cannot
  // distinguish is the thing being fixed here, so it must not be the thing doing the fixing.
  it("puts the flag in the response, beating the file", () => {
    const withFlag = effectiveConfigResponse({ ...emptyConfig(), defaultAgent: "grok" }, "/w", "codex");
    expect(withFlag.defaultAgent).toBe("codex");
    expect(withFlag.cwd).toBe("/w");
  });

  it("falls through to the file when no flag was given", () => {
    expect(effectiveConfigResponse({ ...emptyConfig(), defaultAgent: "grok" }, "/w", null).defaultAgent).toBe("grok");
  });

  it("answers null when neither the flag nor the file names one", () => {
    expect(effectiveConfigResponse(emptyConfig(), "/w", null).defaultAgent).toBeNull();
  });
});

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
});

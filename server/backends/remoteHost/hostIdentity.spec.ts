import { describe, expect, it } from "vitest";

import { LEGACY_HOST_ID, chooseHostId, legacyHostDocOf, machineLabel, newIdentity, parseHostIdentity, reusableIdentity, type HostIdentity } from "./hostIdentity.js";

const STORED: HostIdentity = { uid: "uid-1", hostId: "mulmoterminal-0000ffff", machineId: "m-1", hostname: "work-mac.local" };

describe("parseHostIdentity", () => {
  it("reads a complete record", () => {
    expect(parseHostIdentity({ ...STORED, extra: 1 })).toEqual(STORED);
  });

  it("refuses anything incomplete or malformed", () => {
    const broken: unknown[] = [null, undefined, "x", 3, [], {}, { ...STORED, uid: "" }, { ...STORED, hostId: 1 }, { ...STORED, machineId: null }, { ...STORED, hostname: undefined }];
    broken.forEach((value) => expect(parseHostIdentity(value)).toBeNull());
  });
});

describe("legacyHostDocOf", () => {
  it("reads a machine id when there is one", () => {
    expect(legacyHostDocOf({ online: true, machineId: "m-2" })).toEqual({ machineId: "m-2" });
  });

  it("treats a doc without a usable machine id as one that predates them", () => {
    [undefined, null, {}, { online: true }, { machineId: "" }, { machineId: 7 }, []].forEach((data) => expect(legacyHostDocOf(data)).toEqual({ machineId: null }));
  });
});

describe("reusableIdentity", () => {
  it("keeps the record for the same account on the same hostname", () => {
    expect(reusableIdentity(STORED, "uid-1", "work-mac.local")).toBe(STORED);
  });

  it("drops it for another account, another hostname (a copied directory), or no record", () => {
    expect(reusableIdentity(STORED, "uid-2", "work-mac.local")).toBeNull();
    expect(reusableIdentity(STORED, "uid-1", "home-linux")).toBeNull();
    expect(reusableIdentity(null, "uid-1", "work-mac.local")).toBeNull();
  });
});

describe("chooseHostId", () => {
  it("claims the legacy id only from a doc that predates machine ids", () => {
    expect(chooseHostId({ machineId: null }, "0000ffff")).toBe(LEGACY_HOST_ID);
  });

  it("takes a suffixed id for a new account or when another machine holds the legacy id", () => {
    expect(chooseHostId(null, "0000ffff")).toBe("mulmoterminal-0000ffff");
    expect(chooseHostId({ machineId: "m-2" }, "0000ffff")).toBe("mulmoterminal-0000ffff");
  });
});

describe("newIdentity", () => {
  it("records the chosen id with this machine's id and hostname", () => {
    expect(newIdentity({ uid: "uid-1", hostname: "h", legacyDoc: null, suffix: "abcdef01", machineId: "m-9" })).toEqual({
      uid: "uid-1",
      hostId: "mulmoterminal-abcdef01",
      machineId: "m-9",
      hostname: "h",
    });
  });
});

describe("machineLabel", () => {
  it("drops macOS's .local and keeps everything else", () => {
    expect(machineLabel("work-mac.local")).toBe("work-mac");
    expect(machineLabel("home-linux")).toBe("home-linux");
    expect(machineLabel(".local")).toBe(".local");
  });
});

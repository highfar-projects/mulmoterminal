// What the directory form's sections ask of one key: is it written, and is it in the local file.
import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { useDirFormKeys } from "../../../../src/components/settings/useDirFormKeys";
import type { DirConfigDetailView } from "../../../../src/components/dirConfigDetail";
import { EMPTY_DIR_CONFIG_SOURCE } from "../../../../common/dirConfigSource";
import type { DirFormKey } from "../../../../common/dirConfigForm";

const KEYS: DirFormKey[] = ["icon", "sound", "sounds", "addDirs", "skills", "decks", "worktreeEnv", "backgroundImage"];
// Written with any value at all — including ones that read as "nothing" — still counts as written.
const VALUES = [undefined, null, "", 0, false, [], {}, "x"];

const detailWith = (formValues: Record<string, unknown>, local: string[]): DirConfigDetailView => ({
  exists: true,
  file: null,
  localFile: null,
  repoFile: null,
  rows: [],
  source: { ...EMPTY_DIR_CONFIG_SOURCE, local },
  formValues,
});

describe("useDirFormKeys", () => {
  it.each(VALUES)("a key is set when the form values hold it, whatever it holds: %j", (value) => {
    KEYS.forEach((key) => {
      const { isSet } = useDirFormKeys(() => detailWith({ [key]: value }, []));
      expect(KEYS.filter(isSet)).toEqual([key]);
    });
  });

  it("a key is local exactly when the source lists it as local", () => {
    KEYS.forEach((key) => {
      const { isLocal } = useDirFormKeys(() => detailWith({}, [key]));
      expect(KEYS.filter(isLocal)).toEqual([key]);
    });
  });

  it("follows a redraw that hands a new detail", () => {
    const detail = ref(detailWith({ icon: false }, ["icon"]));
    const { values, isSet, isLocal } = useDirFormKeys(() => detail.value);
    detail.value = detailWith({ sound: "ping" }, []);
    expect(values.value).toEqual({ sound: "ping" });
    expect([isSet("icon"), isSet("sound"), isLocal("icon")]).toEqual([false, true, false]);
  });
});

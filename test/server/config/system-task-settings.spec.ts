// @vitest-environment node
import { describe, it, expect } from "vitest";
import { systemTaskSettingsChanged, type SystemTaskSettings } from "../../../server/config/system-task-settings";

const BASE: SystemTaskSettings = { worklogEnabled: false, worklogIntervalHours: 6, feedRefreshEnabled: true, calendarSyncEnabled: true };

describe("systemTaskSettingsChanged", () => {
  it("is false when nothing the system tasks are built from moved", () => {
    expect(systemTaskSettingsChanged(BASE, { ...BASE })).toBe(false);
    expect(systemTaskSettingsChanged(BASE, { ...BASE, ...{ showLoadAverage: false } })).toBe(false);
  });

  it("is true when any one of the four moved", () => {
    const moved: Partial<SystemTaskSettings>[] = [
      { worklogEnabled: true },
      { worklogIntervalHours: 12 },
      { feedRefreshEnabled: false },
      { calendarSyncEnabled: false },
    ];
    moved.forEach((change) => expect(systemTaskSettingsChanged(BASE, { ...BASE, ...change })).toBe(true));
  });
});

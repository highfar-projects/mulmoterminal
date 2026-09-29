// The rules a style's chaff.yaml sets, read from `chaff rules --json`: each rule's level where the setting comes from
// that file. Shared by the rules step (every setting has a reason) and the counter step (every setting bites).

/** Rule id → level, for the rules whose setting comes from `configFile`. */
export const configuredRules = (current, configFile) =>
  new Map(
    (Array.isArray(current?.rules) ? current.rules : [])
      .filter((rule) => typeof rule?.your_setting?.from === "string" && rule.your_setting.from.endsWith(configFile))
      .map((rule) => [rule.id, rule.your_setting.level]),
  );

/** The rules `configFile` turns on (any level but off) that no finding shows firing. */
export const unprovenRules = (configured, findings) => {
  const fired = new Set(findings.map((finding) => finding.rule));
  return [...configured].filter(([id, level]) => level !== "off" && !fired.has(id)).map(([id]) => id);
};

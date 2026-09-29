import type { PlayfulEffects } from "../../../common/playfulEffects";

// Settings offers playfulEffects as on/off only: which pictures exist, and when they appear, is left
// for the user to find (the config skill says the same). Off forgets a picture chosen in the file,
// and on comes back as "random"; a setting that is already on is left as it is.
export const playfulIsOn = (setting: PlayfulEffects): boolean => setting !== "off";

export const playfulAfterSwitch = (setting: PlayfulEffects, on: boolean): PlayfulEffects => {
  if (!on) return "off";
  return setting === "off" ? "random" : setting;
};

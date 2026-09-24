import type { HeatLevel } from "../../../common/playfulEffects";

/** What a picture draws: the session's heat level, or 5 for the finale it plays once on cooling. */
export type StageLevel = HeatLevel | 5;

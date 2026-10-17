import type { HeatLevel } from "../../../common/playfulEffects";

/** What a picture draws: the session's heat level, or 5 for the finale it plays once on cooling. */
export type StageLevel = HeatLevel | 5;

/** How solid a picture is at each level, the user's own files included: faint when it appears,
 *  never opaque until the finale. */
export const STAGE_OPACITY: Record<StageLevel, number> = { 0: 0, 1: 0.35, 2: 0.5, 3: 0.6, 4: 0.7, 5: 1 };

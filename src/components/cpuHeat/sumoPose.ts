export type SumoPose = "stand" | "crouch" | "grapple" | "victory";

/** Arm strokes in a rikishi's own space: feet at the origin, facing right, up is negative. */
export const ARM_PATHS: Record<SumoPose, readonly string[]> = {
  stand: ["M10 -56 Q22 -46 24 -34", "M-6 -56 Q-14 -46 -12 -34"],
  crouch: ["M10 -52 Q28 -34 30 -4", "M-2 -52 Q18 -30 18 -4"],
  grapple: ["M10 -56 Q30 -52 36 -30", "M0 -54 Q22 -44 30 -22"],
  victory: ["M10 -58 Q30 -84 22 -112", "M-6 -56 Q-14 -46 -12 -34"],
};

/** A crouch is the same body squashed toward the ground, so hands that reach the floor stay on it. */
export const BODY_TRANSFORM: Record<SumoPose, string> = {
  stand: "",
  crouch: "scale(1 0.88)",
  grapple: "scale(1 0.96)",
  victory: "",
};

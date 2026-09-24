// Colours per theme. The overlay blends with the terminal: `screen` keeps the lighter pixel (a
// dark theme's background drops out), `multiply` keeps the darker one (a light theme's does). So
// the neutral parts flip between the two, while the hot colours read on both.

export type Appearance = "light" | "dark";

export interface HeatPalette {
  blend: "mix-blend-screen" | "mix-blend-multiply";
  bodyStops: [string, string, string];
  ink: string;
  cap: string;
  highlight: string;
  fuse: string;
  smoke: string;
  bone: string;
  hole: string;
  metal: string;
  vignetteBase: string;
}

export const HEAT_PALETTE: Record<Appearance, HeatPalette> = {
  dark: {
    blend: "mix-blend-screen",
    bodyStops: ["#b9c3f5", "#6b76b8", "#2f3770"],
    ink: "#d6dcff",
    cap: "#8a93c9",
    highlight: "#ffffff",
    fuse: "#f0c987",
    smoke: "#9aa3c7",
    bone: "#efe6cc",
    hole: "#000000",
    metal: "#dfe4f5",
    vignetteBase: "#000000",
  },
  light: {
    blend: "mix-blend-multiply",
    bodyStops: ["#8f9ad0", "#2c3358", "#0c0f1f"],
    ink: "#0c0f1f",
    cap: "#3a4166",
    highlight: "#c9d2ff",
    fuse: "#7a5a2a",
    smoke: "#6b7390",
    bone: "#d9cfb0",
    hole: "#141414",
    metal: "#aab3d1",
    vignetteBase: "#ffffff",
  },
};

export const HOT = { red: "#ff3b1f", orange: "#ff9a1f", yellow: "#ffd36b", lava: "#ff5a1f", core: "#fff6d6" } as const;

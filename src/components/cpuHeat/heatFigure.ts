import type { HeatPalette } from "./heatPalette";
import type { StageLevel } from "./stageLevel";

/** What HeatStage hands every picture: the level to draw, the theme's colours, and whether it may move. */
export interface HeatFigureProps {
  level: StageLevel;
  palette: HeatPalette;
  animate: boolean;
}

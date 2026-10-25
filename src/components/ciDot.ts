// The CI dot's colour, shared by the PR list and the board: passing green (hardcoded, token-less),
// failing/pending on the theme err/amber tokens, no-checks the dim default.
import type { CiState } from "../../common/ghItems";

export function ciDotClass(ci: CiState): string {
  if (ci === "passing") return "bg-[#3fae6b]";
  if (ci === "failing") return "bg-err-text";
  if (ci === "pending") return "bg-amber";
  return "bg-dim";
}

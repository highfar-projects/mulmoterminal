// The overlays and menus: hover tips and aria-labels are translated (#2408); see tipCensus.ts.
import { describe, it, expect } from "vitest";
import { describeTipSurface } from "./tipCensus";
import { en } from "../../../src/i18n/en";
import AccountPickerSource from "../../../src/components/AccountPicker.vue?raw";
import AccountingOverlaySource from "../../../src/components/AccountingOverlay.vue?raw";
import CollectionsBrowseOverlaySource from "../../../src/components/CollectionsBrowseOverlay.vue?raw";
import GithubOverlaySource from "../../../src/components/GithubOverlay.vue?raw";
import GithubPaneSource from "../../../src/components/GithubPane.vue?raw";
import GithubPrRepoSource from "../../../src/components/GithubPrRepo.vue?raw";
import GridViewSource from "../../../src/components/GridView.vue?raw";
import LaunchPanelSource from "../../../src/components/LaunchPanel.vue?raw";
import ModelPickerSource from "../../../src/components/ModelPicker.vue?raw";
import ModelSetupHelpSource from "../../../src/components/ModelSetupHelp.vue?raw";
import MulmoMenuSource from "../../../src/components/MulmoMenu.vue?raw";
import RoomsOverlaySource from "../../../src/components/RoomsOverlay.vue?raw";
import RoundTableMenuSource from "../../../src/components/RoundTableMenu.vue?raw";
import RunMenuSource from "../../../src/components/RunMenu.vue?raw";
import SharedAppPreviewSource from "../../../src/components/SharedAppPreview.vue?raw";
import SharedAppAccessPanelSource from "../../../src/components/SharedAppAccessPanel.vue?raw";
import SkillMenuSource from "../../../src/components/SkillMenu.vue?raw";
import WikiBrowseOverlaySource from "../../../src/components/WikiBrowseOverlay.vue?raw";
import WikiGraphViewSource from "../../../src/components/WikiGraphView.vue?raw";

// The surface this section covers. A file added to the overlays or menus belongs here too.
describeTipSurface("overlays", {
  "AccountPicker.vue": AccountPickerSource,
  "AccountingOverlay.vue": AccountingOverlaySource,
  "CollectionsBrowseOverlay.vue": CollectionsBrowseOverlaySource,
  "GithubOverlay.vue": GithubOverlaySource,
  "GithubPane.vue": GithubPaneSource,
  "GithubPrRepo.vue": GithubPrRepoSource,
  "GridView.vue": GridViewSource,
  "LaunchPanel.vue": LaunchPanelSource,
  "ModelPicker.vue": ModelPickerSource,
  "ModelSetupHelp.vue": ModelSetupHelpSource,
  "MulmoMenu.vue": MulmoMenuSource,
  "RoomsOverlay.vue": RoomsOverlaySource,
  "RoundTableMenu.vue": RoundTableMenuSource,
  "RunMenu.vue": RunMenuSource,
  "SharedAppPreview.vue": SharedAppPreviewSource,
  "SharedAppAccessPanel.vue": SharedAppAccessPanelSource,
  "SkillMenu.vue": SkillMenuSource,
  "WikiBrowseOverlay.vue": WikiBrowseOverlaySource,
  "WikiGraphView.vue": WikiGraphViewSource,
});

// Two tables hand keys to t() by an enum from elsewhere; a value added there without a message
// here would show a key path, so each table's keys are pinned to the enum's members.
describe("the keyed tables", () => {
  it("words every CI state", () => {
    expect(Object.keys(en.tips.overlays.ci).sort()).toEqual(["failing", "none", "passing", "pending"]);
  });

  it("words every access subject", () => {
    expect(Object.keys(en.tips.overlays.accessSubject).sort()).toEqual(["participant", "stranger", "visitor", "writer"]);
  });
});

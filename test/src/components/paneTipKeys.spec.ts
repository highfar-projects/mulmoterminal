// The side panes' hover tips and aria-labels are translated (#2408); see tipCensus.ts.
import { describe, it, expect } from "vitest";
import { describeTipSurface } from "./tipCensus";
import { en } from "../../../src/i18n/en";
import ToolsPaneSource from "../../../src/components/ToolsPane.vue?raw";
import TranscriptPaneSource from "../../../src/components/TranscriptPane.vue?raw";
import PromptsPaneSource from "../../../src/components/PromptsPane.vue?raw";
import QuestionPaneSource from "../../../src/components/QuestionPane.vue?raw";
import GuiPanelSource from "../../../src/components/GuiPanel.vue?raw";
import FilesPaneSource from "../../../src/components/FilesPane.vue?raw";
import FileSearchSource from "../../../src/components/FileSearch.vue?raw";
import FileFinderSource from "../../../src/components/FileFinder.vue?raw";
import FilesOverlaySource from "../../../src/components/FilesOverlay.vue?raw";
import CopyCodeBlockSource from "../../../src/components/CopyCodeBlock.vue?raw";
import TimelineOverlaySource from "../../../src/components/TimelineOverlay.vue?raw";
import CollectionsPaneSource from "../../../src/components/CollectionsPane.vue?raw";
import CollectionChatPaneSource from "../../../src/components/CollectionChatPane.vue?raw";
import FilesViewModeButtonsSource from "../../../src/components/FilesViewModeButtons.vue?raw";

// The surface this section covers. A file added to the side panes belongs here too.
describeTipSurface("panes", {
  "ToolsPane.vue": ToolsPaneSource,
  "TranscriptPane.vue": TranscriptPaneSource,
  "PromptsPane.vue": PromptsPaneSource,
  "QuestionPane.vue": QuestionPaneSource,
  "GuiPanel.vue": GuiPanelSource,
  "FilesPane.vue": FilesPaneSource,
  "FileSearch.vue": FileSearchSource,
  "FileFinder.vue": FileFinderSource,
  "FilesOverlay.vue": FilesOverlaySource,
  "CopyCodeBlock.vue": CopyCodeBlockSource,
  "TimelineOverlay.vue": TimelineOverlaySource,
  "CollectionsPane.vue": CollectionsPaneSource,
  "CollectionChatPane.vue": CollectionChatPaneSource,
  "FilesViewModeButtons.vue": FilesViewModeButtonsSource,
});

// The six panes share one set of controls. Each pane words them as whole sentences, so a pane
// added to the list below without its five messages is a gap this names.
describe("the shared pane controls", () => {
  const PANES = ["tools", "conversation", "prompts", "question", "canvas", "collections"] as const;
  it.each(PANES)("has every control worded for the %s pane", (pane) => {
    expect(Object.keys(en.tips.panes[pane]).sort()).toEqual(["close", "expand", "expandAria", "restore", "restoreAria"]);
  });
});

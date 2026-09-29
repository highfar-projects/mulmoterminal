// The Files pane editor's change marks against HEAD (#2497): a thin bar beside each line that is new
// or changed, and a notch where lines were taken out, as VS Code's gutter shows them. Built on
// @codemirror/merge's diff, and kept current as the reader types.
import { StateField, Text, RangeSetBuilder, type Extension } from "@codemirror/state";
import { gutter, GutterMarker } from "@codemirror/view";
import { Chunk } from "@codemirror/merge";
import { changeMarks, type ChangeMarkKind } from "./cmChangeMarks";

// The app's own tokens, so the marks follow the theme the rest of the pane does.
const MARK_COLOUR: Record<ChangeMarkKind, string> = { added: "var(--ok)", modified: "var(--amber)", deleted: "var(--err-text)" };

class ChangeMarker extends GutterMarker {
  readonly kind: ChangeMarkKind;
  constructor(kind: ChangeMarkKind) {
    super();
    this.kind = kind;
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof ChangeMarker && other.kind === this.kind;
  }
  override toDOM(): HTMLElement {
    const bar = document.createElement("div");
    bar.dataset.change = this.kind;
    // A deletion has no line of its own, so it is a notch at the top of the line after the gap.
    bar.style.cssText = `width:3px;height:${this.kind === "deleted" ? "4px" : "100%"};background:${MARK_COLOUR[this.kind]}`;
    return bar;
  }
}

const MARKERS: Record<ChangeMarkKind, ChangeMarker> = {
  added: new ChangeMarker("added"),
  modified: new ChangeMarker("modified"),
  deleted: new ChangeMarker("deleted"),
};

/** The marks for a document compared with `original`. */
export function changeGutter(original: string): Extension {
  const base = Text.of(original.split("\n"));
  const chunks = StateField.define<readonly Chunk[]>({
    create: (state) => Chunk.build(base, state.doc),
    update: (value, tr) => (tr.docChanged ? Chunk.updateB(value, base, tr.newDoc, tr.changes) : value),
  });
  return [
    chunks,
    gutter({
      class: "cm-change-gutter",
      markers: (view) => {
        const builder = new RangeSetBuilder<GutterMarker>();
        changeMarks(view.state.field(chunks), base, view.state.doc).forEach((mark) => {
          const line = view.state.doc.line(mark.line);
          builder.add(line.from, line.from, MARKERS[mark.kind]);
        });
        return builder.finish();
      },
    }),
  ];
}

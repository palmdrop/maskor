import { useState } from "react";
import { SlotEditor, type EditorMode, type SlotLinkApi } from "./slot-editor";
import { LinkedText } from "./linked-text";
import { serifTextStyle } from "./margin-styles";

const PLACEHOLDER = "Thoughts on structure, character, things to rewrite…";

type Props = {
  notes: string;
  mode: EditorMode;
  // The configured Margin text size (`editor.marginFontSize`).
  fontSize: number;
  documentLinks?: SlotLinkApi;
  onChange: (value: string) => void;
};

// The Margin's free-prose notes as a full gutter tab (margin-orphan-and-notes-tab, Phase 2). Notes
// moved out of the column footer — where they covered/offset comments anchored near the fragment's
// end — into a third gutter tab beside Margin/Aspects. The tab owns its own active/edit state (a click
// activates the editor, blur/Escape deactivates); notes remain part of the Margin's save/swap pipeline
// through `marginEditor` (the fragment editor's coupled save flushes notes + comments together), so
// only the surface moved. The tab is force-mounted and hidden when inactive (see fragment-editor), so
// this component does not gate on visibility.
export function MarginNotesTab({ notes, mode, fontSize, documentLinks, onChange }: Props) {
  const [active, setActive] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="margin-notes-tab">
      <div
        className={`min-h-0 flex-1 overflow-y-auto rounded-md px-2 py-1 ${
          active ? "border border-border/60 bg-muted/20" : ""
        }`}
        data-slot-notes
      >
        {active ? (
          <SlotEditor
            value={notes}
            mode={mode}
            fontSize={fontSize}
            focusOnMount
            documentLinks={documentLinks}
            placeholder={PLACEHOLDER}
            onChange={onChange}
            onBlur={() => setActive(false)}
            onEscape={() => setActive(false)}
          />
        ) : (
          // A div (not a button) so resolved-link buttons nest validly; clicking the text opens the
          // editor, clicking a link navigates instead (LinkedText stops propagation).
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
          <div
            role="button"
            tabIndex={0}
            className="min-h-6 w-full cursor-text whitespace-pre-wrap text-left text-foreground/90"
            style={serifTextStyle(fontSize)}
            onClick={() => setActive(true)}
          >
            {notes ? (
              <LinkedText text={notes} documentLinks={documentLinks} />
            ) : (
              <span className="text-muted-foreground">{PLACEHOLDER}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

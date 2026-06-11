import { SlotEditor, type EditorMode } from "./slot-editor";
import { serifTextStyle } from "./margin-styles";

const PLACEHOLDER = "Thoughts on structure, character, things to rewrite…";

type Props = {
  notes: string;
  open: boolean;
  onToggle: () => void;
  active: boolean;
  mode: EditorMode;
  // The configured Margin text size (`editor.marginFontSize`).
  fontSize: number;
  onChange: (value: string) => void;
  onActivate: () => void;
  onDeactivate: () => void;
};

// The Margin's free-prose notes — a collapsible section at the foot of the column, reached after
// scrolling past the fragment text (margins-4: bottom-placed, scrolls with the content).
export function MarginNotesSection({
  notes,
  open,
  onToggle,
  active,
  mode,
  fontSize,
  onChange,
  onActivate,
  onDeactivate,
}: Props) {
  return (
    <section
      className="mt-8 flex flex-col gap-1 border-t border-border pt-3"
      data-testid="margin-notes"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="inline-block w-3">{open ? "▾" : "▸"}</span>
        <span>Notes</span>
      </button>
      {open && (
        <div
          className={`rounded-md px-2 py-1 ${active ? "border border-border/60 bg-muted/20" : ""}`}
          data-slot-notes
        >
          {active ? (
            <SlotEditor
              value={notes}
              mode={mode}
              fontSize={fontSize}
              focusOnMount
              placeholder={PLACEHOLDER}
              onChange={onChange}
              onBlur={onDeactivate}
              onEscape={onDeactivate}
            />
          ) : (
            <button
              type="button"
              className="min-h-6 w-full whitespace-pre-wrap text-left text-foreground/90"
              style={serifTextStyle(fontSize)}
              onClick={onActivate}
            >
              {notes || <span className="text-muted-foreground">{PLACEHOLDER}</span>}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

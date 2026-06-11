import type { SlotRow } from "@lib/margins/column";
import { SlotEditor, type EditorMode } from "./slot-editor";
import { serifTextStyle } from "./margin-styles";

type Props = {
  row: SlotRow;
  isActive: boolean;
  // The configured Margin text size (`editor.marginFontSize`).
  fontSize: number;
  // The caret is in this row's block — tint the comment back (the reciprocal cue).
  isCaretBlock: boolean;
  // Anchored mode positions the row at its block's measured top; expand-all relaxes to normal flow.
  positioned: boolean;
  top: number;
  blockHeight: number;
  // Collapse the idle row to its block's height (so a tall comment can't run into its neighbour).
  clip: boolean;
  isOverflowing: boolean;
  mode: EditorMode;
  draft: string;
  onHoverChange: (markerId: string | null) => void;
  onRemove: (markerId: string) => void;
  onActivateComment: (markerId: string) => void;
  onActivateBlock: (index: number) => void;
  onRevealComment: (markerId: string) => void;
  onChangeComment: (markerId: string, next: string) => void;
  onDraftChange: (blockIndex: number, blockText: string, next: string) => void;
  // Always deactivates the slot; for a comment it also drops it when emptied (bound by the parent).
  onBlur: () => void;
  onEscape: () => void;
  onNext: () => void;
  onPrevious: () => void;
};

// One Margin slot, anchored to its block's top: the bound comment (flowing text with a top-rule
// attachment cue, lifting onto an opaque overlay while focused), an empty hover-to-create slot, or the
// active slot editor. Type-to-create and the focus keymap are wired through the callbacks.
export function MarginRow({
  row,
  isActive,
  fontSize,
  isCaretBlock,
  positioned,
  top,
  blockHeight,
  clip,
  isOverflowing,
  mode,
  draft,
  onHoverChange,
  onRemove,
  onActivateComment,
  onActivateBlock,
  onRevealComment,
  onChangeComment,
  onDraftChange,
  onBlur,
  onEscape,
  onNext,
  onPrevious,
}: Props) {
  const comment = row.comment;
  return (
    <div
      data-row-index={row.block.index}
      {...(comment
        ? { "data-slot-marker": comment.markerId }
        : { "data-slot-block": row.block.index })}
      onMouseEnter={comment ? () => onHoverChange(comment.markerId) : undefined}
      onMouseLeave={comment ? () => onHoverChange(null) : undefined}
      className={`group relative border border-transparent pb-1 pl-6 pr-2 ${
        comment && !isActive ? "border-t-border/40" : ""
      } ${isActive ? "z-10 rounded-sm border-border/60 bg-background shadow-sm" : ""} ${
        isCaretBlock ? "rounded-sm bg-muted/40" : ""
      }`}
      style={{
        ...(positioned
          ? { position: "absolute", top, left: 0, right: 0 }
          : { position: "relative" }),
        ...(clip ? { maxHeight: blockHeight || undefined, overflow: "hidden" } : {}),
      }}
    >
      {comment && (
        // Floating remove control in the left gutter — visible on hover (or while editing) so a
        // comment can be deleted without offsetting its box. Coordinated delete: strip the marker from
        // the fragment buffer and drop the comment; each persists on its own save.
        <button
          type="button"
          className={`absolute left-1 top-1.5 text-xs leading-none text-muted-foreground transition-opacity hover:text-destructive ${
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          aria-label="Remove comment"
          title="Remove comment (strips its anchor)"
          onMouseDown={(event) => {
            event.preventDefault();
            onRemove(comment.markerId);
          }}
        >
          ×
        </button>
      )}

      {isActive ? (
        <SlotEditor
          value={comment ? comment.body : draft}
          mode={mode}
          fontSize={fontSize}
          focusOnMount
          placeholder={comment ? "Add a comment…" : "Type to comment this paragraph…"}
          onChange={(next) =>
            comment
              ? onChangeComment(comment.markerId, next)
              : onDraftChange(row.block.index, row.block.text, next)
          }
          onBlur={onBlur}
          onNext={onNext}
          onPrevious={onPrevious}
          onEscape={onEscape}
        />
      ) : comment ? (
        <button
          type="button"
          className="w-full whitespace-pre-wrap wrap-break-word text-left text-foreground/90"
          style={serifTextStyle(fontSize)}
          onClick={() => {
            onRevealComment(comment.markerId);
            onActivateComment(comment.markerId);
          }}
        >
          {comment.body}
        </button>
      ) : (
        <button
          type="button"
          className="w-full text-left text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          onClick={() => onActivateBlock(row.block.index)}
        >
          + comment
        </button>
      )}

      {isOverflowing && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex h-5 items-end justify-end bg-linear-to-t from-background to-transparent pr-2 text-xs leading-none text-muted-foreground"
        >
          …
        </div>
      )}
    </div>
  );
}

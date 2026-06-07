import type { Comment } from "@api/generated/maskorAPI.schemas";
import { SlotEditor, type EditorMode, MARGIN_FONT_SIZE } from "./slot-editor";
import { serifText } from "./margin-styles";

type Props = {
  orphans: Comment[];
  activeMarkerId: string | null;
  mode: EditorMode;
  // Live-derived excerpts keyed by markerId (falls back to the comment's stored excerpt).
  liveExcerpts: Record<string, string>;
  onActivate: (markerId: string) => void;
  onChange: (markerId: string, next: string) => void;
  // Blur/Escape from an orphan editor: drop it if emptied (orphan-side: no anchor to strip).
  onSettle: (markerId: string) => void;
  onRemove: (markerId: string) => void;
};

// Orphaned comments — markers no longer present in any block — gathered at the foot of the column with
// their last-known excerpt for context. They edit through the same mode-coupled slot editor as
// anchored comments; removal is a no-op on the fragment side (no live anchor).
export function MarginOrphanGroup({
  orphans,
  activeMarkerId,
  mode,
  liveExcerpts,
  onActivate,
  onChange,
  onSettle,
  onRemove,
}: Props) {
  if (orphans.length === 0) return null;
  return (
    <div className="mt-4 flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Orphaned ({orphans.length})
      </p>
      {orphans.map((comment) => {
        const isActive = activeMarkerId === comment.markerId;
        const excerpt = liveExcerpts[comment.markerId] ?? comment.excerpt;
        return (
          <div
            key={comment.markerId}
            data-marker-id={comment.markerId}
            data-orphaned="true"
            className={`group relative rounded-sm border border-dashed py-1 pl-6 pr-2 ${
              isActive ? "border-border/60 bg-muted/20" : "border-muted/60 bg-muted/10"
            }`}
          >
            <button
              type="button"
              className={`absolute left-1 top-1.5 text-xs leading-none text-muted-foreground transition-opacity hover:text-destructive ${
                isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
              aria-label="Remove comment"
              title="Remove orphaned comment"
              onMouseDown={(event) => {
                event.preventDefault();
                onRemove(comment.markerId);
              }}
            >
              ×
            </button>
            <p className="mb-0.5 flex items-center gap-1.5 text-xs italic text-muted-foreground">
              <span className="rounded bg-muted px-1 py-0.5 text-[10px] not-italic uppercase tracking-wide">
                orphaned
              </span>
              <span>{excerpt || <span className="not-italic">(no excerpt)</span>}</span>
            </p>
            {isActive ? (
              <SlotEditor
                value={comment.body}
                mode={mode}
                fontSize={MARGIN_FONT_SIZE}
                focusOnMount
                placeholder="Re-add the text or remove this comment…"
                onChange={(next) => onChange(comment.markerId, next)}
                onBlur={() => onSettle(comment.markerId)}
                onEscape={() => onSettle(comment.markerId)}
              />
            ) : (
              <button
                type="button"
                className="w-full whitespace-pre-wrap wrap-break-word text-left text-foreground/90"
                style={serifText}
                onClick={() => onActivate(comment.markerId)}
              >
                {comment.body || (
                  <span className="text-muted-foreground">
                    Its block is gone. Re-add the text or remove this comment.
                  </span>
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

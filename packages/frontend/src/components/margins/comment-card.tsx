import type { Comment } from "@api/generated/maskorAPI.schemas";

type Props = {
  comment: Comment;
  // The excerpt to display: derived live from the fragment block for anchored comments, or the
  // frozen stored excerpt for orphans. Falls back to `comment.excerpt` when omitted.
  displayExcerpt?: string;
  // Orphaned comments (marker gone from the fragment) render muted with an explanatory badge.
  orphaned?: boolean;
  // Compact mode shows excerpt + body preview only; expanded mode shows the editable body.
  compact: boolean;
  onBodyChange: (body: string) => void;
  onRemove: () => void;
  onReveal?: () => void;
  // Exposes the body textarea so the panel can focus it (the comment gesture's focus move).
  bodyRef?: (node: HTMLTextAreaElement | null) => void;
};

// One comment in the Margin's comments section: the anchored block excerpt plus the free-prose body.
// Bound to a fragment block by `comment.markerId`; clicking the excerpt reveals that block in the
// fragment editor (scroll correspondence).
export const CommentCard = ({
  comment,
  displayExcerpt,
  orphaned = false,
  compact,
  onBodyChange,
  onRemove,
  onReveal,
  bodyRef,
}: Props) => {
  const excerpt = displayExcerpt ?? comment.excerpt;
  return (
    <div
      className={`group rounded-md border px-3 py-2 text-sm ${
        orphaned
          ? "border-dashed border-muted bg-muted/20 opacity-80"
          : "border-border bg-background"
      }`}
      data-marker-id={comment.markerId}
      data-orphaned={orphaned}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="flex-1 text-left text-xs text-muted-foreground italic hover:text-foreground transition-colors"
          onClick={onReveal}
          title={orphaned ? "Anchor lost" : "Reveal the annotated block"}
        >
          {excerpt || <span className="not-italic">(no excerpt)</span>}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {orphaned && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              orphaned
            </span>
          )}
          <button
            type="button"
            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            onClick={onRemove}
            aria-label="Remove comment"
            title="Remove comment"
          >
            ×
          </button>
        </div>
      </div>
      {compact ? (
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-foreground/90">
          {comment.body || <span className="text-muted-foreground">(empty)</span>}
        </p>
      ) : (
        <textarea
          ref={bodyRef}
          className="mt-1 w-full resize-y rounded border border-input bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          rows={2}
          value={comment.body}
          placeholder="Add a comment…"
          onChange={(event) => onBodyChange(event.target.value)}
        />
      )}
      {orphaned && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Its block is gone. Re-add the text or remove this comment.
        </p>
      )}
    </div>
  );
};

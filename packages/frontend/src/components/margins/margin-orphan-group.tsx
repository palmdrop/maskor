import type { Comment } from "@api/generated/maskorAPI.schemas";
import { SlotEditor, type EditorMode, type SlotLinkApi } from "./slot-editor";
import { LinkedText } from "./linked-text";
import { serifTextStyle } from "./margin-styles";

type Props = {
  orphans: Comment[];
  activeMarkerId: string | null;
  mode: EditorMode;
  // The configured Margin text size (`editor.marginFontSize`).
  fontSize: number;
  documentLinks?: SlotLinkApi;
  // Collapsible panel state (pinned in the column footer, like the notes panel).
  open: boolean;
  onToggle: () => void;
  // Live-derived excerpts keyed by markerId (falls back to the comment's stored excerpt).
  liveExcerpts: Record<string, string>;
  onActivate: (markerId: string) => void;
  onChange: (markerId: string, next: string) => void;
  // Blur/Escape from an orphan editor: drop it if emptied (orphan-side: no anchor to strip).
  onSettle: (markerId: string) => void;
  onRemove: (markerId: string) => void;
};

// Orphaned comments — markers no longer present in any block — gathered in a collapsible panel pinned
// to the column footer (outside the comment scroller, so they are reachable without scrolling the
// comment column out of lockstep) with their last-known excerpt for context. They edit through the
// same mode-coupled slot editor as anchored comments; removal is a no-op on the fragment side (no live
// anchor).
export function MarginOrphanGroup({
  orphans,
  activeMarkerId,
  mode,
  fontSize,
  documentLinks,
  open,
  onToggle,
  liveExcerpts,
  onActivate,
  onChange,
  onSettle,
  onRemove,
}: Props) {
  if (orphans.length === 0) return null;
  return (
    <section className="flex min-h-0 flex-col" data-testid="margin-orphans">
      <button
        type="button"
        className="flex w-full shrink-0 items-center gap-2 py-1 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="inline-block w-3">{open ? "▾" : "▸"}</span>
        <span>Orphaned ({orphans.length})</span>
      </button>
      {open && (
        <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pb-1">
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
                    fontSize={fontSize}
                    focusOnMount
                    documentLinks={documentLinks}
                    placeholder="Re-add the text or remove this comment…"
                    onChange={(next) => onChange(comment.markerId, next)}
                    onBlur={() => onSettle(comment.markerId)}
                    onEscape={() => onSettle(comment.markerId)}
                  />
                ) : (
                  // A div (not a button) so resolved-link buttons nest validly; clicking the text
                  // activates edit mode, clicking a link navigates (LinkedText stops propagation).
                  // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
                  <div
                    role="button"
                    tabIndex={0}
                    className="w-full cursor-text whitespace-pre-wrap wrap-break-word text-left text-foreground/90"
                    style={serifTextStyle(fontSize)}
                    onClick={() => onActivate(comment.markerId)}
                  >
                    {comment.body ? (
                      <LinkedText text={comment.body} documentLinks={documentLinks} />
                    ) : (
                      <span className="text-muted-foreground">
                        Its block is gone. Re-add the text or remove this comment.
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

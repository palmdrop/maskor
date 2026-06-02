import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Button } from "@components/ui/button";
import { Separator } from "@components/ui/separator";
import { usePersistedBoolean } from "@hooks/usePersistedBoolean";
import { claimFocusOnPickerClose } from "@lib/focus-intent";
import type { Comment } from "@api/generated/maskorAPI.schemas";
import type { UseMarginEditorResult } from "@hooks/useMarginEditor";
import { MarginNotesEditor } from "./margin-notes-editor";
import { CommentCard } from "./comment-card";

export type MarginPanelHandle = {
  // Bring a comment into view and focus its body for immediate typing (used by the comment gesture).
  focusComment: (markerId: string) => void;
};

type Props = {
  projectId: string;
  marginEditor: UseMarginEditorResult;
  // Marker ids present in the live fragment buffer, in document order. Drives comment ordering and
  // orphan detection: a stored comment whose marker is absent here is orphaned.
  fragmentMarkerIds: string[];
  onSave: () => void;
  onCommentBlock?: () => void;
  onRevealMarker?: (markerId: string) => void;
};

type PartitionedComments = {
  anchored: Comment[];
  orphaned: Comment[];
};

// Split comments into anchored (marker present in the fragment) and orphaned (marker gone), ordering
// anchored comments to follow the fragment's block order so they correspond side-by-side.
export const partitionComments = (
  comments: Comment[],
  fragmentMarkerIds: string[],
): PartitionedComments => {
  const order = new Map<string, number>();
  fragmentMarkerIds.forEach((markerId, index) => {
    if (!order.has(markerId)) order.set(markerId, index);
  });

  const anchored: Comment[] = [];
  const orphaned: Comment[] = [];
  for (const comment of comments) {
    if (order.has(comment.markerId)) anchored.push(comment);
    else orphaned.push(comment);
  }
  anchored.sort((a, b) => (order.get(a.markerId) ?? 0) - (order.get(b.markerId) ?? 0));
  return { anchored, orphaned };
};

const SectionHeader = ({
  label,
  count,
  open,
  onToggle,
}: {
  label: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    className="flex w-full items-center gap-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
    onClick={onToggle}
    aria-expanded={open}
  >
    <span className="inline-block w-3">{open ? "▾" : "▸"}</span>
    <span>{label}</span>
    {count !== undefined && count > 0 && (
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{count}</span>
    )}
  </button>
);

// The side-by-side Margin surface: a fragment's companion notes + anchored comments, rendered as a
// self-contained pair beside the fragment editor (designed to later drop into a graph-canvas node).
export const MarginPanel = forwardRef<MarginPanelHandle, Props>(function MarginPanel(
  { projectId, marginEditor, fragmentMarkerIds, onSave, onCommentBlock, onRevealMarker },
  ref,
) {
  const { notes, comments, isDirty, isSaving, setNotes, updateCommentBody, removeComment } =
    marginEditor;

  const [notesOpen, , toggleNotes] = usePersistedBoolean(`marginNotesOpen_${projectId}`, true);
  const [commentsOpen, , toggleComments] = usePersistedBoolean(
    `marginCommentsOpen_${projectId}`,
    true,
  );
  // The global default-state toggle: collapsed (compact, default) shows badge-style previews;
  // expanded shows editable comment bodies with alignment room.
  const [compact, setCompact, toggleCompact] = usePersistedBoolean(
    `marginCompact_${projectId}`,
    true,
  );

  const { anchored, orphaned } = useMemo(
    () => partitionComments(comments, fragmentMarkerIds),
    [comments, fragmentMarkerIds],
  );

  const bodyRefs = useRef(new Map<string, HTMLTextAreaElement>());

  useImperativeHandle(
    ref,
    () => ({
      focusComment: (markerId: string) => {
        // The gesture wants the writer typing immediately: open the comments section and leave
        // compact mode so the body textarea exists, then focus it on the next frame.
        setCompact(false);
        const applyFocus = () => {
          requestAnimationFrame(() => {
            const textarea = bodyRefs.current.get(markerId);
            if (textarea) {
              textarea.scrollIntoView({ block: "center" });
              textarea.focus();
            }
          });
        };
        // Direct path (toolbar button — no palette). Under a closing command palette this is reverted
        // by the dialog's focus trap; the claim re-applies the focus once the palette has closed (and
        // suppresses the palette's focus-restore back to the editor).
        applyFocus();
        claimFocusOnPickerClose(applyFocus);
      },
    }),
    [setCompact],
  );

  const registerBodyRef = (markerId: string, node: HTMLTextAreaElement | null) => {
    if (node) bodyRefs.current.set(markerId, node);
    else bodyRefs.current.delete(markerId);
  };

  const renderCard = (comment: Comment, orphanedFlag: boolean) => (
    <CommentCard
      key={comment.markerId}
      comment={comment}
      orphaned={orphanedFlag}
      compact={compact}
      onBodyChange={(body) => updateCommentBody(comment.markerId, body)}
      onRemove={() => removeComment(comment.markerId)}
      onReveal={orphanedFlag ? undefined : () => onRevealMarker?.(comment.markerId)}
      bodyRef={(node) => registerBodyRef(comment.markerId, node)}
    />
  );

  const hasAnyComment = comments.length > 0;

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden" data-testid="margin-panel">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Margin</span>
        <div className="flex items-center gap-1">
          {onCommentBlock && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onCommentBlock}
              title="Comment the block at the cursor (⌘⇧M)"
            >
              + Comment
            </Button>
          )}
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={toggleCompact}
            title={compact ? "Expand comments" : "Collapse comments"}
          >
            {compact ? "Expand" : "Collapse"}
          </button>
          <Button
            size="sm"
            variant="outline"
            disabled={!isDirty || isSaving}
            onClick={onSave}
            className="min-w-16"
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      <Separator />

      <div className="flex-1 overflow-y-auto pr-1">
        <section className="flex flex-col gap-2">
          <SectionHeader label="Notes" open={notesOpen} onToggle={toggleNotes} />
          {notesOpen && (
            <div className="rounded-md border border-border px-2 py-1">
              <MarginNotesEditor
                value={notes}
                onChange={setNotes}
                placeholder="Thoughts on structure, character, things to rewrite…"
              />
            </div>
          )}
        </section>

        <div className="my-3" />

        <section className="flex flex-col gap-2">
          <SectionHeader
            label="Comments"
            count={anchored.length}
            open={commentsOpen}
            onToggle={toggleComments}
          />
          {commentsOpen && (
            <div className="flex flex-col gap-2">
              {!hasAnyComment && (
                <p className="text-xs text-muted-foreground">
                  No comments yet. Use “Comment this block” from the fragment editor to anchor one.
                </p>
              )}
              {anchored.map((comment) => renderCard(comment, false))}

              {orphaned.length > 0 && (
                <div className="mt-2 flex flex-col gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Orphaned ({orphaned.length})
                  </p>
                  {orphaned.map((comment) => renderCard(comment, true))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
});

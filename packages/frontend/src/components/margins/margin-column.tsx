import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createCommentMarkerId, deriveExcerpt } from "@maskor/shared";
import { Button } from "@components/ui/button";
import { Separator } from "@components/ui/separator";
import { usePersistedBoolean } from "@hooks/usePersistedBoolean";
import { claimFocusOnPickerClose } from "@lib/focus-intent";
import type { UseMarginEditorResult } from "@hooks/useMarginEditor";
import {
  buildColumn,
  enumerateBlocks,
  nextSlotIndex,
  previousSlotIndex,
} from "@lib/margins/column";
import { deriveLiveExcerpts } from "@lib/margins/excerpts";
import { CommentCard } from "./comment-card";
import { SlotEditor, type EditorMode } from "./slot-editor";

export type MarginColumnHandle = {
  // Jump focus to a paragraph's slot (the "Comment this block" gesture, now a jump). Focuses the
  // bound comment, or the empty slot ready for type-to-create.
  focusSlot: (target: { index: number; markerId: string | null }) => void;
};

type ActiveSlot =
  | { kind: "notes" }
  | { kind: "block"; index: number }
  | { kind: "comment"; markerId: string }
  | null;

type Props = {
  projectId: string;
  marginEditor: UseMarginEditorResult;
  // The live fragment buffer — the column enumerates its blocks and binds comments live.
  fragmentContent: string;
  // The fragment editor mode, so the active slot edits in the matching idiom (one active editor).
  mode: EditorMode;
  onSave: () => void;
  onCommentBlock?: () => void;
  // Editor bridge (coordinated buffer edits + geometry), wired from the fragment editor shell.
  insertMarkerInBlock: (blockIndex: number, markerId: string) => void;
  stripMarker: (markerId: string) => void;
  revealMarker: (markerId: string) => void;
  focusMarkerBlock: (markerId: string) => void;
  getScrollElement: () => HTMLElement | null;
  getBlockHeights: () => number[];
};

export const MarginColumn = forwardRef<MarginColumnHandle, Props>(function MarginColumn(
  {
    projectId,
    marginEditor,
    fragmentContent,
    mode,
    onSave,
    onCommentBlock,
    insertMarkerInBlock,
    stripMarker,
    revealMarker,
    focusMarkerBlock,
    getScrollElement,
    getBlockHeights,
  },
  ref,
) {
  const { notes, comments, isDirty, isSaving, setNotes, updateCommentBody, addCommentStub } =
    marginEditor;

  const [notesOpen, , toggleNotes] = usePersistedBoolean(`marginNotesOpen_${projectId}`, true);
  // Global default: collapsed (comments clipped to their paragraph's height). Expand-all reveals
  // every comment in full; the focused slot always expands regardless.
  const [expandAll, , toggleExpandAll] = usePersistedBoolean(`marginExpandAll_${projectId}`, false);

  const [activeSlot, setActiveSlot] = useState<ActiveSlot>(null);
  const [draft, setDraft] = useState("");
  const [blockHeights, setBlockHeights] = useState<number[]>([]);

  const blocks = useMemo(() => enumerateBlocks(fragmentContent), [fragmentContent]);
  const markerIds = useMemo(
    () => blocks.flatMap((b) => (b.markerId ? [b.markerId] : [])),
    [blocks],
  );
  const liveExcerpts = useMemo(
    () => deriveLiveExcerpts(fragmentContent, markerIds),
    [fragmentContent, markerIds],
  );
  const { rows, orphans } = useMemo(() => buildColumn(blocks, comments), [blocks, comments]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // --- Scroll sync: mirror the editor's scrollTop into the column and back, lockstep. A guard
  // suppresses the echo so the two don't fight. ---
  useEffect(() => {
    const editorScroll = getScrollElement();
    const columnScroll = scrollRef.current;
    if (!editorScroll || !columnScroll) return;
    let syncing = false;
    const sync = (from: HTMLElement, to: HTMLElement) => () => {
      if (syncing) return;
      syncing = true;
      to.scrollTop = from.scrollTop;
      syncing = false;
    };
    const onEditorScroll = sync(editorScroll, columnScroll);
    const onColumnScroll = sync(columnScroll, editorScroll);
    editorScroll.addEventListener("scroll", onEditorScroll, { passive: true });
    columnScroll.addEventListener("scroll", onColumnScroll, { passive: true });
    return () => {
      editorScroll.removeEventListener("scroll", onEditorScroll);
      columnScroll.removeEventListener("scroll", onColumnScroll);
    };
  }, [getScrollElement]);

  // --- Block geometry: re-measure block heights for margin-side padding when the content changes or
  // the editor resizes. ---
  const measure = useCallback(() => {
    setBlockHeights(getBlockHeights());
  }, [getBlockHeights]);

  useEffect(() => {
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [measure, fragmentContent, mode]);

  useEffect(() => {
    const editorScroll = getScrollElement();
    if (!editorScroll || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(editorScroll);
    return () => observer.disconnect();
  }, [getScrollElement, measure]);

  useImperativeHandle(
    ref,
    () => ({
      focusSlot: ({ index, markerId }) => {
        const applyFocus = () => {
          if (markerId) setActiveSlot({ kind: "comment", markerId });
          else setActiveSlot({ kind: "block", index });
          setDraft("");
          requestAnimationFrame(() => {
            const node = scrollRef.current?.querySelector<HTMLElement>(
              markerId ? `[data-slot-marker="${markerId}"]` : `[data-slot-block="${index}"]`,
            );
            node?.scrollIntoView({ block: "center" });
          });
        };
        applyFocus();
        claimFocusOnPickerClose(applyFocus);
      },
    }),
    [],
  );

  // Type-to-create: the first non-empty keystroke in an empty slot mints a marker, injects it into
  // that block, and seeds a bound comment with the typed text — then editing continues on the new
  // comment. An untouched (still-empty) slot creates nothing.
  const handleBlockDraftChange = (blockIndex: number, blockText: string, next: string) => {
    if (next.trim() === "") {
      setDraft(next);
      return;
    }
    const markerId = createCommentMarkerId();
    insertMarkerInBlock(blockIndex, markerId);
    addCommentStub({ markerId, excerpt: deriveExcerpt(blockText), body: next });
    setActiveSlot({ kind: "comment", markerId });
    setDraft("");
  };

  const navigate = (rowIndex: number, direction: "next" | "previous") => {
    const targetIndex =
      direction === "next" ? nextSlotIndex(rowIndex, rows.length) : previousSlotIndex(rowIndex);
    const target = rows[targetIndex];
    if (!target) return;
    if (target.comment) setActiveSlot({ kind: "comment", markerId: target.comment.markerId });
    else setActiveSlot({ kind: "block", index: target.block.index });
    setDraft("");
  };

  const minHeightFor = (blockIndex: number): number | undefined => {
    const height = blockHeights[blockIndex];
    return height && height > 0 ? height : undefined;
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden" data-testid="margin-column">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Margin</span>
        <div className="flex items-center gap-1">
          {onCommentBlock && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onCommentBlock}
              title="Jump to the slot beside the block at the cursor (⌘⇧M)"
            >
              + Comment
            </Button>
          )}
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={toggleExpandAll}
            title={expandAll ? "Collapse all comments" : "Expand all comments"}
          >
            {expandAll ? "Collapse all" : "Expand all"}
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1">
        {/* Notes: a collapsible pinned header at the top of the column, scrolling with the content. */}
        <section className="mb-3 flex flex-col gap-1">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            onClick={toggleNotes}
            aria-expanded={notesOpen}
          >
            <span className="inline-block w-3">{notesOpen ? "▾" : "▸"}</span>
            <span>Notes</span>
          </button>
          {notesOpen && (
            <div className="rounded-md border border-border px-2 py-1" data-slot-notes>
              {activeSlot?.kind === "notes" ? (
                <SlotEditor
                  value={notes}
                  mode={mode}
                  focusOnMount
                  placeholder="Thoughts on structure, character, things to rewrite…"
                  onChange={setNotes}
                  onBlur={() => setActiveSlot(null)}
                  onEscape={() => setActiveSlot(null)}
                />
              ) : (
                <button
                  type="button"
                  className="min-h-[1.5rem] w-full whitespace-pre-wrap text-left text-sm text-foreground/90"
                  onClick={() => setActiveSlot({ kind: "notes" })}
                >
                  {notes || (
                    <span className="text-muted-foreground">
                      Thoughts on structure, character, things to rewrite…
                    </span>
                  )}
                </button>
              )}
            </div>
          )}
        </section>

        {/* One slot per paragraph, flow-aligned by margin-side padding (min-height = block height). */}
        <div className="flex flex-col">
          {rows.map((row, rowIndex) => {
            const minHeight = minHeightFor(row.block.index);
            const isCommentActive =
              activeSlot?.kind === "comment" && row.comment?.markerId === activeSlot.markerId;
            const isBlockActive =
              activeSlot?.kind === "block" && activeSlot.index === row.block.index;
            const expanded = expandAll || isCommentActive || isBlockActive;

            if (row.comment) {
              const comment = row.comment;
              return (
                <div
                  key={comment.markerId}
                  data-slot-marker={comment.markerId}
                  className="group relative border-l-2 border-border/60 pl-3"
                  style={{ minHeight }}
                >
                  <button
                    type="button"
                    className="absolute -left-px top-0 h-full w-0.5 bg-transparent hover:bg-foreground/30"
                    title="Reveal the annotated paragraph"
                    aria-label="Reveal the annotated paragraph"
                    onClick={() => revealMarker(comment.markerId)}
                  />
                  {isCommentActive ? (
                    <div className="py-1">
                      <div className="flex items-start justify-end">
                        <button
                          type="button"
                          className="text-muted-foreground transition-colors hover:text-destructive"
                          aria-label="Remove comment"
                          title="Remove comment (strips its anchor)"
                          // Coordinated delete: strip the marker from the fragment buffer and remove
                          // the comment from the Margin (Phase 3); each persists on its own save.
                          onMouseDown={(event) => {
                            event.preventDefault();
                            stripMarker(comment.markerId);
                            marginEditor.removeComment(comment.markerId);
                            setActiveSlot(null);
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <SlotEditor
                        value={comment.body}
                        mode={mode}
                        focusOnMount
                        placeholder="Add a comment…"
                        onChange={(body) => updateCommentBody(comment.markerId, body)}
                        onBlur={() => setActiveSlot(null)}
                        onNext={() => navigate(rowIndex, "next")}
                        onPrevious={() => navigate(rowIndex, "previous")}
                        onEscape={() => {
                          setActiveSlot(null);
                          focusMarkerBlock(comment.markerId);
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`w-full py-1 text-left text-sm text-foreground/90 ${
                        expanded ? "whitespace-pre-wrap" : "line-clamp-3 overflow-hidden"
                      }`}
                      onClick={() => {
                        setActiveSlot({ kind: "comment", markerId: comment.markerId });
                        setDraft("");
                      }}
                    >
                      {comment.body || <span className="text-muted-foreground">(empty)</span>}
                    </button>
                  )}
                </div>
              );
            }

            // Un-annotated paragraph: an empty slot revealed on hover; type-to-create on first input.
            return (
              <div
                key={`block-${row.block.index}`}
                data-slot-block={row.block.index}
                className="group relative pl-3"
                style={{ minHeight }}
              >
                {isBlockActive ? (
                  <div className="py-1">
                    <SlotEditor
                      value={draft}
                      mode={mode}
                      focusOnMount
                      placeholder="Type to comment this paragraph…"
                      onChange={(next) =>
                        handleBlockDraftChange(row.block.index, row.block.text, next)
                      }
                      onBlur={() => setActiveSlot(null)}
                      onNext={() => navigate(rowIndex, "next")}
                      onPrevious={() => navigate(rowIndex, "previous")}
                      onEscape={() => setActiveSlot(null)}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="w-full py-1 text-left text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => {
                      setActiveSlot({ kind: "block", index: row.block.index });
                      setDraft("");
                    }}
                  >
                    + comment
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {orphans.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Orphaned ({orphans.length})
            </p>
            {orphans.map((comment) => (
              <CommentCard
                key={comment.markerId}
                comment={comment}
                displayExcerpt={liveExcerpts[comment.markerId] ?? comment.excerpt}
                orphaned
                compact={!expandAll}
                onBodyChange={(body) => updateCommentBody(comment.markerId, body)}
                onRemove={() => marginEditor.removeComment(comment.markerId)}
              />
            ))}
          </div>
        )}

        {rows.length === 0 && orphans.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No paragraphs yet. Write in the fragment, then type beside a paragraph to annotate it.
          </p>
        )}
      </div>
    </div>
  );
});

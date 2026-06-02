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
import type { EditorBlock } from "@components/prose-editor";
import {
  buildColumn,
  nextSlotIndex,
  previousSlotIndex,
  type FragmentBlock,
} from "@lib/margins/column";
import { computeBlockAlignment, naturalSlotHeights, spacersEqual } from "@lib/margins/alignment";
import { deriveLiveExcerpts } from "@lib/margins/excerpts";
import { CommentCard } from "./comment-card";
import { SlotEditor, type EditorMode } from "./slot-editor";

// Safety cap on a single document-side spacer so one runaway comment can't open an absurd gap. A
// collapsed comment is already clipped (line-clamp) and a focused/expanded one is intentionally
// uncapped within this bound.
const MAX_SPACER = 4000;

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
  // The fragment editor's font size — applied to comment text so it reads at the same scale as the
  // prose, and a trigger to re-measure alignment when the size changes.
  fontSize: number;
  onSave: () => void;
  onCommentBlock?: () => void;
  // Editor bridge (coordinated buffer edits + geometry), wired from the fragment editor shell.
  insertMarkerInBlock: (blockIndex: number, markerId: string) => void;
  stripMarker: (markerId: string) => void;
  revealMarker: (markerId: string) => void;
  focusMarkerBlock: (markerId: string) => void;
  getScrollElement: () => HTMLElement | null;
  // The editor's authoritative block list (ADR 0009): the column renders one row per entry and binds
  // comments by markerId, so its block-index space matches the editor's geometry exactly.
  getBlocks: () => EditorBlock[];
  // Push document-side spacers (pixels, by block index) so a comment taller than its block pushes the
  // next paragraph down — the document side of mutual flow alignment.
  setBlockSpacers: (spacers: number[]) => void;
  // Pad the editor content's top so block 0 lines up with this column's row 0 despite the columns'
  // differing chrome (the notes header etc.). The column measures the gap and reports it.
  setEditorTopPadding: (px: number) => void;
};

export const MarginColumn = forwardRef<MarginColumnHandle, Props>(function MarginColumn(
  {
    projectId,
    marginEditor,
    fragmentContent,
    mode,
    fontSize,
    onSave,
    onCommentBlock,
    insertMarkerInBlock,
    stripMarker,
    revealMarker,
    focusMarkerBlock,
    getScrollElement,
    getBlocks,
    setBlockSpacers,
    setEditorTopPadding,
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
  // Bumped after mount / content change / resize to re-pull the editor's measured geometry. The block
  // list itself comes from the editor (ADR 0009) — the single source of enumeration and geometry.
  const [geometryTick, setGeometryTick] = useState(0);
  // Per-block row min-heights (margin side): a short comment fills its block's slot. Populated by the
  // alignment pass below from the editor's measured geometry.
  const [minHeights, setMinHeights] = useState<number[]>([]);
  // Top padding for the rows when the editor's content origin sits *below* this column's (rare). The
  // common case — this column lower, because of the notes header — is handled by padding the editor.
  const [rowsPaddingTop, setRowsPaddingTop] = useState(0);
  // The spacers we last pushed to the editor — backed out when recovering the natural slot heights so
  // the alignment pass converges (the spacer never feeds into its own input).
  const currentSpacersRef = useRef<number[]>([]);

  const editorBlocks = useMemo(
    () => getBlocks(),
    [getBlocks, fragmentContent, mode, fontSize, geometryTick],
  );
  // Structural rows in the editor's block order; geometry stays indexed alongside for padding.
  const blocks = useMemo<FragmentBlock[]>(
    () =>
      editorBlocks.map((block, index) => ({
        index,
        text: block.text,
        markerId: block.markerId,
      })),
    [editorBlocks],
  );
  const markerIds = useMemo(
    () => blocks.flatMap((block) => (block.markerId ? [block.markerId] : [])),
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
    // `geometryTick` re-runs this once the editor has mounted: on first render `getScrollElement()`
    // returns null (the editor isn't laid out yet) and the listeners would never attach otherwise.
  }, [getScrollElement, geometryTick]);

  // --- Block geometry: re-pull the editor's measured block list for margin-side padding when the
  // content changes or the editor resizes. A tick bump re-runs `getBlocks()` (the editor is the
  // single source of geometry) after layout has settled. ---
  const remeasure = useCallback(() => {
    setGeometryTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(remeasure);
    return () => cancelAnimationFrame(id);
  }, [remeasure, fragmentContent, mode, fontSize]);

  useEffect(() => {
    const editorScroll = getScrollElement();
    if (!editorScroll || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => remeasure());
    observer.observe(editorScroll);
    return () => observer.disconnect();
  }, [getScrollElement, remeasure]);

  // --- Origin alignment: line up this column's row 0 with the editor's block 0 by measuring the
  // vertical gap between the two scrollers' content tops (their chrome — notes header, toolbars —
  // differs) and closing it. Usually this column sits lower (the notes header), so the editor's
  // content is padded down; the rare opposite case pads the rows. Measured from the stable scroller
  // boxes, so neither padding feeds back into the measurement. ---
  useEffect(() => {
    const editorScroll = getScrollElement();
    const columnScroll = scrollRef.current;
    if (!editorScroll || !columnScroll) return;
    const delta =
      columnScroll.getBoundingClientRect().top - editorScroll.getBoundingClientRect().top;
    setEditorTopPadding(Math.max(0, delta));
    setRowsPaddingTop((previous) => {
      const next = Math.max(0, -delta);
      return Math.abs(previous - next) < 0.5 ? previous : next;
    });
  }, [getScrollElement, setEditorTopPadding, notesOpen, mode, fontSize, geometryTick]);

  // --- Mutual flow alignment (ADR 0009). Each row is as tall as the taller of its block-slot and its
  // comment: the column pads short comments up to the slot (min-height), and the editor pushes the
  // next block down by a spacer for a taller comment. Both are derived from natural (spacer-excluded)
  // geometry so a single pass converges. Re-runs when the geometry or any comment height changes. ---
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const tops = editorBlocks.map((block) => block.top);
    const heights = editorBlocks.map((block) => block.height);
    const slots = naturalSlotHeights(tops, heights, currentSpacersRef.current);
    // The rendered row height is already max(slot, comment) because the row carries min-height = slot,
    // so feeding it as the comment height yields the right spacer without a separate content probe.
    const rowHeights = slots.map((_, index) => {
      const node = scroll.querySelector<HTMLElement>(`[data-row-index="${index}"]`);
      return node ? node.getBoundingClientRect().height : 0;
    });
    const alignment = computeBlockAlignment(
      slots.map((slot, index) => ({ naturalSlotHeight: slot, commentHeight: rowHeights[index]! })),
      MAX_SPACER,
    );
    const spacers = alignment.map((row) => row.spacer);
    const mins = alignment.map((row) => row.minHeight);
    if (!spacersEqual(spacers, currentSpacersRef.current)) {
      currentSpacersRef.current = spacers;
      setBlockSpacers(spacers);
    }
    setMinHeights((previous) => (spacersEqual(previous, mins) ? previous : mins));
  }, [editorBlocks, comments, activeSlot, expandAll, mode, fontSize, setBlockSpacers]);

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
    const height = minHeights[blockIndex];
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

      {/* Notes: a collapsible pinned header above the scroller (ADR 0009 — out of the scrolled flow so
          margin row 0 aligns with the editor's block 0; the rows below scroll in lockstep). */}
      <section className="flex shrink-0 flex-col gap-1" data-testid="margin-notes">
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
                fontSize={fontSize}
                focusOnMount
                placeholder="Thoughts on structure, character, things to rewrite…"
                onChange={setNotes}
                onBlur={() => setActiveSlot(null)}
                onEscape={() => setActiveSlot(null)}
              />
            ) : (
              <button
                type="button"
                className="min-h-[1.5rem] w-full whitespace-pre-wrap text-left text-foreground/90"
                style={{ fontSize }}
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1" data-testid="margin-scroll">
        {/* One slot per paragraph, flow-aligned to the editor (ADR 0009): each row's min-height is its
            block's slot height, and the editor injects a spacer when a comment is taller. */}
        <div className="flex flex-col" style={{ paddingTop: rowsPaddingTop || undefined }}>
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
                  data-row-index={row.block.index}
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
                        fontSize={fontSize}
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
                      className={`w-full py-1 text-left text-foreground/90 ${
                        expanded ? "whitespace-pre-wrap" : "line-clamp-3 overflow-hidden"
                      }`}
                      style={{ fontSize }}
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
                data-row-index={row.block.index}
                className="group relative pl-3"
                style={{ minHeight }}
              >
                {isBlockActive ? (
                  <div className="py-1">
                    <SlotEditor
                      value={draft}
                      mode={mode}
                      fontSize={fontSize}
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

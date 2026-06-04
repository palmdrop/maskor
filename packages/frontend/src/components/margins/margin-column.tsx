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
import { usePersistedBoolean } from "@hooks/usePersistedBoolean";
import { claimFocusOnPickerClose } from "@lib/focus-intent";
import type { UseMarginEditorResult } from "@hooks/useMarginEditor";
import type { EditorBlock } from "@components/prose-editor";
import {
  buildColumn,
  nextSlotIndex,
  previousSlotIndex,
  planOrphanRebinds,
  type FragmentBlock,
} from "@lib/margins/column";
import { computeBlockAlignment, naturalSlotHeights, spacersEqual } from "@lib/margins/alignment";
import { deriveLiveExcerpts } from "@lib/margins/excerpts";
import { CommentCard } from "./comment-card";
import { SlotEditor, type EditorMode, MARGIN_LINE_HEIGHT } from "./slot-editor";

// Serif text styling shared by the column's static (non-editing) comment and notes text, so they read
// in the same family + rhythm as the prose editor and the active slot editors (margins-4 #1, #2).
const serifText = (fontSize: number) => ({
  fontFamily: "var(--font-serif)",
  lineHeight: MARGIN_LINE_HEIGHT,
  fontSize,
});

// Safety cap on a single document-side spacer so one runaway comment can't open an absurd gap. A
// collapsed comment is already clipped to its block height (so it needs no spacer); a focused/expanded
// one is intentionally uncapped within this bound.
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
  const { notes, comments, setNotes, updateCommentBody, addCommentStub } = marginEditor;

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
    // Margin-side padding always tracks the live geometry (a short comment keeps filling its slot).
    setMinHeights((previous) => (spacersEqual(previous, mins) ? previous : mins));
    // Document-side push is frozen while a slot is focused (margins-4 #6): the fragment paragraphs do
    // not shift per keystroke. It reconciles on blur — when `activeSlot` returns to null this effect
    // re-runs and applies the settled spacers. The `spacersEqual` guard keeps the reconcile a single
    // settle.
    if (activeSlot !== null) return;
    if (!spacersEqual(spacers, currentSpacersRef.current)) {
      currentSpacersRef.current = spacers;
      setBlockSpacers(spacers);
    }
  }, [editorBlocks, comments, activeSlot, expandAll, mode, fontSize, setBlockSpacers]);

  // --- Fuzzy recovery (ADR 0009). An orphaned comment whose last-known excerpt still uniquely matches
  // an un-anchored block re-anchors to it (adding the anchor; the marker re-emits on the next save).
  // Conservative — only unambiguous matches — and self-terminating: once rebound the comment is no
  // longer an orphan, so the next pass finds nothing. ---
  useEffect(() => {
    for (const { blockIndex, markerId } of planOrphanRebinds(blocks, orphans)) {
      insertMarkerInBlock(blockIndex, markerId);
    }
  }, [blocks, orphans, insertMarkerInBlock]);

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

  // Type-to-create (margins-4 #5): the first non-empty keystroke in an empty slot mints a marker,
  // injects it into that block, and seeds a bound comment with the typed text. The active slot stays
  // pinned to the *block index* (not switched to a comment-kind slot), and the row renders through one
  // unified `SlotEditor` whose key is stable across the draft→comment transition — so the same editor
  // instance keeps editing (vim mode + caret survive; no remount). An untouched empty slot creates
  // nothing.
  const handleBlockDraftChange = (blockIndex: number, blockText: string, next: string) => {
    if (next.trim() === "") {
      setDraft(next);
      return;
    }
    const markerId = createCommentMarkerId();
    insertMarkerInBlock(blockIndex, markerId);
    addCommentStub({ markerId, excerpt: deriveExcerpt(blockText), body: next });
    // Keep the slot active by block index; the new comment binds to this block, so the unified editor
    // below routes onChange to it on the next render. Clear the draft (now superseded by the comment).
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
    <div className="flex h-full flex-col overflow-hidden" data-testid="margin-column">
      {/* No top chrome (margins-4 #3, #4): the scroller is flush to the column top so the
          origin-alignment effect pads the margin rows down to the editor's first line (rowsPaddingTop)
          and leaves the editor's own top offset at zero. Notes + controls live at the bottom. */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1" data-testid="margin-scroll">
        {/* One slot per paragraph, flow-aligned to the editor (ADR 0009): each row's min-height is its
            block's slot height, and the editor injects a spacer when a comment is taller. */}
        <div className="flex flex-col" style={{ paddingTop: rowsPaddingTop || undefined }}>
          {rows.map((row, rowIndex) => {
            const minHeight = minHeightFor(row.block.index);
            const comment = row.comment;
            // One active-state per row, by the bound comment's marker or (for an un-annotated or
            // just-created slot) the block index — so a slot stays active across type-to-create.
            const isActive =
              (activeSlot?.kind === "comment" && comment?.markerId === activeSlot.markerId) ||
              (activeSlot?.kind === "block" && activeSlot.index === row.block.index);

            // Clip every idle/collapsed row to its paragraph's height (margins-4 #4, #6) so neither a
            // collapsed comment nor an empty slot's padding inflates the row above the block — only an
            // expanded (expand-all) or actively-edited comment pushes the fragment down. The box
            // dimensions (1px border + padding) are reserved on every row so activating a slot changes
            // only colour/background, not layout (margins-4 #3).
            const clipToBlock = !isActive && !(comment && expandAll) && minHeight !== undefined;
            return (
              // One row per paragraph, keyed by block index so the SAME node (and its single unified
              // SlotEditor) survives the draft→comment transition — no remount (margins-4 #5). Seamless
              // flowing text (margins-4 #8, #9, #11): no left box; a thin top rule is the attachment cue
              // for an anchored comment, aligned (via flow padding) with the bound paragraph's top; a
              // faint full border boxes the slot only while it is being edited.
              <div
                key={`row-${row.block.index}`}
                data-row-index={row.block.index}
                {...(comment
                  ? { "data-slot-marker": comment.markerId }
                  : { "data-slot-block": row.block.index })}
                className={`group relative border border-transparent px-2 py-1 ${
                  comment && !isActive ? "border-t-border/40" : ""
                } ${isActive ? "rounded-sm border-border/60 bg-muted/20" : ""}`}
                style={{
                  minHeight,
                  ...(clipToBlock ? { maxHeight: minHeight, overflow: "hidden" } : {}),
                }}
              >
                {isActive ? (
                  <>
                    {comment && (
                      // The remove control floats in the left gutter so it never offsets the comment
                      // text downward while editing (margins-4: the inline ✕ row is gone).
                      <button
                        type="button"
                        className="absolute -left-5 top-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                        aria-label="Remove comment"
                        title="Remove comment (strips its anchor)"
                        // Coordinated delete: strip the marker from the fragment buffer and remove the
                        // comment from the Margin (Phase 3); each persists on its own save.
                        onMouseDown={(event) => {
                          event.preventDefault();
                          stripMarker(comment.markerId);
                          marginEditor.removeComment(comment.markerId);
                          setActiveSlot(null);
                        }}
                      >
                        ×
                      </button>
                    )}
                    {/* One unified editor: while the slot is a draft it routes to type-to-create; once a
                        comment exists it routes to that comment — same instance, no branch swap. */}
                    <SlotEditor
                      value={comment ? comment.body : draft}
                      mode={mode}
                      fontSize={fontSize}
                      focusOnMount
                      placeholder={comment ? "Add a comment…" : "Type to comment this paragraph…"}
                      onChange={(next) =>
                        comment
                          ? updateCommentBody(comment.markerId, next)
                          : handleBlockDraftChange(row.block.index, row.block.text, next)
                      }
                      onBlur={() => setActiveSlot(null)}
                      onNext={() => navigate(rowIndex, "next")}
                      onPrevious={() => navigate(rowIndex, "previous")}
                      onEscape={() => {
                        setActiveSlot(null);
                        if (comment) focusMarkerBlock(comment.markerId);
                      }}
                    />
                  </>
                ) : comment ? (
                  <button
                    type="button"
                    // `whitespace-pre-wrap` in both states keeps the comment's line breaks (collapsing no
                    // longer flattens the markdown onto one line — margins-4 #5/formatting); the row
                    // clip above limits a collapsed comment to its paragraph's height.
                    className="w-full whitespace-pre-wrap break-words text-left text-foreground/90"
                    style={serifText(fontSize)}
                    // Clicking a comment activates it for editing and reveals its bound paragraph in the
                    // editor (the left guide line is gone — margins-4 #11).
                    onClick={() => {
                      revealMarker(comment.markerId);
                      setActiveSlot({ kind: "comment", markerId: comment.markerId });
                      setDraft("");
                    }}
                  >
                    {comment.body || <span className="text-muted-foreground">(empty)</span>}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-full text-left text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
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

        {/* Notes: bottom-placed (margins-4 #3) — a collapsible section reached only after scrolling
            past the fragment text, scrolling with the content rather than offsetting the top. */}
        <section
          className="mt-8 flex flex-col gap-1 border-t border-border pt-3"
          data-testid="margin-notes"
        >
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
            <div
              className={`rounded-md px-2 py-1 ${
                activeSlot?.kind === "notes" ? "border border-border/60 bg-muted/20" : ""
              }`}
              data-slot-notes
            >
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
                  style={serifText(fontSize)}
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
      </div>

      {/* Column controls: a pinned footer at the bottom of the column (margins-4 #4) — the jump-to-slot
          gesture and the expand-all toggle. The margin no longer has its own Save button: the editor's
          save persists the fragment and the Margin together (margins-4 #13). */}
      <div
        className="flex shrink-0 items-center justify-end gap-3 border-t border-border pt-2"
        data-testid="margin-controls"
      >
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
      </div>
    </div>
  );
});

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
import { pixelArraysEqual } from "@lib/margins/alignment";
import { deriveLiveExcerpts } from "@lib/margins/excerpts";
import { SlotEditor, type EditorMode, MARGIN_LINE_HEIGHT, MARGIN_FONT_SIZE } from "./slot-editor";

// Serif text styling shared by the column's static (non-editing) comment and notes text, so they read
// in the same family + rhythm as the active slot editors. Rendered at the app text size (decoupled
// from the larger prose font now that alignment no longer depends on pixel-exact comment heights).
const serifText = {
  fontFamily: "var(--font-serif)",
  lineHeight: MARGIN_LINE_HEIGHT,
  fontSize: MARGIN_FONT_SIZE,
};

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
  // Whether the fragment prose has unsaved edits this session. The fuzzy orphan re-bind only runs
  // while dirty (review #6) — a user-initiated edit like pasting a deleted paragraph back — so merely
  // opening a clean fragment never silently re-anchors an orphan and dirties it.
  fragmentDirty: boolean;
  // The fragment editor mode, so the active slot edits in the matching idiom (one active editor).
  mode: EditorMode;
  // The fragment editor's font size — a trigger to re-measure block geometry when the size changes.
  // The Margin text itself renders at the app size (see `serifText`).
  fontSize: number;
  onCommentBlock?: () => void;
  // Editor bridge (coordinated buffer edits + geometry), wired from the fragment editor shell.
  addAnchorAtBlock: (blockIndex: number, markerId: string) => void;
  removeAnchor: (markerId: string) => void;
  revealAnchor: (markerId: string) => void;
  focusAnchorBlock: (markerId: string) => void;
  getScrollElement: () => HTMLElement | null;
  // The editor's authoritative block list (ADR 0009): the column renders one row per entry, binds
  // comments by markerId, and anchors each comment at the block's measured `top`.
  getBlocks: () => EditorBlock[];
};

export const MarginColumn = forwardRef<MarginColumnHandle, Props>(function MarginColumn(
  {
    projectId,
    marginEditor,
    fragmentContent,
    fragmentDirty,
    mode,
    fontSize,
    onCommentBlock,
    addAnchorAtBlock,
    removeAnchor,
    revealAnchor,
    focusAnchorBlock,
    getScrollElement,
    getBlocks,
  },
  ref,
) {
  const { notes, comments, setNotes, updateCommentBody, addCommentStub } = marginEditor;

  const [notesOpen, , toggleNotes] = usePersistedBoolean(`marginNotesOpen_${projectId}`, true);
  // Global default: collapsed (comments clipped to their paragraph's height). Expand-all relaxes the
  // anchoring into a plain readable column; the focused slot always expands regardless.
  const [expandAll, , toggleExpandAll] = usePersistedBoolean(`marginExpandAll_${projectId}`, false);

  const [activeSlot, setActiveSlot] = useState<ActiveSlot>(null);
  const [draft, setDraft] = useState("");
  // Bumped after mount / content change / resize to re-pull the editor's measured geometry. The block
  // list itself comes from the editor (ADR 0009) — the single source of enumeration and geometry.
  const [geometryTick, setGeometryTick] = useState(0);
  // Total scrollable height of the anchored rows container, kept equal to the editor's content height
  // so the two columns scroll in lockstep (absolute anchoring; the rows float over this box).
  const [contentHeight, setContentHeight] = useState(0);
  // Block indices whose collapsed comment is taller than its clip — they get an overflow cue.
  const [overflowingBlocks, setOverflowingBlocks] = useState<number[]>([]);

  const editorBlocks = useMemo(
    () => getBlocks(),
    [getBlocks, fragmentContent, mode, fontSize, geometryTick],
  );
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

  // Until the editor has emitted its block list, `getBlocks()` returns [] — every comment would bind
  // to nothing and flash in the orphan group for a frame (review #7). Treat the column as "measured"
  // once we have blocks, or when the fragment is genuinely empty (no blocks to expect); suppress the
  // orphan group and the empty-state copy until then.
  const measured = editorBlocks.length > 0 || fragmentContent.trim() === "";

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Latest comments, read by the empty-comment cleanup on blur (the closure that fires may predate the
  // final keystroke's re-render).
  const commentsRef = useRef(comments);
  commentsRef.current = comments;

  // An emptied comment is removed rather than left as a blank slot (no "(empty)" placeholder): on blur
  // (or Escape) a comment whose body is now whitespace drops the comment. For an *anchored* comment
  // this also strips its anchor (coordinated edit; each side persists on its own next save); for an
  // *orphan* (no live anchor) it removes the comment only — calling `removeAnchor` would needlessly
  // dirty the fragment. Returns whether it deleted.
  const deleteCommentIfEmpty = useCallback(
    (markerId: string, { anchored = true }: { anchored?: boolean } = {}): boolean => {
      const current = commentsRef.current.find((entry) => entry.markerId === markerId);
      if (current && current.body.trim() === "") {
        if (anchored) removeAnchor(markerId);
        marginEditor.removeComment(markerId);
        return true;
      }
      return false;
    },
    [removeAnchor, marginEditor],
  );

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

  // --- Block geometry: re-pull the editor's measured block list when the content changes or the
  // editor resizes. A tick bump re-runs `getBlocks()` after layout has settled. ---
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

  // --- Anchored geometry (ADR 0009, absolute model). The rows container matches the editor's content
  // height (so the two scroll in lockstep) and each comment is positioned at its block's measured top.
  // A collapsed comment taller than its block-clip gets an overflow cue. Re-runs on geometry/comment
  // change. ---
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const editorScroll = getScrollElement();
    const measuredHeight =
      editorScroll?.scrollHeight ??
      editorBlocks.reduce((max, block) => Math.max(max, block.top + block.height), 0);
    setContentHeight((previous) =>
      Math.abs(previous - measuredHeight) < 0.5 ? previous : measuredHeight,
    );
    const overflowing: number[] = [];
    for (const block of blocks) {
      const node = scroll.querySelector<HTMLElement>(`[data-row-index="${block.index}"]`);
      if (node && node.scrollHeight - node.clientHeight > 2) overflowing.push(block.index);
    }
    setOverflowingBlocks((previous) =>
      pixelArraysEqual(previous, overflowing) ? previous : overflowing,
    );
  }, [editorBlocks, blocks, comments, expandAll, mode, fontSize, getScrollElement]);

  // --- Fuzzy recovery (ADR 0009). An orphaned comment whose last-known excerpt still uniquely matches
  // an un-anchored block re-anchors to it. Conservative and self-terminating; gated on `fragmentDirty`
  // (review #6) so opening a clean fragment never silently re-anchors an orphan. ---
  useEffect(() => {
    if (!fragmentDirty) return;
    for (const { blockIndex, markerId } of planOrphanRebinds(blocks, orphans)) {
      addAnchorAtBlock(blockIndex, markerId);
    }
  }, [fragmentDirty, blocks, orphans, addAnchorAtBlock]);

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

  // Type-to-create: the first non-empty keystroke in an empty slot mints a marker, injects it into that
  // block, and seeds a bound comment with the typed text. An untouched empty slot creates nothing.
  const handleBlockDraftChange = (blockIndex: number, blockText: string, next: string) => {
    if (next.trim() === "") {
      setDraft(next);
      return;
    }
    const markerId = createCommentMarkerId();
    addAnchorAtBlock(blockIndex, markerId);
    addCommentStub({ markerId, excerpt: deriveExcerpt(blockText), body: next });
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

  const renderRowInner = (row: (typeof rows)[number], isActive: boolean, rowIndex: number) => {
    const comment = row.comment;
    return (
      <>
        {comment && (
          // Floating remove control in the left gutter — visible on hover (or while editing) so a
          // comment can be deleted without offsetting its box. Coordinated delete: strip the marker
          // from the fragment buffer and drop the comment; each persists on its own save.
          <button
            type="button"
            className={`absolute left-1 top-1.5 text-xs leading-none text-muted-foreground transition-opacity hover:text-destructive ${
              isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            aria-label="Remove comment"
            title="Remove comment (strips its anchor)"
            onMouseDown={(event) => {
              event.preventDefault();
              removeAnchor(comment.markerId);
              marginEditor.removeComment(comment.markerId);
              setActiveSlot(null);
            }}
          >
            ×
          </button>
        )}

        {isActive ? (
          <SlotEditor
            value={comment ? comment.body : draft}
            mode={mode}
            fontSize={MARGIN_FONT_SIZE}
            focusOnMount
            placeholder={comment ? "Add a comment…" : "Type to comment this paragraph…"}
            onChange={(next) =>
              comment
                ? updateCommentBody(comment.markerId, next)
                : handleBlockDraftChange(row.block.index, row.block.text, next)
            }
            onBlur={() => {
              if (comment) deleteCommentIfEmpty(comment.markerId);
              setActiveSlot(null);
            }}
            onNext={() => navigate(rowIndex, "next")}
            onPrevious={() => navigate(rowIndex, "previous")}
            onEscape={() => {
              setActiveSlot(null);
              if (comment && !deleteCommentIfEmpty(comment.markerId)) {
                focusAnchorBlock(comment.markerId);
              }
            }}
          />
        ) : comment ? (
          <button
            type="button"
            className="w-full whitespace-pre-wrap wrap-break-word text-left text-foreground/90"
            style={serifText}
            onClick={() => {
              revealAnchor(comment.markerId);
              setActiveSlot({ kind: "comment", markerId: comment.markerId });
              setDraft("");
            }}
          >
            {comment.body}
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
      </>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="margin-column">
      {/* No top chrome: the scroller is flush to the editor's first line, and each comment is anchored
          to its block's measured top. Notes + controls live at the bottom. */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto no-scrollbar pr-1"
        data-testid="margin-scroll"
      >
        {/* Anchored mode: a relative box as tall as the editor's content, comments floating at each
            block's top. Expand-all relaxes into a plain stacked column (alignment dropped for reading). */}
        <div
          className={expandAll ? "flex flex-col" : "relative"}
          style={expandAll ? undefined : { height: contentHeight || undefined }}
          data-testid="margin-rows"
        >
          {rows.map((row, rowIndex) => {
            const comment = row.comment;
            const isActive =
              (activeSlot?.kind === "comment" && comment?.markerId === activeSlot.markerId) ||
              (activeSlot?.kind === "block" && activeSlot.index === row.block.index);

            const geometry = editorBlocks[row.block.index];
            const top = geometry?.top ?? 0;
            const blockHeight = geometry?.height ?? 0;
            // Collapse every idle row to its paragraph's height so a comment never visually runs into
            // its neighbour; the focused comment lifts onto an opaque overlay above its neighbours.
            const clip = !expandAll && !isActive;
            const isOverflowing = clip && overflowingBlocks.includes(row.block.index);

            const positioned = !expandAll;
            return (
              <div
                key={`row-${row.block.index}`}
                data-row-index={row.block.index}
                {...(comment
                  ? { "data-slot-marker": comment.markerId }
                  : { "data-slot-block": row.block.index })}
                className={`group relative border border-transparent pb-1 pl-6 pr-2 ${
                  comment && !isActive ? "border-t-border/40" : ""
                } ${isActive ? "z-10 rounded-sm border-border/60 bg-background shadow-sm" : ""}`}
                style={{
                  ...(positioned
                    ? { position: "absolute", top, left: 0, right: 0 }
                    : { position: "relative" }),
                  ...(clip ? { maxHeight: blockHeight || undefined, overflow: "hidden" } : {}),
                }}
              >
                {renderRowInner(row, isActive, rowIndex)}
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
          })}
        </div>

        {measured && orphans.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Orphaned ({orphans.length})
            </p>
            {orphans.map((comment) => {
              const isActive =
                activeSlot?.kind === "comment" && activeSlot.markerId === comment.markerId;
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
                      // Orphan removal is a no-op on the fragment side (no live anchor to strip).
                      marginEditor.removeComment(comment.markerId);
                      setActiveSlot(null);
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
                      onChange={(next) => updateCommentBody(comment.markerId, next)}
                      onBlur={() => {
                        deleteCommentIfEmpty(comment.markerId, { anchored: false });
                        setActiveSlot(null);
                      }}
                      onEscape={() => {
                        setActiveSlot(null);
                        deleteCommentIfEmpty(comment.markerId, { anchored: false });
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="w-full whitespace-pre-wrap wrap-break-word text-left text-foreground/90"
                      style={serifText}
                      onClick={() => setActiveSlot({ kind: "comment", markerId: comment.markerId })}
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
        )}

        {measured && rows.length === 0 && orphans.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No paragraphs yet. Write in the fragment, then type beside a paragraph to annotate it.
          </p>
        )}

        {/* Notes: bottom-placed — a collapsible section reached only after scrolling past the fragment
            text, scrolling with the content rather than offsetting the top. */}
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
                  fontSize={MARGIN_FONT_SIZE}
                  focusOnMount
                  placeholder="Thoughts on structure, character, things to rewrite…"
                  onChange={setNotes}
                  onBlur={() => setActiveSlot(null)}
                  onEscape={() => setActiveSlot(null)}
                />
              ) : (
                <button
                  type="button"
                  className="min-h-6 w-full whitespace-pre-wrap text-left text-foreground/90"
                  style={serifText}
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

      {/* Column controls: a pinned footer — the jump-to-slot gesture and the expand-all toggle. The
          margin saves with the editor (no separate Save button). */}
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

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
  computeCommentClipHeights,
  computeCoveredSlots,
  nextSlotIndex,
  previousSlotIndex,
  planOrphanRebinds,
  resolveColumnBlocks,
  type FragmentBlock,
  type SlotRow,
} from "@lib/margins/column";
import { deriveLiveExcerpts } from "@lib/margins/excerpts";
import type { EditorMode } from "./slot-editor";
import { useMarginGeometry } from "./use-margin-geometry";
import { useScrollSync } from "./use-scroll-sync";
import { MarginRow } from "./margin-row";
import { MarginOrphanGroup } from "./margin-orphan-group";
import { MarginNotesSection } from "./margin-notes-section";

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
  // while dirty (review #6) — so opening a clean fragment never silently re-anchors an orphan.
  fragmentDirty: boolean;
  // The fragment editor mode, so the active slot edits in the matching idiom (one active editor).
  mode: EditorMode;
  // The fragment editor's font size — a re-measure trigger when it changes (the prose geometry shifts
  // with it). The Margin text itself renders at `marginFontSize`.
  fontSize: number;
  // The configured Margin text size (`editor.marginFontSize`) — all Margin text + slot editors.
  marginFontSize: number;
  onCommentBlock?: () => void;
  // Editor bridge (coordinated buffer edits + geometry), wired from the fragment editor shell.
  addAnchorAtBlock: (blockIndex: number, markerId: string) => void;
  removeAnchor: (markerId: string) => void;
  revealAnchor: (markerId: string) => void;
  focusAnchorBlock: (markerId: string) => void;
  // Reciprocal connection cue. `highlightAnchor` tints the bound paragraph in the editor while a
  // comment is hovered/focused (null clears); `highlightedMarkerId` is the comment whose block the
  // caret is in, so the column tints that comment back.
  highlightAnchor?: (markerId: string | null) => void;
  highlightedMarkerId?: string | null;
  getScrollElement: () => HTMLElement | null;
  // The editor's authoritative block list (ADR 0009): one row per entry, bound by markerId and
  // anchored at the block's measured `top`.
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
    marginFontSize,
    onCommentBlock,
    addAnchorAtBlock,
    removeAnchor,
    revealAnchor,
    focusAnchorBlock,
    highlightAnchor,
    highlightedMarkerId,
    getScrollElement,
    getBlocks,
  },
  ref,
) {
  const { notes, comments, setNotes, updateCommentBody, addCommentStub } = marginEditor;

  // Notes + orphans are collapsible panels pinned in the column footer (outside the comment scroller).
  // Default collapsed: the toggle is always visible, and opening a panel takes a limited, own-scroll
  // share of the column without unlocking the comment scroller from the editor.
  const [notesOpen, , toggleNotes] = usePersistedBoolean(`marginNotesOpen_${projectId}`, false);
  const [orphansOpen, , toggleOrphans] = usePersistedBoolean(
    `marginOrphansOpen_${projectId}`,
    false,
  );
  // Global default: collapsed (comments clipped to their block's height). Expand-all relaxes the
  // anchoring into a plain readable column; the focused slot always expands regardless.
  const [expandAll, , toggleExpandAll] = usePersistedBoolean(`marginExpandAll_${projectId}`, false);

  const [activeSlot, setActiveSlot] = useState<ActiveSlot>(null);
  const [draft, setDraft] = useState("");
  // The comment the pointer is over — drives the editor-side highlight (alongside the focused one).
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { editorBlocks, contentHeight, overflowingBlocks } = useMarginGeometry({
    getBlocks,
    getScrollElement,
    scrollRef,
    fragmentContent,
    mode,
    fontSize,
    expandAll,
  });
  useScrollSync(getScrollElement, scrollRef, editorBlocks);

  // The block list built from the editor's measured geometry. It can transiently read empty while a
  // refetch-triggered editor reload is in flight; `resolveColumnBlocks` (below) holds the previous
  // list in that window so comments don't flicker into the orphan group.
  const incomingBlocks = useMemo<FragmentBlock[]>(
    () =>
      editorBlocks.map((block, index) => ({
        index,
        text: block.text,
        markerId: block.markerId,
      })),
    [editorBlocks],
  );
  // Last non-empty block list, reused when the incoming list transiently empties during a reload while
  // comments still exist (Phase 1 gate). A genuine orphaning leaves a non-empty list, so the reuse
  // never masks a real deletion.
  const settledBlocksRef = useRef<FragmentBlock[]>([]);
  const blocks = useMemo<FragmentBlock[]>(() => {
    const resolved = resolveColumnBlocks(incomingBlocks, settledBlocksRef.current, comments);
    if (resolved.length > 0) settledBlocksRef.current = resolved;
    return resolved;
  }, [incomingBlocks, comments]);
  const markerIds = useMemo(
    () => blocks.flatMap((block) => (block.markerId ? [block.markerId] : [])),
    [blocks],
  );
  const liveExcerpts = useMemo(
    () => deriveLiveExcerpts(fragmentContent, markerIds),
    [fragmentContent, markerIds],
  );
  const { rows, orphans } = useMemo(() => buildColumn(blocks, comments), [blocks, comments]);

  // A row is "active" when its slot is the one being edited — an existing comment, or an empty block
  // whose new comment is being authored (the slot editor is open before the comment is committed).
  const isRowActive = useCallback(
    (row: SlotRow) =>
      (activeSlot?.kind === "comment" && row.comment?.markerId === activeSlot.markerId) ||
      (activeSlot?.kind === "block" && activeSlot.index === row.block.index),
    [activeSlot],
  );

  // Per-row clip height: how far each idle comment may extend before meeting the next comment below
  // (null = no comment below, so it extends freely). The clip stops at the next comment, not the
  // paragraph, so a tall comment spans the empty blocks beneath it. An *active* slot counts as
  // occupied too: authoring a new comment in the middle of a long one clips that comment at the new
  // slot immediately, so it no longer shows through below the open editor before being committed.
  const clipHeights = useMemo(
    () =>
      computeCommentClipHeights(
        rows.map((row) => ({
          top: editorBlocks[row.block.index]?.top ?? 0,
          hasComment: !!row.comment || isRowActive(row),
        })),
      ),
    [rows, editorBlocks, isRowActive],
  );

  // An empty slot is "covered" when an overflowing comment above extends down over it (to the next
  // comment). Such a slot renders a compact, pointer-transparent affordance instead of a full-width
  // hover button, so the comment beneath stays readable/scrollable while the paragraph is still
  // hover-commentable. An active slot is treated as occupied here too, so it stops coverage at its
  // position (the comment above no longer extends past the open editor).
  const coveredFlags = useMemo(
    () =>
      computeCoveredSlots(
        rows.map((row) => ({
          hasComment: !!row.comment || isRowActive(row),
          isOverflowing: overflowingBlocks.includes(row.block.index),
        })),
      ),
    [rows, overflowingBlocks, isRowActive],
  );

  // Until the editor has emitted its block list, `getBlocks()` returns [] — every comment would bind
  // to nothing and flash in the orphan group for a frame (review #7). Treat the column as "measured"
  // once we have blocks, or when the fragment is genuinely empty; suppress the orphan group and the
  // empty-state copy until then.
  const measured = editorBlocks.length > 0 || fragmentContent.trim() === "";

  // Latest comments, read by the empty-comment cleanup on blur (the closure that fires may predate the
  // final keystroke's re-render).
  const commentsRef = useRef(comments);
  commentsRef.current = comments;

  // An emptied comment is removed rather than left as a blank slot: on blur/Escape a comment whose body
  // is now whitespace drops the comment. For an *anchored* comment this also strips its anchor; for an
  // *orphan* it removes the comment only. Returns whether it deleted.
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

  // --- Reciprocal highlight (margin → editor). Tint the bound paragraph for the comment under the
  // pointer, or the focused one when nothing is hovered. Clears (null) when neither applies. ---
  const activeCommentMarker = activeSlot?.kind === "comment" ? activeSlot.markerId : null;
  useEffect(() => {
    if (!highlightAnchor) return;
    highlightAnchor(hoveredMarkerId ?? activeCommentMarker);
    return () => highlightAnchor(null);
  }, [highlightAnchor, hoveredMarkerId, activeCommentMarker]);

  // --- Fuzzy recovery (ADR 0009). An orphaned comment whose last-known excerpt still uniquely matches
  // an un-anchored block re-anchors to it. Conservative and self-terminating; gated on `fragmentDirty`
  // so opening a clean fragment never silently re-anchors an orphan. ---
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

  const activateComment = (markerId: string) => {
    setActiveSlot({ kind: "comment", markerId });
    setDraft("");
  };
  const activateBlock = (index: number) => {
    setActiveSlot({ kind: "block", index });
    setDraft("");
  };
  const removeComment = (markerId: string) => {
    removeAnchor(markerId);
    marginEditor.removeComment(markerId);
    setActiveSlot(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="margin-column">
      {/* No top chrome: the scroller is flush to the editor's first line, and each comment is anchored
          to its block's measured top. The scroller holds *only* the per-block rows, so its content
          height matches the editor's and the two stay locked (orphans + notes + controls live in the
          pinned footer below, never adding scrollable height that would let the column drift). */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto no-scrollbar pr-1"
        data-testid="margin-scroll"
      >
        {/* Anchored mode: a relative box as tall as the editor's content, comments floating at each
            block's top. Expand-all relaxes into a plain stacked column. */}
        <div
          className={expandAll ? "flex flex-col" : "relative"}
          style={expandAll ? undefined : { height: contentHeight || undefined }}
          data-testid="margin-rows"
        >
          {rows.map((row, rowIndex) => {
            const comment = row.comment;
            const isActive = isRowActive(row);
            const geometry = editorBlocks[row.block.index];
            // Clip the idle, anchored row to the gap before the next comment; a null gap (no comment
            // below) and the expand-all / active states render unclipped.
            const clipHeight = expandAll || isActive ? null : (clipHeights[rowIndex] ?? null);
            return (
              <MarginRow
                key={`row-${row.block.index}`}
                row={row}
                isActive={isActive}
                fontSize={marginFontSize}
                isCaretBlock={!!comment && comment.markerId === highlightedMarkerId && !isActive}
                positioned={!expandAll}
                top={geometry?.top ?? 0}
                clipHeight={clipHeight}
                covered={coveredFlags[rowIndex] ?? false}
                isOverflowing={clipHeight !== null && overflowingBlocks.includes(row.block.index)}
                mode={mode}
                draft={draft}
                onHoverChange={setHoveredMarkerId}
                onRemove={removeComment}
                onActivateComment={activateComment}
                onActivateBlock={activateBlock}
                onRevealComment={revealAnchor}
                onChangeComment={updateCommentBody}
                onDraftChange={handleBlockDraftChange}
                onBlur={() => {
                  if (comment) deleteCommentIfEmpty(comment.markerId);
                  setActiveSlot(null);
                }}
                onEscape={() => {
                  setActiveSlot(null);
                  if (comment && !deleteCommentIfEmpty(comment.markerId)) {
                    focusAnchorBlock(comment.markerId);
                  }
                }}
                onNext={() => navigate(rowIndex, "next")}
                onPrevious={() => navigate(rowIndex, "previous")}
              />
            );
          })}
        </div>

        {measured && rows.length === 0 && orphans.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No paragraphs yet. Write in the fragment, then type beside a paragraph to annotate it.
          </p>
        )}
      </div>

      {/* Pinned footer — orphans, notes, and column controls. These sit *outside* the synced scroller
          so the comment column stays locked to the editor: their toggles are always visible and a
          panel expands in place (own capped scroll) without pushing the comments out of alignment. */}
      <div className="flex shrink-0 flex-col border-t border-border" data-testid="margin-footer">
        {measured && (
          <MarginOrphanGroup
            orphans={orphans}
            activeMarkerId={activeCommentMarker}
            mode={mode}
            fontSize={marginFontSize}
            open={orphansOpen}
            onToggle={toggleOrphans}
            liveExcerpts={liveExcerpts}
            onActivate={(markerId) => setActiveSlot({ kind: "comment", markerId })}
            onChange={updateCommentBody}
            onSettle={(markerId) => {
              deleteCommentIfEmpty(markerId, { anchored: false });
              setActiveSlot(null);
            }}
            onRemove={(markerId) => {
              // Orphan removal is a no-op on the fragment side (no live anchor to strip).
              marginEditor.removeComment(markerId);
              setActiveSlot(null);
            }}
          />
        )}

        <MarginNotesSection
          notes={notes}
          open={notesOpen}
          onToggle={toggleNotes}
          active={activeSlot?.kind === "notes"}
          mode={mode}
          fontSize={marginFontSize}
          onChange={setNotes}
          onActivate={() => setActiveSlot({ kind: "notes" })}
          onDeactivate={() => setActiveSlot(null)}
        />

        {/* The jump-to-slot gesture and the expand-all toggle. The margin saves with the editor (no
            separate Save button). */}
        <div
          className="flex shrink-0 items-center justify-end gap-3 border-t border-border/40 mt-1 pt-2"
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
    </div>
  );
});

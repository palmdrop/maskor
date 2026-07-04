import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ENTITY_KEY_REGEX } from "@maskor/shared";
import {
  usePreviewSplitFragment,
  useSplitFragment,
  getListFragmentsQueryKey,
  getListFragmentSummariesQueryKey,
  getGetFragmentQueryKey,
} from "@api/generated/fragments/fragments";
import { getListSequencesQueryKey } from "@api/generated/sequences/sequences";
import { getGetMarginQueryKey } from "@api/generated/margins/margins";
import { useInvalidateActionLog } from "@api/action-log";
import type {
  SplitDelimiter,
  SplitPiecePreview,
  SplitPieceKey,
} from "@api/generated/maskorAPI.schemas";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@components/ui/select";

type DelimiterType = SplitDelimiter["type"];
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

// When the split would produce more than this many resulting fragments (the kept
// original + the new pieces, i.e. `pieceCount`), an aggressive (usually blank-line)
// split is flagged so the user confirms it deliberately — never blocked, just a
// heads-up. See the spec.
const MANY_PIECES_THRESHOLD = 10;

const DELIMITER_TYPE_OPTIONS: ReadonlyArray<{ value: DelimiterType; label: string }> = [
  { value: "heading", label: "Heading level" },
  { value: "thematic-break", label: "Thematic break (---)" },
  { value: "blank-line", label: "Blank line / paragraph" },
];

interface SplitFragmentDialogProps {
  projectId: string;
  fragmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called after a successful split (e.g. to navigate or refresh a host view).
  onSplit?: () => void;
}

export const SplitFragmentDialog = ({
  projectId,
  fragmentId,
  open,
  onOpenChange,
  onSplit,
}: SplitFragmentDialogProps) => {
  const queryClient = useQueryClient();
  const invalidateActionLog = useInvalidateActionLog(projectId);

  // `null` means "auto" — no delimiter has been chosen yet, so the first preview
  // call omits the delimiter and the server smart-selects one (returned as
  // `appliedDelimiter`, which then seeds these controls).
  const [delimiterType, setDelimiterType] = useState<DelimiterType | null>(null);
  const [headingLevel, setHeadingLevel] = useState<HeadingLevel>(1);
  const [pieces, setPieces] = useState<SplitPiecePreview[]>([]);
  // User-chosen key overrides for the new pieces (pieceIndex 2…N), keyed by
  // pieceIndex. Absent → the derived key shown in the preview is used. Cleared
  // whenever the delimiter changes (the piece set changes with it).
  const [editedKeys, setEditedKeys] = useState<Record<number, string>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);

  const delimiter = useMemo<SplitDelimiter | null>(() => {
    if (delimiterType === null) return null;
    return delimiterType === "heading"
      ? { type: "heading", level: headingLevel }
      : { type: delimiterType };
  }, [delimiterType, headingLevel]);

  // Reset all delimiter-scoped key edits and adopt a new delimiter. Used by both
  // selectors so a user-driven delimiter change never carries stale key overrides
  // from a different piece set.
  const changeDelimiterType = useCallback((next: DelimiterType) => {
    setDelimiterType(next);
    setEditedKeys({});
  }, []);
  const changeHeadingLevel = useCallback((next: HeadingLevel) => {
    setHeadingLevel(next);
    setEditedKeys({});
  }, []);

  const previewSplit = usePreviewSplitFragment();
  const splitFragment = useSplitFragment();
  const { mutateAsync: previewMutateAsync } = previewSplit;

  // Live preview: recompute whenever the dialog opens or the delimiter changes.
  // On open `delimiter` is null, so the request omits it and the server picks a
  // smart default — its `appliedDelimiter` seeds the controls (which then triggers
  // one more, idempotent, explicit preview). A `cancelled` flag discards
  // out-of-order responses from rapid delimiter toggles. The endpoint is in-memory
  // and cheap, so no debounce is needed.
  useEffect(() => {
    if (!open) {
      setPieces([]);
      setEditedKeys({});
      setDelimiterType(null);
      setHeadingLevel(1);
      setPreviewError(null);
      setSplitError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await previewMutateAsync({
          projectId,
          data: { fragmentId, delimiter: delimiter ?? undefined },
        });
        if (cancelled) return;
        // customFetch throws on non-2xx, so a resolved response is always 200;
        // the status check narrows the generated response union for the compiler.
        if (response.status !== 200) {
          setPieces([]);
          return;
        }
        setPieces(response.data.pieces);
        setPreviewError(null);
        // Adopt the server-selected delimiter the first time (auto mode).
        if (delimiterType === null) {
          const applied = response.data.appliedDelimiter;
          setDelimiterType(applied.type);
          if (applied.type === "heading") {
            setHeadingLevel(applied.level as HeadingLevel);
          }
        }
      } catch {
        if (cancelled) return;
        setPieces([]);
        setPreviewError("Couldn't compute the preview.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, fragmentId, delimiter, delimiterType, previewMutateAsync]);

  // The effective key for a piece: the user's override if present, else the
  // derived key from the preview. Piece 1 always reports the original's key.
  const effectiveKey = useCallback(
    (piece: SplitPiecePreview): string => editedKeys[piece.pieceIndex] ?? piece.key,
    [editedKeys],
  );

  // Validate the new pieces' keys (pieceIndex 2…N): each non-empty, well-formed,
  // and unique (case-insensitive) across all pieces. The server is authoritative
  // for collisions with existing fragments; this is the in-modal fast feedback.
  const keyError = useMemo<string | null>(() => {
    const seen = new Set<string>();
    for (const piece of pieces) {
      const key = effectiveKey(piece).trim();
      if (piece.pieceIndex >= 2) {
        if (!key.length) return "Piece keys must not be empty.";
        if (!ENTITY_KEY_REGEX.test(key)) {
          return "Keys may only contain letters, numbers, spaces, hyphens, and underscores.";
        }
      }
      const lowered = key.toLowerCase();
      if (seen.has(lowered)) return `Duplicate key "${key}".`;
      seen.add(lowered);
    }
    return null;
  }, [pieces, effectiveKey]);

  const pieceCount = pieces.length;
  const isPending = splitFragment.isPending;
  // Gate on the preview being settled too: between switching to a delimiter and
  // its preview returning, `pieces` still holds the previous delimiter's result,
  // so confirming would dispatch against a stale count. Disable until it lands.
  const canConfirm =
    pieceCount > 1 &&
    delimiter !== null &&
    keyError === null &&
    !isPending &&
    !previewSplit.isPending;

  // Dialog-internal confirmation (a form submit inside an open modal): runs the
  // mutation directly and surfaces failures in-place, like the other modals —
  // not through the command system.
  const handleConfirm = useCallback(async () => {
    if (delimiter === null) return;
    setSplitError(null);
    // Send only user-overridden keys; un-edited new pieces fall back to the
    // server's derived key (identical to the preview).
    const pieceKeys: SplitPieceKey[] = Object.entries(editedKeys)
      .map(([pieceIndex, key]) => ({ pieceIndex: Number(pieceIndex), key: key.trim() }))
      .filter((override) => override.pieceIndex >= 2);
    let splitWarnings: string[] = [];
    try {
      const response = await splitFragment.mutateAsync({
        projectId,
        data: { fragmentId, delimiter, pieceKeys: pieceKeys.length ? pieceKeys : undefined },
      });
      if (response.status === 200) {
        splitWarnings = response.data.warnings;
      }
    } catch (error) {
      // Surface the server's key-conflict message when present (e.g. a chosen key
      // collides with an existing fragment); otherwise a generic failure.
      const message = (error as { message?: string })?.message;
      setSplitError(message && /key/i.test(message) ? message : "Split failed. Try again.");
      return;
    }
    // The split committed server-side. From here on, a refetch rejection must
    // not be reported as a split failure — invalidate best-effort and swallow
    // any error so the dialog still closes cleanly. (A refetch that throws here
    // is what previously surfaced the bogus "Split failed" after a successful
    // split, e.g. on a `---` thematic-break split.)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListFragmentsQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: getListFragmentSummariesQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: getListSequencesQueryKey(projectId) }),
        // The source fragment was truncated to piece 1 and its Margin lost the
        // migrated comments — refresh both so an open editor reflects the split
        // instead of showing stale cached content.
        queryClient.invalidateQueries({ queryKey: getGetFragmentQueryKey(projectId, fragmentId) }),
        queryClient.invalidateQueries({ queryKey: getGetMarginQueryKey(projectId, fragmentId) }),
      ]);
    } catch {
      // Non-fatal: the split is already persisted; stale caches will reconcile
      // on the next fetch. Do not surface this as a split failure.
    }
    invalidateActionLog();
    // Non-fatal follow-up failures (sequence placement, Margin migration): the
    // split itself committed, so the dialog closes as a success and the warnings
    // surface as a toast rather than a bogus "Split failed".
    for (const warning of splitWarnings) {
      toast.warning(warning);
    }
    onOpenChange(false);
    onSplit?.();
  }, [
    splitFragment,
    projectId,
    fragmentId,
    delimiter,
    editedKeys,
    queryClient,
    invalidateActionLog,
    onOpenChange,
    onSplit,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Split fragment</DialogTitle>
          <DialogDescription>
            Divide this fragment along a delimiter. The original keeps its identity as the first
            piece; the rest become new fragments inheriting its aspects and references. Rename the
            new pieces below before splitting.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-2">
            <Select
              // Empty string (not undefined) keeps the Select controlled before
              // auto-detect resolves, so it never flips controlled↔uncontrolled.
              value={delimiterType ?? ""}
              onValueChange={(value) => changeDelimiterType(value as DelimiterType)}
            >
              <SelectTrigger size="sm" className="w-56">
                <SelectValue placeholder="Detecting…" />
              </SelectTrigger>
              <SelectContent>
                {DELIMITER_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {delimiterType === "heading" && (
              <Select
                value={String(headingLevel)}
                onValueChange={(value) => changeHeadingLevel(Number(value) as HeadingLevel)}
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  {([1, 2, 3, 4, 5, 6] as const).map((level) => (
                    <SelectItem key={level} value={String(level)}>
                      H{level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {pieceCount} piece{pieceCount === 1 ? "" : "s"}
              </span>
              {previewSplit.isPending && (
                <span className="text-xs text-muted-foreground">Previewing…</span>
              )}
            </div>

            {previewError ? (
              <p className="text-sm text-destructive">{previewError}</p>
            ) : pieceCount === 0 ? (
              <p className="text-sm text-muted-foreground">No content to split.</p>
            ) : (
              <ol className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto pr-1">
                {pieces.map((piece) => (
                  <li
                    key={piece.pieceIndex}
                    className="flex min-w-0 flex-col gap-1 rounded-md border border-border/50 px-3 py-2"
                  >
                    {piece.pieceIndex === 1 ? (
                      // Piece 1 keeps the original fragment's identity, so its key
                      // is fixed (renaming the original is a separate action).
                      <span className="flex items-center gap-2 text-sm font-medium break-words">
                        1. {piece.key}
                        <span className="text-xs font-normal text-muted-foreground">(kept)</span>
                      </span>
                    ) : (
                      <label className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{piece.pieceIndex}.</span>
                        <Input
                          value={effectiveKey(piece)}
                          onChange={(event) =>
                            setEditedKeys((previous) => ({
                              ...previous,
                              [piece.pieceIndex]: event.target.value,
                            }))
                          }
                          aria-label={`Key for piece ${piece.pieceIndex}`}
                          className="h-7 flex-1 text-sm"
                        />
                      </label>
                    )}
                    <span className="text-xs text-muted-foreground break-words line-clamp-2">
                      {piece.excerpt}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {pieceCount === 1 && !previewError && (
              <p className="text-sm text-muted-foreground">1 piece — nothing to split.</p>
            )}
            {pieceCount > MANY_PIECES_THRESHOLD && (
              <p className="text-sm text-amber-600 dark:text-amber-500">
                This will create {pieceCount - 1} new fragments ({pieceCount} total).
              </p>
            )}
            {keyError && <p className="text-sm text-destructive">{keyError}</p>}
            {splitError && <p className="text-sm text-destructive">{splitError}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canConfirm} onClick={() => void handleConfirm()}>
            {isPending ? "Splitting…" : "Split"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

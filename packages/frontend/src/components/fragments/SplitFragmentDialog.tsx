import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePreviewSplitFragment,
  useSplitFragment,
  getListFragmentsQueryKey,
  getListFragmentSummariesQueryKey,
} from "@api/generated/fragments/fragments";
import { getListSequencesQueryKey } from "@api/generated/sequences/sequences";
import { useInvalidateActionLog } from "@api/action-log";
import type { SplitDelimiter, SplitPiecePreview } from "@api/generated/maskorAPI.schemas";
import { Button } from "@components/ui/button";
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

// Above this, an aggressive (usually blank-line) split is flagged so the user
// confirms it deliberately — never blocked, just a heads-up. See the spec.
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

  const [delimiterType, setDelimiterType] = useState<DelimiterType>("heading");
  const [headingLevel, setHeadingLevel] = useState<HeadingLevel>(1);
  const [pieces, setPieces] = useState<SplitPiecePreview[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);

  const delimiter = useMemo<SplitDelimiter>(
    () =>
      delimiterType === "heading"
        ? { type: "heading", level: headingLevel }
        : { type: delimiterType },
    [delimiterType, headingLevel],
  );

  const previewSplit = usePreviewSplitFragment();
  const splitFragment = useSplitFragment();
  const { mutateAsync: previewMutateAsync } = previewSplit;

  // Live preview: recompute whenever the dialog opens or the delimiter changes.
  // A monotonic token discards out-of-order responses from rapid delimiter
  // toggles. The endpoint is in-memory and cheap, so no debounce is needed.
  useEffect(() => {
    if (!open) {
      setPieces([]);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await previewMutateAsync({ projectId, data: { fragmentId, delimiter } });
        if (cancelled) return;
        // customFetch throws on non-2xx, so a resolved response is always 200;
        // the status check narrows the generated response union for the compiler.
        setPieces(response.status === 200 ? response.data.pieces : []);
        setPreviewError(null);
      } catch {
        if (cancelled) return;
        setPieces([]);
        setPreviewError("Couldn't compute the preview.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, fragmentId, delimiter, previewMutateAsync]);

  const pieceCount = pieces.length;
  const isPending = splitFragment.isPending;
  const canConfirm = pieceCount > 1 && !isPending;

  // Dialog-internal confirmation (a form submit inside an open modal): runs the
  // mutation directly and surfaces failures in-place, like the other modals —
  // not through the command system.
  const handleConfirm = useCallback(async () => {
    setSplitError(null);
    try {
      await splitFragment.mutateAsync({ projectId, data: { fragmentId, delimiter } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListFragmentsQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: getListFragmentSummariesQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: getListSequencesQueryKey(projectId) }),
      ]);
      invalidateActionLog();
      onOpenChange(false);
      onSplit?.();
    } catch {
      setSplitError("Split failed. Try again.");
    }
  }, [
    splitFragment,
    projectId,
    fragmentId,
    delimiter,
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
            piece; the rest become new fragments inheriting its aspects and references.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Select
              value={delimiterType}
              onValueChange={(value) => setDelimiterType(value as DelimiterType)}
            >
              <SelectTrigger size="sm" className="w-56">
                <SelectValue placeholder="Delimiter" />
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
                onValueChange={(value) => setHeadingLevel(Number(value) as HeadingLevel)}
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

          <div className="flex flex-col gap-2">
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
                    className="flex flex-col rounded-md border border-border/50 px-3 py-2"
                  >
                    <span className="text-sm font-medium tabular-nums">
                      {piece.pieceIndex}. {piece.key}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{piece.excerpt}</span>
                  </li>
                ))}
              </ol>
            )}

            {pieceCount === 1 && !previewError && (
              <p className="text-sm text-muted-foreground">1 piece — nothing to split.</p>
            )}
            {pieceCount > MANY_PIECES_THRESHOLD && (
              <p className="text-sm text-amber-600 dark:text-amber-500">
                This will create {pieceCount - 1} new fragments.
              </p>
            )}
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

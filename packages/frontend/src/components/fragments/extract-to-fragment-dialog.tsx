import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useListFragments, useExtractFragment } from "@api/generated/fragments/fragments";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";
import { findSmallestUnusedSuffix, validateExtractKey } from "./extract-utils";

const PREVIEW_MAX_LENGTH = 200;

const truncatePreview = (text: string) =>
  text.length > PREVIEW_MAX_LENGTH ? text.slice(0, PREVIEW_MAX_LENGTH) + "…" : text;

type Props = {
  open: boolean;
  projectId: string;
  sourceFragmentUuid: string;
  selectionText: string;
  onClose: () => void;
  onSuccess: (newFragmentUuid: string) => void;
};

export const ExtractToFragmentDialog = ({
  open,
  projectId,
  sourceFragmentUuid,
  selectionText,
  onClose,
  onSuccess,
}: Props) => {
  const keyId = useId();

  const { data: fragmentsEnvelope } = useListFragments(projectId);
  const { mutateAsync: extractFragment, isPending } = useExtractFragment();

  const [keyValue, setKeyValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  const fragments = useMemo(
    () => (fragmentsEnvelope?.status === 200 ? fragmentsEnvelope.data : []),
    [fragmentsEnvelope],
  );

  const { allKeys, discardedKeys } = useMemo(() => {
    const all = new Set<string>();
    const discarded = new Set<string>();
    for (const fragment of fragments) {
      all.add(fragment.key);
      if (fragment.isDiscarded) discarded.add(fragment.key);
    }
    return { allKeys: all, discardedKeys: discarded };
  }, [fragments]);

  const preFill = useMemo(() => {
    const n = findSmallestUnusedSuffix(allKeys);
    return `unnamed-fragment-${n}`;
  }, [allKeys]);

  // Reset key to pre-fill and select it whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setKeyValue(preFill);
    setError(null);
    // Defer to let the dialog mount and focus-trap settle.
    const timer = setTimeout(() => {
      const input = keyInputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [open, preFill]);

  // Live validation as user types.
  useEffect(() => {
    if (!open) return;
    const validationError = validateExtractKey(keyValue, allKeys, discardedKeys);
    setError(validationError);
  }, [keyValue, allKeys, discardedKeys, open]);

  const isConfirmDisabled = isPending || error !== null || keyValue.trim().length === 0;

  const handleConfirm = async () => {
    const trimmedKey = keyValue.trim();
    const validationError = validateExtractKey(trimmedKey, allKeys, discardedKeys);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const result = await extractFragment({
        projectId,
        data: {
          key: trimmedKey,
          content: selectionText,
          sourceFragmentUuid,
          sourceMode: "keep",
          navigated: true,
        },
      });

      if (result.status === 201) {
        onSuccess(result.data.uuid);
      } else {
        const message =
          (result.data as { message?: string }).message ?? "Extraction failed. Try again.";
        setError(message);
      }
    } catch {
      setError("Extraction failed. Try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Extract to fragment</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {selectionText && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground mb-1">Selection</p>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap font-mono leading-snug">
                {truncatePreview(selectionText)}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={keyId}>Key</Label>
            <Input
              id={keyId}
              ref={keyInputRef}
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isConfirmDisabled) void handleConfirm();
                if (e.key === "Escape") onClose();
              }}
              disabled={isPending}
              aria-describedby={error ? `${keyId}-error` : undefined}
            />
            {error && (
              <p id={`${keyId}-error`} className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={isConfirmDisabled}>
            {isPending ? "Creating…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

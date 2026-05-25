import { useEffect, useId, useMemo, useRef, useState } from "react";
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
import { findSmallestUnusedSuffix } from "./extract-utils";

const PREVIEW_MAX_LENGTH = 200;

const truncatePreview = (text: string) =>
  text.length > PREVIEW_MAX_LENGTH ? text.slice(0, PREVIEW_MAX_LENGTH) + "…" : text;

type Props = {
  open: boolean;
  title: string;
  selectionText: string;
  preFillPrefix: string;
  allKeys: Set<string>;
  validateKey: (key: string) => string | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (key: string) => Promise<string | null>;
};

export const ExtractToEntityDialogCore = ({
  open,
  title,
  selectionText,
  preFillPrefix,
  allKeys,
  validateKey,
  isPending,
  onClose,
  onConfirm,
}: Props) => {
  const keyId = useId();

  const [keyValue, setKeyValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  const preFill = useMemo(() => {
    const n = findSmallestUnusedSuffix(allKeys, preFillPrefix);
    return `${preFillPrefix}-${n}`;
  }, [allKeys, preFillPrefix]);

  useEffect(() => {
    if (!open) return;
    setKeyValue(preFill);
    setError(null);
    const timer = setTimeout(() => {
      const input = keyInputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [open, preFill]);

  useEffect(() => {
    if (!open) return;
    setError(validateKey(keyValue));
  }, [keyValue, validateKey, open]);

  const isConfirmDisabled = isPending || error !== null || keyValue.trim().length === 0;

  const handleConfirm = async () => {
    const trimmedKey = keyValue.trim();
    const validationError = validateKey(trimmedKey);
    if (validationError) {
      setError(validationError);
      return;
    }
    const serverError = await onConfirm(trimmedKey);
    if (serverError !== null) {
      setError(serverError);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent showCloseButton={false} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
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

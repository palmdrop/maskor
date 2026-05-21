import { useEffect } from "react";
import { Button } from "@components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";

const PREVIEW_MAX_LENGTH = 200;

const truncatePreview = (text: string) =>
  text.length > PREVIEW_MAX_LENGTH ? text.slice(0, PREVIEW_MAX_LENGTH) + "…" : text;

export type InsertDirection = "append" | "prepend";
export type InsertSourceMode = "keep" | "cut";
export type InsertNextMode = "switch" | "stay";

type TargetEntityType = "fragment" | "note" | "reference" | "aspect";

type Props = {
  open: boolean;
  direction: InsertDirection;
  targetType: TargetEntityType;
  targetKey: string;
  selectionText: string;
  sourceMode: InsertSourceMode;
  nextMode: InsertNextMode;
  isPending: boolean;
  onSourceModeChange: (mode: InsertSourceMode) => void;
  onNextModeChange: (mode: InsertNextMode) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export const AppendOrPrependDialog = ({
  open,
  direction,
  targetType,
  targetKey,
  selectionText,
  sourceMode,
  nextMode,
  isPending,
  onSourceModeChange,
  onNextModeChange,
  onClose,
  onConfirm,
}: Props) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const directionLabel = direction === "append" ? "Append" : "Prepend";
  const title = `${directionLabel} to ${targetType}: ${targetKey}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent showCloseButton={false}>
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
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">Source</p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={sourceMode === "keep" ? "default" : "outline"}
                  onClick={() => onSourceModeChange("keep")}
                  disabled={isPending}
                >
                  Keep
                </Button>
                <Button
                  size="sm"
                  variant={sourceMode === "cut" ? "default" : "outline"}
                  onClick={() => onSourceModeChange("cut")}
                  disabled={isPending}
                >
                  Cut
                </Button>
                <Button size="sm" variant="outline" disabled title="Link mode is not yet available">
                  Link
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">After confirm</p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={nextMode === "switch" ? "default" : "outline"}
                  onClick={() => onNextModeChange("switch")}
                  disabled={isPending}
                >
                  Switch
                </Button>
                <Button
                  size="sm"
                  variant={nextMode === "stay" ? "default" : "outline"}
                  onClick={() => onNextModeChange("stay")}
                  disabled={isPending}
                >
                  Stay
                </Button>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isPending || !selectionText.trim()}>
            {isPending ? "Inserting…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

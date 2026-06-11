import { cn } from "@/lib/utils";

type InlineConfirmActionsProps = {
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
};

// The inline confirm/cancel button pair used by the Overview's in-place delete
// confirmations (section delete, sequence delete). Solid destructive + muted
// pills; kept as bespoke buttons rather than <Button> because they are shorter
// (py-0.5) than any Button size and use a bespoke hover treatment.
export const InlineConfirmActions = ({
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  className,
}: InlineConfirmActionsProps) => (
  <div className={cn("flex gap-1", className)}>
    <button
      type="button"
      onClick={onConfirm}
      className="text-xs px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
    >
      {confirmLabel}
    </button>
    <button
      type="button"
      onClick={onCancel}
      className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted/80 transition-colors"
    >
      {cancelLabel}
    </button>
  </div>
);

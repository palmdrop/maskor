import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field } from "./ui/field";
import { Textarea } from "./ui/textarea";
import { BusyButton } from "./ui/busy-button";
import { FieldError } from "./ui/field-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

// Sentinel for the "don't place in any sequence" option — radix Select item values
// must be non-empty, so the absence of a sequence is modelled explicitly.
const NO_SEQUENCE = "none";

type CreateEntityDialogProps = {
  triggerLabel: string;
  dialogTitle: string;
  entityName: string;
  labelField?: string;
  contentRequired?: boolean;
  isPending: boolean;
  // The third argument carries the chosen sequence (undefined = none / picker not
  // shown). Callers that don't render the picker can ignore it.
  onCreate: (label: string, content: string, sequenceId?: string) => Promise<void>;
  // When provided (and non-empty), the dialog shows an "Add to sequence" picker.
  // Used for fragments; notes/references omit it.
  sequenceOptions?: ReadonlyArray<{ uuid: string; name: string }>;
  // Pre-selected sequence when the picker opens (e.g. the list's current sort
  // sequence). `null`/absent → "None".
  defaultSequenceId?: string | null;
};

export const CreateEntityDialog = ({
  triggerLabel,
  dialogTitle,
  entityName,
  labelField = "Key",
  contentRequired = false,
  isPending,
  onCreate,
  sequenceOptions,
  defaultSequenceId,
}: CreateEntityDialogProps) => {
  const [open, setOpen] = useState(false);
  const [labelValue, setLabelValue] = useState("");
  const [contentValue, setContentValue] = useState("");
  const [sequenceId, setSequenceId] = useState<string>(defaultSequenceId ?? NO_SEQUENCE);
  const [error, setError] = useState<string | null>(null);

  const showSequencePicker = !!sequenceOptions && sequenceOptions.length > 0;

  const handleOpenChange = (next: boolean) => {
    if (next) {
      // Seed the picker from the current default each time the dialog opens, so a
      // change in the list's sort sequence is reflected.
      setSequenceId(defaultSequenceId ?? NO_SEQUENCE);
    } else {
      setLabelValue("");
      setContentValue("");
      setError(null);
    }
    setOpen(next);
  };

  const handleCreate = async () => {
    const trimmedLabel = labelValue.trim();
    if (!trimmedLabel) {
      setError(`${labelField} is required.`);
      return;
    }
    if (contentRequired && !contentValue) {
      setError("Content is required.");
      return;
    }
    setError(null);
    try {
      await onCreate(
        trimmedLabel,
        contentValue,
        showSequencePicker && sequenceId !== NO_SEQUENCE ? sequenceId : undefined,
      );
      setOpen(false);
      setLabelValue("");
      setContentValue("");
    } catch (caught) {
      setError((caught as { message?: string })?.message ?? `Failed to create ${entityName}.`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="self-start">
          <PlusIcon />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label={labelField}>
            {(control) => (
              <Input
                {...control}
                value={labelValue}
                onChange={(e) => setLabelValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            )}
          </Field>
          <Field label={contentRequired ? "Content" : "Content (optional)"}>
            {(control) => (
              <Textarea
                {...control}
                rows={contentRequired ? 6 : 4}
                value={contentValue}
                onChange={(e) => setContentValue(e.target.value)}
              />
            )}
          </Field>
          {showSequencePicker && (
            <Field label="Add to sequence (optional)">
              {(control) => (
                <Select value={sequenceId} onValueChange={setSequenceId}>
                  <SelectTrigger {...control} size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SEQUENCE}>None</SelectItem>
                    {sequenceOptions!.map((sequence) => (
                      <SelectItem key={sequence.uuid} value={sequence.uuid}>
                        {sequence.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          )}
          <FieldError>{error}</FieldError>
        </div>
        <DialogFooter>
          <BusyButton onClick={handleCreate} isPending={isPending}>
            Create
          </BusyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

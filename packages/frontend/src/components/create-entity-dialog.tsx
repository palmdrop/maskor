import { useId, useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { FieldError } from "./ui/field-error";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

type CreateEntityDialogProps = {
  triggerLabel: string;
  dialogTitle: string;
  entityName: string;
  labelField?: string;
  contentRequired?: boolean;
  isPending: boolean;
  onCreate: (label: string, content: string) => Promise<void>;
};

export const CreateEntityDialog = ({
  triggerLabel,
  dialogTitle,
  entityName,
  labelField = "Key",
  contentRequired = false,
  isPending,
  onCreate,
}: CreateEntityDialogProps) => {
  const [open, setOpen] = useState(false);
  const [labelValue, setLabelValue] = useState("");
  const [contentValue, setContentValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const labelId = useId();
  const contentId = useId();

  const handleOpenChange = (next: boolean) => {
    if (!next) {
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
      await onCreate(trimmedLabel, contentValue);
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={labelId}>{labelField}</Label>
            <Input
              id={labelId}
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={contentId}>{contentRequired ? "Content" : "Content (optional)"}</Label>
            <Textarea
              id={contentId}
              rows={contentRequired ? 6 : 4}
              value={contentValue}
              onChange={(e) => setContentValue(e.target.value)}
            />
          </div>
          <FieldError>{error}</FieldError>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

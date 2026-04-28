import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { PenLineIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

type Item = { uuid: string; label: string; editTo?: string };

type AttachableEntityPanelProps = {
  items: Item[];
  isLoading: boolean;
  labelField: string;
  dialogTitle: string;
  onConfirmCreate: (label: string, content: string) => Promise<void>;
  onDelete: (uuid: string) => Promise<void>;
  isCreating: boolean;
};

export const AttachableEntityPanel = ({
  items,
  isLoading,
  labelField,
  dialogTitle,
  onConfirmCreate,
  onDelete,
  isCreating,
}: AttachableEntityPanelProps) => {
  const [open, setOpen] = useState(false);
  const [labelValue, setLabelValue] = useState("");
  const [contentValue, setContentValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmed = labelValue.trim();
    if (!trimmed) {
      setError(`${labelField} is required.`);
      return;
    }
    setError(null);
    try {
      await onConfirmCreate(trimmed, contentValue);
      setOpen(false);
      setLabelValue("");
      setContentValue("");
    } catch {
      setError("Failed to create.");
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setLabelValue("");
      setContentValue("");
      setError(null);
    }
    setOpen(next);
  };

  return (
    <div className="flex flex-col gap-4 pt-4 max-w-lg">
      <div className="flex items-center justify-between">
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <PlusIcon />
              {dialogTitle}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dialogTitle}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entity-label">{labelField}</Label>
                <Input
                  id="entity-label"
                  value={labelValue}
                  onChange={(e) => setLabelValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entity-content">Content (optional)</Label>
                <textarea
                  id="entity-content"
                  rows={4}
                  value={contentValue}
                  onChange={(e) => setContentValue(e.target.value)}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={isCreating}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li
              key={item.uuid}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/40"
            >
              <span>{item.label}</span>
              <div className="flex items-center gap-1">
                {item.editTo && (
                  <Link to={item.editTo}>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.label}`}>
                      <PenLineIcon />
                    </Button>
                  </Link>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onDelete(item.uuid)}
                  aria-label={`Delete ${item.label}`}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

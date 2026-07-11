import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useGenerateSequence, getListSequencesQueryKey } from "@api/generated/sequences/sequences";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { ApiRequestError } from "@api/errors";
import { Button } from "@components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";

type CycleConflict = { sequenceUuids: string[]; fragmentUuids: string[] };

interface ShuffleSequenceDialogProps {
  projectId: string;
  // Every sequence in the project — used to derive constraint candidates,
  // resolve names for conflict reporting, and detect the newly-created sequence.
  sequences: Sequence[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called with the new sequence's uuid after a successful shuffle.
  onGenerated: (sequenceUuid: string) => void;
}

export const ShuffleSequenceDialog = ({
  projectId,
  sequences,
  open,
  onOpenChange,
  onGenerated,
}: ShuffleSequenceDialogProps) => {
  const queryClient = useQueryClient();

  // Only non-main sequences can constrain the shuffle.
  const candidates = useMemo(() => sequences.filter((sequence) => !sequence.isMain), [sequences]);
  const nameByUuid = useMemo(
    () => new Map(sequences.map((sequence) => [sequence.uuid, sequence.name])),
    [sequences],
  );
  const existingUuids = useMemo(
    () => new Set(sequences.map((sequence) => sequence.uuid)),
    [sequences],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [conflict, setConflict] = useState<CycleConflict[] | null>(null);

  // Each time the dialog opens, default the selection to the active secondaries
  // (the sequencer's current constraint set) and clear any prior conflict. The
  // selection is ephemeral — it never mutates the stored `active` flags.
  useEffect(() => {
    if (open) {
      setSelected(
        new Set(candidates.filter((sequence) => sequence.active).map((sequence) => sequence.uuid)),
      );
      setConflict(null);
    }
  }, [open, candidates]);

  const generate = useGenerateSequence();

  const toggle = (uuid: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
    setConflict(null);
  };

  const handleGenerate = async () => {
    setConflict(null);
    try {
      const response = await generate.mutateAsync({
        projectId,
        data: { constraintSequenceIds: [...selected] },
      });
      if (response.status !== 201) return;
      void queryClient.invalidateQueries({ queryKey: getListSequencesQueryKey(projectId) });
      const created = response.data.sequences.find((sequence) => !existingUuids.has(sequence.uuid));
      onOpenChange(false);
      if (created) onGenerated(created.uuid);
    } catch (error) {
      // A contradictory constraint set is reported inline so the user can fix the
      // selection; nothing was created.
      if (error instanceof ApiRequestError && error.body.reason === "constraint_cycle") {
        setConflict(error.body.cycles ?? []);
        return;
      }
      toast.error("Failed to generate sequence.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Shuffle into a new sequence</DialogTitle>
          <DialogDescription>
            Randomly arranges all fragments into a new sequence, honoring the order of the
            constraint sequences you choose.
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No secondary sequences to constrain the shuffle — fragments will be arranged freely.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {candidates.map((sequence) => (
              <li key={sequence.uuid}>
                <label className="flex items-center gap-2 text-sm px-1 py-1 rounded hover:bg-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(sequence.uuid)}
                    onChange={() => toggle(sequence.uuid)}
                  />
                  <span className="truncate">{sequence.name}</span>
                  {!sequence.active && (
                    <span className="text-xs text-muted-foreground">(inactive)</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}

        {conflict && (
          <div className="text-sm text-destructive rounded border border-destructive/40 bg-destructive/10 p-2">
            <p className="font-medium">The chosen constraints contradict each other.</p>
            <p className="text-xs mt-1">
              These sequences disagree on fragment order — deselect one, or fix its order:
            </p>
            <ul className="list-disc pl-4 mt-1 text-xs">
              {conflict.map((cycle, index) => (
                <li key={index}>
                  {cycle.sequenceUuids.map((uuid) => nameByUuid.get(uuid) ?? uuid).join(" ↔ ")}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={generate.isPending}>
            {generate.isPending ? "Shuffling…" : "Shuffle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

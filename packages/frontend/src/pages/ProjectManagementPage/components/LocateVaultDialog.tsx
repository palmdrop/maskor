import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FolderPicker } from "@components/FolderPicker";
import {
  useUpdateProjectVaultPath,
  getListProjectsQueryKey,
} from "@api/generated/projects/projects";
import { ApiRequestError } from "@api/errors";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";
import { Button } from "@components/ui/button";

type Step = "picker" | "uuid-conflict";

type LocateVaultDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
};

export const LocateVaultDialog = ({ open, onOpenChange, projectId }: LocateVaultDialogProps) => {
  const [step, setStep] = useState<Step>("picker");
  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStep("picker");
      setPickedPath(null);
      mutation.reset();
    }
    onOpenChange(nextOpen);
  };

  const mutation = useUpdateProjectVaultPath({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        handleOpenChange(false);
      },
      onError: (error) => {
        if (error instanceof ApiRequestError && error.body.error === "UUID_CONFLICT") {
          setStep("uuid-conflict");
        }
      },
    },
  });

  const handlePick = (path: string) => {
    mutation.reset();
    setPickedPath(path);
    mutation.mutate({ projectId, data: { newPath: path } });
  };

  const handleForceOverride = () => {
    if (!pickedPath) return;
    mutation.mutate({ projectId, data: { newPath: pickedPath, forceOverride: true } });
  };

  const handleBack = () => {
    mutation.reset();
    setStep("picker");
  };

  const isUUIDConflictError =
    mutation.error instanceof ApiRequestError && mutation.error.body.error === "UUID_CONFLICT";

  const pickerError =
    step === "picker" && mutation.isError && !isUUIDConflictError
      ? (mutation.error?.message ?? null)
      : null;

  const overrideError =
    step === "uuid-conflict" && mutation.isError && !isUUIDConflictError
      ? (mutation.error?.message ?? null)
      : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "picker" ? "Locate vault folder" : "Different project found"}
          </DialogTitle>
        </DialogHeader>

        {step === "picker" && (
          <div className="flex flex-col gap-3">
            <FolderPicker onSelect={handlePick} />
            {mutation.isPending && (
              <p className="text-xs text-muted-foreground">Checking folder…</p>
            )}
            {pickerError && <p className="text-xs text-destructive">{pickerError}</p>}
          </div>
        )}

        {step === "uuid-conflict" && pickedPath && (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              This folder belongs to a different Maskor project. Re-point anyway?
            </p>
            <p className="break-all font-mono text-xs text-muted-foreground">{pickedPath}</p>
            {overrideError && <p className="text-xs text-destructive">{overrideError}</p>}
          </div>
        )}

        {step === "uuid-conflict" && (
          <DialogFooter>
            <Button variant="outline" onClick={handleBack} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleForceOverride}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Re-pointing…" : "Re-point anyway"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

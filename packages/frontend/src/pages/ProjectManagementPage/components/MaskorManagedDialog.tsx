import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFsList } from "@api/fs";
import { useSettings } from "@api/settings";
import { customFetch } from "@api/fetch";
import { getListProjectsQueryKey } from "@api/generated/projects/projects";
import type { Project } from "@api/generated/maskorAPI.schemas";
import { deriveSlug, resolveSlug } from "@/utils/slug";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";

type MaskorManagedDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const MaskorManagedDialog = ({ open, onOpenChange }: MaskorManagedDialogProps) => {
  const [step, setStep] = useState<"name" | "confirm">("name");
  const [nameInput, setNameInput] = useState("");

  const settingsQuery = useSettings();
  const managedRoot = settingsQuery.data?.data.maskorManagedRoot ?? null;

  const managedRootList = useFsList(managedRoot);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (body: { name: string; vaultPath: string; mode: "create" }) =>
      customFetch<{ data: Project; status: 201; headers: Headers }>("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      setStep("name");
      setNameInput("");
      onOpenChange(false);
    },
  });

  const existingDirNames = new Set(
    (managedRootList.data?.data.entries ?? [])
      .filter((entry) => entry.kind === "directory")
      .map((entry) => entry.name),
  );

  const slug = deriveSlug(nameInput);
  const resolvedSlug = resolveSlug(slug, existingDirNames);
  const resolvedPath = managedRoot ? `${managedRoot}/${resolvedSlug}` : null;

  const handleNext = () => {
    if (!nameInput.trim()) return;
    mutation.reset();
    setStep("confirm");
  };

  const handleBack = () => {
    mutation.reset();
    setStep("name");
  };

  const handleSubmit = () => {
    if (!resolvedPath || !nameInput.trim()) return;
    mutation.mutate({ name: nameInput.trim(), vaultPath: resolvedPath, mode: "create" });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStep("name");
      setNameInput("");
      mutation.reset();
    }
    onOpenChange(nextOpen);
  };

  const mutationErrorMessage = mutation.error?.message ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "name" ? "Create a Maskor-managed project" : "Confirm project creation"}
          </DialogTitle>
        </DialogHeader>

        {step === "name" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maskor-managed-name">Project name</Label>
              <Input
                id="maskor-managed-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNext();
                }}
                placeholder="My novel"
                autoFocus
              />
            </div>
            {managedRoot && nameInput.trim() && (
              <p className="text-xs text-muted-foreground">
                Will be created at{" "}
                <span className="font-mono">
                  {managedRoot}/{resolvedSlug}
                </span>
              </p>
            )}
          </div>
        )}

        {step === "confirm" && resolvedPath && (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              Project will be created at{" "}
              <span className="break-all font-mono">{resolvedPath}</span>
            </p>
            {mutationErrorMessage && (
              <p className="text-xs text-destructive">{mutationErrorMessage}</p>
            )}
          </div>
        )}

        {step === "name" && (
          <DialogFooter>
            <Button
              onClick={handleNext}
              disabled={!nameInput.trim() || settingsQuery.isPending}
            >
              Next
            </Button>
          </DialogFooter>
        )}

        {step === "confirm" && (
          <DialogFooter>
            <Button variant="outline" onClick={handleBack} disabled={mutation.isPending}>
              Back
            </Button>
            <Button onClick={handleSubmit} disabled={!resolvedPath || mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

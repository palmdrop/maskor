import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderPicker } from "@components/FolderPicker";
import { useFsList } from "@api/fs";
import type { FsEntry } from "@api/fs";
import { customFetch } from "@api/fetch";
import { getListProjectsQueryKey } from "@api/generated/projects/projects";
import type { Project } from "@api/generated/maskorAPI.schemas";
import { ApiRequestError } from "@api/errors";
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

type FolderKind = "maskor-project" | "obsidian-vault" | "writing-folder" | "empty" | "other";

const FOLDER_KIND_LABELS: Record<FolderKind, string> = {
  "maskor-project": "Maskor project",
  "obsidian-vault": "Obsidian vault",
  "writing-folder": "Writing folder",
  empty: "Empty folder",
  other: "Other",
};

const isMarkdown = (name: string) => name.endsWith(".md") || name.endsWith(".markdown");

const detectFolderKind = (entries: FsEntry[]): FolderKind => {
  if (entries.some((entry) => entry.name === ".maskor" && entry.kind === "directory")) {
    return "maskor-project";
  }
  if (entries.some((entry) => entry.name === ".obsidian" && entry.kind === "directory")) {
    return "obsidian-vault";
  }
  if (entries.length === 0) return "empty";
  if (entries.some((entry) => entry.kind === "file" && isMarkdown(entry.name))) {
    return "writing-folder";
  }
  return "other";
};

const countNonMarkdownFiles = (entries: FsEntry[]): number =>
  entries.filter((entry) => entry.kind === "file" && !isMarkdown(entry.name)).length;

type CreateProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const CreateProjectDialog = ({ open, onOpenChange }: CreateProjectDialogProps) => {
  const [step, setStep] = useState<"picker" | "confirm">("picker");
  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  const listQuery = useFsList(pickedPath);
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
      setStep("picker");
      setPickedPath(null);
      setNameInput("");
      onOpenChange(false);
    },
  });

  const handlePick = (path: string) => {
    mutation.reset();
    setPickedPath(path);
    setNameInput(path.split("/").filter(Boolean).at(-1) ?? path);
    setStep("confirm");
  };

  const handleBack = () => {
    mutation.reset();
    setStep("picker");
  };

  const handleSubmit = () => {
    if (!pickedPath || !nameInput.trim()) return;
    mutation.mutate({ name: nameInput.trim(), vaultPath: pickedPath, mode: "create" });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStep("picker");
      setPickedPath(null);
      setNameInput("");
      mutation.reset();
    }
    onOpenChange(nextOpen);
  };

  const pathDoesNotExist =
    listQuery.isError &&
    listQuery.error instanceof ApiRequestError &&
    listQuery.error.statusCode === 404;

  const entries = pathDoesNotExist ? [] : (listQuery.data?.data.entries ?? []);
  const folderKind = detectFolderKind(entries);
  const nonMarkdownCount = countNonMarkdownFiles(entries);
  const showFolderKind = !pathDoesNotExist && listQuery.data !== undefined;
  const mutationErrorMessage = mutation.error?.message ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "picker" ? "Choose a location for the new project" : "Confirm project creation"}
          </DialogTitle>
        </DialogHeader>

        {step === "picker" && <FolderPicker onSelect={handlePick} allowNonExistent={true} />}

        {step === "confirm" && pickedPath && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-project-name">Project name</Label>
              <Input
                id="create-project-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Project name"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Location</p>
              <p className="break-all font-mono text-sm">{pickedPath}</p>
            </div>

            {pathDoesNotExist && (
              <p className="text-xs text-muted-foreground">
                This folder does not exist yet — Maskor will create it.
              </p>
            )}

            {showFolderKind && (
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-muted-foreground">Detected kind</p>
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                  {FOLDER_KIND_LABELS[folderKind]}
                </span>
              </div>
            )}

            {nonMarkdownCount > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                This folder contains {nonMarkdownCount} non-markdown{" "}
                {nonMarkdownCount === 1 ? "file" : "files"}.
              </p>
            )}

            {mutationErrorMessage && (
              <p className="text-xs text-destructive">{mutationErrorMessage}</p>
            )}
          </div>
        )}

        {step === "confirm" && (
          <DialogFooter>
            <Button variant="outline" onClick={handleBack} disabled={mutation.isPending}>
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!nameInput.trim() || mutation.isPending}
            >
              {mutation.isPending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

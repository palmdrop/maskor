import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateProject, getListProjectsQueryKey } from "@api/generated/projects/projects";
import { useSettings } from "@api/settings";
import { useFsList } from "@api/fs";
import { ApiRequestError } from "@api/errors";
import { FolderPicker } from "@components/FolderPicker";
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
import { detectFolderKind, countNonMarkdownFiles, FOLDER_KIND_LABELS } from "../utils/folder-kind";
import { deriveSlug } from "@/utils/slug";

type RegisterProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const RegisterProjectDialog = ({ open, onOpenChange }: RegisterProjectDialogProps) => {
  const [nameInput, setNameInput] = useState("");
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);

  const queryClient = useQueryClient();
  const settingsQuery = useSettings();
  const managedRoot =
    settingsQuery.data?.status === 200 ? settingsQuery.data.data.maskorManagedRoot : null;

  const folderListQuery = useFsList(folderPath);
  const pathDoesNotExist =
    folderListQuery.isError &&
    folderListQuery.error instanceof ApiRequestError &&
    folderListQuery.error.statusCode === 404;

  // Narrow the discriminated response union to FsListResponse — error cases
  // are already surfaced via `pathDoesNotExist`/error-instance checks above.
  const entries =
    pathDoesNotExist || folderPath === null
      ? []
      : folderListQuery.data?.status === 200
        ? folderListQuery.data.data.entries
        : [];
  const folderKind = detectFolderKind(entries);
  const nonMarkdownCount = countNonMarkdownFiles(entries);
  const showFolderInfo =
    folderPath !== null && !pathDoesNotExist && folderListQuery.data !== undefined;

  const pathSep = managedRoot?.includes("\\") ? "\\" : "/";
  const managedRootPreview =
    managedRoot && nameInput.trim() ? `${managedRoot}${pathSep}${deriveSlug(nameInput)}` : null;

  const mutation = useCreateProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        handleReset();
        onOpenChange(false);
      },
    },
  });

  const handleFolderPick = (path: string) => {
    setFolderPath(path);
    setFolderPickerOpen(false);
    if (!nameManuallyEdited) {
      const basename =
        path
          .replace(/[/\\]$/, "")
          .split(/[/\\]/)
          .at(-1) ?? "";
      if (basename) setNameInput(basename);
    }
  };

  const handleClearFolder = () => {
    setFolderPath(null);
  };

  const handleSubmit = () => {
    if (!nameInput.trim()) return;

    if (folderPath === null) {
      // No folder picked → backend uses managed root + slug derivation
      mutation.mutate({ data: { name: nameInput.trim(), mode: "create" } });
    } else if (pathDoesNotExist) {
      // Folder picked but doesn't exist → create at specified path
      mutation.mutate({ data: { name: nameInput.trim(), vaultPath: folderPath, mode: "create" } });
    } else {
      // Folder exists → adopt
      mutation.mutate({ data: { name: nameInput.trim(), vaultPath: folderPath, mode: "adopt" } });
    }
  };

  const handleReset = () => {
    setNameInput("");
    setNameManuallyEdited(false);
    setFolderPath(null);
    setFolderPickerOpen(false);
    mutation.reset();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) handleReset();
    onOpenChange(nextOpen);
  };

  const canSubmit = nameInput.trim().length > 0 && !mutation.isPending;

  return (
    <>
      <Dialog open={folderPickerOpen} onOpenChange={setFolderPickerOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose a folder</DialogTitle>
          </DialogHeader>
          <FolderPicker onSelect={handleFolderPick} allowNonExistent={true} />
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Register project</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="register-project-name">Project name</Label>
              <Input
                id="register-project-name"
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  setNameManuallyEdited(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                placeholder="My novel"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>
                Folder <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              {folderPath ? (
                <div className="flex items-start gap-2">
                  <p className="flex-1 break-all rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-sm">
                    {folderPath}
                  </p>
                  <Button type="button" variant="ghost" size="sm" onClick={handleClearFolder}>
                    Clear
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => setFolderPickerOpen(true)}
                >
                  Browse…
                </Button>
              )}
            </div>

            {folderPath === null && managedRootPreview && (
              <p className="text-xs text-muted-foreground">
                Will be created at <span className="font-mono">{managedRootPreview}</span> (exact
                name resolved on save)
              </p>
            )}

            {folderPath === null && !managedRoot && nameInput.trim() && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                No managed root configured. Set one in Settings, or pick a folder above.
              </p>
            )}

            {folderPath !== null && pathDoesNotExist && (
              <p className="text-xs text-muted-foreground">
                This folder does not exist yet — Maskor will create it.
              </p>
            )}

            {showFolderInfo && (
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-muted-foreground">Detected kind</p>
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                  {FOLDER_KIND_LABELS[folderKind]}
                </span>
              </div>
            )}

            {nonMarkdownCount > 0 && showFolderInfo && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                This folder contains {nonMarkdownCount} non-markdown{" "}
                {nonMarkdownCount === 1 ? "file" : "files"}.
              </p>
            )}

            {mutation.error && <p className="text-xs text-destructive">{mutation.error.message}</p>}
          </div>

          <DialogFooter>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {mutation.isPending ? "Registering…" : "Register project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

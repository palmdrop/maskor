import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateProject,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
} from "../../../api/generated/projects/projects";
import type { Project } from "../../../api/generated/maskorAPI.schemas";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Switch } from "../../../components/ui/switch";
import { Button } from "../../../components/ui/button";
import { useRebuildIndex } from "../../../api/generated/index";

export const GeneralTab = ({ project }: { project: Project }) => {
  const queryClient = useQueryClient();
  const updateProject = useUpdateProject();
  const rebuildIndex = useRebuildIndex();

  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const invalidateProject = () => {
    queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(project.projectUUID) });
    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
  };

  const handleSave = async () => {
    if (updateProject.isPending) return;
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === project.name) {
      setNameValue(project.name);
      setEditing(false);
      return;
    }
    setError(null);
    try {
      const result = await updateProject.mutateAsync({
        projectId: project.projectUUID,
        data: { name: trimmed },
      });
      if (result.status === 200) {
        invalidateProject();
        setEditing(false);
      } else {
        setError(
          "name" in result.data
            ? ((result.data as { message?: string }).message ?? "Update failed.")
            : "Update failed.",
        );
        setNameValue(project.name);
        setEditing(false);
      }
    } catch {
      setError("Update failed.");
      setNameValue(project.name);
      setEditing(false);
    }
  };

  const handleToggleVimMode = async (checked: boolean) => {
    try {
      await updateProject.mutateAsync({
        projectId: project.projectUUID,
        data: { editor: { vimMode: checked } },
      });
      invalidateProject();
    } catch {
      setError("Update failed.");
    }
  };

  const handleToggleRawMarkdownMode = async (checked: boolean) => {
    try {
      await updateProject.mutateAsync({
        projectId: project.projectUUID,
        data: { editor: { rawMarkdownMode: checked } },
      });
      invalidateProject();
    } catch {
      setError("Update failed.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setNameValue(project.name);
      setEditing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pt-4 max-w-md">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-col gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              rebuildIndex.mutate({
                projectId: project.projectUUID,
              })
            }
          >
            Rebuild index
          </Button>
        </div>
        <Label htmlFor="project-name">Name</Label>
        {editing ? (
          <Input
            ref={inputRef}
            id="project-name"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            disabled={updateProject.isPending}
          />
        ) : (
          <button
            className="text-sm text-left px-3 py-2 rounded-md border border-transparent hover:border-border hover:bg-muted/40 transition-colors w-full"
            onClick={() => setEditing(true)}
          >
            {project.name}
          </button>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Vault path</Label>
        <p className="text-sm px-3 py-2 rounded-md bg-muted/40 text-muted-foreground font-mono break-all">
          {project.vaultPath}
        </p>
      </div>
      <div className="flex flex-col gap-4">
        <Label className="text-base">Editor</Label>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="vim-mode">Vim mode</Label>
            <p className="text-xs text-muted-foreground">
              Enables vim keybindings and raw markdown editing.
            </p>
          </div>
          <Switch
            id="vim-mode"
            checked={project.editor.vimMode}
            onCheckedChange={handleToggleVimMode}
            disabled={updateProject.isPending}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="raw-markdown-mode">Raw markdown mode</Label>
            <p className="text-xs text-muted-foreground">
              Use a plain text editor instead of rich editing. Enabled automatically by vim mode.
            </p>
          </div>
          <Switch
            id="raw-markdown-mode"
            checked={project.editor.rawMarkdownMode || project.editor.vimMode}
            onCheckedChange={handleToggleRawMarkdownMode}
            disabled={updateProject.isPending || project.editor.vimMode}
          />
        </div>
      </div>
    </div>
  );
};

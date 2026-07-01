import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateProject,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
} from "@api/generated/projects/projects";
import type { Project } from "@api/generated/maskorAPI.schemas";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import { Slider } from "@components/ui/slider";
import { Button } from "@components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@components/ui/select";
import { LANGUAGE_CATALOG, type LanguageCode } from "@maskor/shared";
import { useRebuildIndex, useResetDatabase } from "@api/generated/index";
import { useCommands } from "@lib/commands/useCommands";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { projectConfigScope } from "@lib/commands/scopes/project-config";
import { useProjectSetting } from "@hooks/useProjectSetting";
import { SettingRow } from "../components/SettingRow";

// Pull the server-provided message out of a failed mutation (ApiRequestError carries the API's
// error body message; fall back gracefully for anything else) so the user sees the actual cause
// instead of a generic "see server logs".
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "see server logs.";

// Radix `SelectItem` rejects an empty-string value, but the catalog's "browser default" entry is `""`.
// Map it through this sentinel for the Select only; the stored value stays the empty string.
const LANGUAGE_DEFAULT_SENTINEL = "__default__";

export const GeneralTab = ({ project }: { project: Project }) => {
  const queryClient = useQueryClient();
  const updateProject = useUpdateProject();
  const rebuildIndex = useRebuildIndex();
  const resetDatabase = useResetDatabase();

  // Feedback for the index-maintenance buttons. Surfacing it is the fix for the prior silent
  // failure: a fire-and-forget mutate() dropped errors, so a failed rebuild looked like nothing
  // happened. Invalid-file feedback flows through the Diagnostics tab, not here.
  const [indexStatus, setIndexStatus] = useState<{ message: string; isError: boolean } | null>(
    null,
  );

  // Auto-dismiss a success message after a few seconds so it doesn't linger as stale state.
  // Errors stay put — the user needs to read what went wrong.
  useEffect(() => {
    if (!indexStatus || indexStatus.isError) return;
    const timeout = setTimeout(() => setIndexStatus(null), 4000);
    return () => clearTimeout(timeout);
  }, [indexStatus]);

  const runRebuildIndex = () => {
    if (rebuildIndex.isPending) return;
    setIndexStatus(null);
    rebuildIndex.mutate(
      { projectId: project.projectUUID },
      {
        onSuccess: () => setIndexStatus({ message: "Index rebuilt.", isError: false }),
        onError: (error) =>
          setIndexStatus({ message: `Rebuild failed: ${errorMessage(error)}`, isError: true }),
      },
    );
  };

  const runResetDatabase = () => {
    if (resetDatabase.isPending) return;
    // Reuses the auto-reset wording: re-derives from the vault, discarding DB-only state.
    if (
      !confirm(
        "Reset the database? It is dropped and re-derived from your vault. " +
          "Fragment usage stats and dismissed collision warnings are discarded. " +
          "Your vault files are not touched.",
      )
    ) {
      return;
    }
    setIndexStatus(null);
    resetDatabase.mutate(
      { projectId: project.projectUUID },
      {
        onSuccess: () =>
          setIndexStatus({
            message: "Database reset and re-derived from the vault.",
            isError: false,
          }),
        onError: (error) =>
          setIndexStatus({ message: `Reset failed: ${errorMessage(error)}`, isError: true }),
      },
    );
  };

  const commands = useCommands();
  useCommandScope(projectConfigScope, {
    rebuildIndexPending: rebuildIndex.isPending,
    rebuildIndex: runRebuildIndex,
    resetDatabasePending: resetDatabase.isPending,
    resetDatabase: runResetDatabase,
  });

  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const projectId = project.projectUUID;
  const vimMode = useProjectSetting(projectId, "editor.vimMode", false);
  const rawMarkdownMode = useProjectSetting(projectId, "editor.rawMarkdownMode", false);
  const fontSize = useProjectSetting(projectId, "editor.fontSize", 16);
  const marginFontSize = useProjectSetting(projectId, "editor.marginFontSize", 15);
  const maxParagraphWidth = useProjectSetting(projectId, "editor.maxParagraphWidth", 72);
  const language = useProjectSetting(projectId, "editor.language", "");
  const readinessThreshold = useProjectSetting(projectId, "suggestion.readinessThreshold", 0.8);
  const showFragmentStats = useProjectSetting(projectId, "advanced.showFragmentStats", false);
  const vimClipboardSync = useProjectSetting(projectId, "editor.vimClipboardSync", true);

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setNameValue(project.name);
      setEditing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pt-4 max-w-md">
      <div className="flex flex-col gap-2">
        <Label className="text-base">Index</Label>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => commands.run("config:rebuild-index")}
            disabled={rebuildIndex.isPending}
          >
            Rebuild index
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => commands.run("config:reset-database")}
            disabled={resetDatabase.isPending}
          >
            Reset database
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Rebuild re-derives the index from your vault. Reset drops and recreates the database — use
          it only if the index is broken in a way rebuild cannot fix.
        </p>
        {indexStatus && (
          <p
            className={`text-xs ${indexStatus.isError ? "text-destructive" : "text-muted-foreground"}`}
          >
            {indexStatus.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
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
        <SettingRow
          id="vim-mode"
          label="Vim mode"
          description="Enables vim keybindings and raw markdown editing."
          error={vimMode.error}
          control={
            <Switch
              id="vim-mode"
              checked={vimMode.value}
              onCheckedChange={(checked) => void vimMode.set(checked)}
              disabled={vimMode.isPending}
            />
          }
        />
        <SettingRow
          id="raw-markdown-mode"
          label="Raw markdown mode"
          description="Use a plain text editor instead of rich editing. Enabled automatically by vim mode."
          error={rawMarkdownMode.error}
          control={
            <Switch
              id="raw-markdown-mode"
              checked={rawMarkdownMode.value || vimMode.value}
              onCheckedChange={(checked) => void rawMarkdownMode.set(checked)}
              disabled={rawMarkdownMode.isPending || vimMode.value}
            />
          }
        />
        <SettingRow
          id="font-size"
          label="Font size"
          valueLabel={`${fontSize.draft}px`}
          error={fontSize.error}
          control={
            <Slider
              id="font-size"
              min={12}
              max={24}
              step={1}
              value={[fontSize.draft]}
              onValueChange={([value]) => fontSize.setDraft(value!)}
              onValueCommit={([value]) => void fontSize.commit(value!)}
              disabled={fontSize.isPending}
            />
          }
        />
        <SettingRow
          id="margin-font-size"
          label="Margin text size"
          valueLabel={`${marginFontSize.draft}px`}
          description="Text size of the margin comments and notes, independent of the prose font size."
          error={marginFontSize.error}
          control={
            <Slider
              id="margin-font-size"
              min={10}
              max={22}
              step={1}
              value={[marginFontSize.draft]}
              onValueChange={([value]) => marginFontSize.setDraft(value!)}
              onValueCommit={([value]) => void marginFontSize.commit(value!)}
              disabled={marginFontSize.isPending}
            />
          }
        />
        <SettingRow
          id="max-paragraph-width"
          label="Paragraph width"
          valueLabel={`${maxParagraphWidth.draft}ch`}
          description="Maximum line length in character units. 60–80ch is optimal for reading."
          error={maxParagraphWidth.error}
          control={
            <Slider
              id="max-paragraph-width"
              min={40}
              max={120}
              step={4}
              value={[maxParagraphWidth.draft]}
              onValueChange={([value]) => maxParagraphWidth.setDraft(value!)}
              onValueCommit={([value]) => void maxParagraphWidth.commit(value!)}
              disabled={maxParagraphWidth.isPending}
            />
          }
        />
        <SettingRow
          id="language"
          label="Language"
          description="Writing language for spell-check. Fragments can override this individually."
          error={language.error}
          control={
            <Select
              value={language.value || LANGUAGE_DEFAULT_SENTINEL}
              onValueChange={(value) =>
                void language.set(
                  (value === LANGUAGE_DEFAULT_SENTINEL ? "" : value) as LanguageCode,
                )
              }
              disabled={language.isPending}
            >
              <SelectTrigger id="language" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_CATALOG.map((entry) => (
                  <SelectItem
                    key={entry.code || LANGUAGE_DEFAULT_SENTINEL}
                    value={entry.code || LANGUAGE_DEFAULT_SENTINEL}
                  >
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </div>
      <div className="flex flex-col gap-4">
        <Label className="text-base">Suggestion</Label>
        <SettingRow
          id="ready-status-threshold"
          label="Ready status threshold"
          valueLabel={`${Math.round(readinessThreshold.draft * 100)}%`}
          description="Fragments with a ready status at or above this threshold are excluded from suggestion mode."
          error={readinessThreshold.error}
          control={
            <Slider
              id="ready-status-threshold"
              min={0}
              max={100}
              step={1}
              value={[Math.round(readinessThreshold.draft * 100)]}
              onValueChange={([value]) => readinessThreshold.setDraft(value! / 100)}
              onValueCommit={([value]) => void readinessThreshold.commit(value! / 100)}
              disabled={readinessThreshold.isPending}
            />
          }
        />
      </div>
      <div className="flex flex-col gap-4">
        <Label className="text-base">Advanced</Label>
        <SettingRow
          id="show-fragment-stats"
          label="Show fragment stats panel in editor"
          description="Displays a read-only stats inspector in the fragment editor sidebar."
          error={showFragmentStats.error}
          control={
            <Switch
              id="show-fragment-stats"
              checked={showFragmentStats.value}
              onCheckedChange={(checked) => void showFragmentStats.set(checked)}
              disabled={showFragmentStats.isPending}
            />
          }
        />
        <SettingRow
          id="yank-to-clipboard"
          label="Copy to system clipboard in vim mode"
          description={
            <>
              When using the &quot;yank&quot; vim action, copy the selected text to the system
              clipboard.
            </>
          }
          error={vimClipboardSync.error}
          control={
            <Switch
              id="yank-to-clipboard"
              checked={vimClipboardSync.value}
              onCheckedChange={(checked) => void vimClipboardSync.set(checked)}
              disabled={vimClipboardSync.isPending}
            />
          }
        />
      </div>
    </div>
  );
};

import { useCallback, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { ProseEditor, type ProseEditorHandle } from "./fragments/prose-editor";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { useDelayedPending } from "../hooks/useDelayedPending";
import { useKeyEdit } from "../hooks/useKeyEdit";
import { useProjectEditorConfig } from "../hooks/useProjectEditorConfig";

type Props = {
  label: string;
  projectId: string;
  fragmentId?: string;
  configTab: "notes" | "references";
  entityKey: string;
  content: string;
  isPending: boolean;
  cascadeWarnings?: string[];
  onDismissWarnings?: () => void;
  onKeySave: (key: string) => Promise<void>;
  onContentSave: (content: string) => Promise<void>;
};

export const EntityEditorShell = ({
  label,
  projectId,
  fragmentId,
  configTab,
  entityKey,
  content,
  isPending,
  cascadeWarnings,
  onDismissWarnings,
  onKeySave,
  onContentSave,
}: Props) => {
  const editorConfig = useProjectEditorConfig(projectId);
  const proseEditorRef = useRef<ProseEditorHandle>(null);
  const [isDirty, setIsDirty] = useState(false);
  const showSaving = useDelayedPending(isPending);

  const {
    keyEditing,
    keyValue,
    setKeyValue,
    keyError,
    keyInputRef,
    startEditing,
    cancelEditing,
    handleKeySave,
  } = useKeyEdit({ currentKey: entityKey, isPending, onRename: onKeySave });

  const handleContentSave = useCallback(async () => {
    if (!isDirty || isPending) return;
    const currentContent = proseEditorRef.current?.getContent() ?? content;
    try {
      await onContentSave(currentContent);
      setIsDirty(false);
    } catch {
      // save failed — isDirty stays true
    }
  }, [isDirty, isPending, content, onContentSave]);

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {fragmentId ? (
            <Link
              to="/projects/$projectId/fragments/$fragmentId"
              params={{ projectId, fragmentId }}
            >
              <Button variant="ghost" size="icon-sm">
                <ArrowLeftIcon />
              </Button>
            </Link>
          ) : (
            <Link
              to="/projects/$projectId/config"
              params={{ projectId }}
              search={{ tab: configTab }}
            >
              <Button variant="ghost" size="icon-sm">
                <ArrowLeftIcon />
              </Button>
            </Link>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{label}</span>
            {keyEditing ? (
              <Input
                ref={keyInputRef}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                onBlur={handleKeySave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleKeySave();
                  if (e.key === "Escape") cancelEditing();
                }}
                disabled={isPending}
              />
            ) : (
              <button
                className="text-left font-sans font-medium text-2xl hover:opacity-70 transition-opacity"
                onClick={startEditing}
              >
                {entityKey}
              </button>
            )}
            {keyError && <p className="text-xs text-destructive">{keyError}</p>}
          </div>
        </div>
        <Button
          size="sm"
          disabled={isPending || !isDirty}
          onClick={handleContentSave}
          className="min-w-20"
        >
          {showSaving ? "Saving…" : "Save"}
        </Button>
      </div>
      <Separator />
      {cascadeWarnings && cascadeWarnings.length > 0 && (
        <div className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {label} renamed in {cascadeWarnings.length} related file
            {cascadeWarnings.length > 1 ? "s" : ""}.
          </span>
          <button
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={onDismissWarnings}
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ProseEditor
          ref={proseEditorRef}
          content={content}
          vimMode={editorConfig.vimMode}
          rawMarkdownMode={editorConfig.rawMarkdownMode}
          onSave={handleContentSave}
          onChange={() => setIsDirty(true)}
        />
      </div>
    </div>
  );
};

import { forwardRef, type ReactNode, useCallback, useImperativeHandle, useRef } from "react";
import { ProseEditor, type ProseEditorHandle } from "./prose-editor";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { useDelayedPending } from "../hooks/useDelayedPending";
import { useKeyEdit } from "../hooks/useKeyEdit";
import { useProjectEditorConfig } from "../hooks/useProjectEditorConfig";
import { usePersistedBoolean } from "../hooks/usePersistedBoolean";

export type EntityEditorShellHandle = {
  save: () => Promise<void>;
};

type Props = {
  label: string;
  projectId: string;
  entityKey: string;
  content: string;
  isPending: boolean;
  isDirty: boolean;
  backNode?: ReactNode;
  banner?: ReactNode;
  sidebar?: ReactNode;
  sidebarCollapsible?: boolean;
  extraActions?: ReactNode;
  cascadeWarnings?: string[];
  onDismissWarnings?: () => void;
  onProseChange: () => void;
  onSaved: () => void;
  onKeySave: (key: string) => Promise<void>;
  onContentSave: (content: string) => Promise<void>;
};

export const EntityEditorShell = forwardRef<EntityEditorShellHandle, Props>(
  function EntityEditorShell(
    {
      label,
      projectId,
      entityKey,
      content,
      isPending,
      isDirty,
      backNode,
      banner,
      sidebar,
      sidebarCollapsible = false,
      extraActions,
      cascadeWarnings,
      onDismissWarnings,
      onProseChange,
      onSaved,
      onKeySave,
      onContentSave,
    },
    ref,
  ) {
    const editorConfig = useProjectEditorConfig(projectId);
    const proseEditorRef = useRef<ProseEditorHandle>(null);
    const showSaving = useDelayedPending(isPending);

    const [isSidebarCollapsed, , toggleSidebar] = usePersistedBoolean(
      `entityEditorSidebar_${label}`,
      false,
    );

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

    // Save that throws on failure — used by imperative callers (e.g. SuggestionModePage Next).
    const saveContent = useCallback(async () => {
      if (!isDirty || isPending) return;
      const currentContent = proseEditorRef.current?.getContent() ?? content;
      const metadataUpdate = await onContentSave(currentContent);
      onSaved();
      return metadataUpdate;
    }, [isDirty, isPending, content, onContentSave, onSaved]);

    // Button-triggered save — swallows errors so the parent keeps isDirty=true on failure.
    const handleContentSave = useCallback(async () => {
      try {
        await saveContent();
      } catch {
        // save failed — parent keeps isDirty true
      }
    }, [saveContent]);

    useImperativeHandle(ref, () => ({ save: saveContent }), [saveContent]);

    return (
      <div className="flex flex-col h-full gap-2">
        {banner}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {backNode}
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
          <div className="flex items-center gap-2">
            {extraActions}
            <Button
              size="sm"
              disabled={isPending || !isDirty}
              onClick={handleContentSave}
              className="min-w-20"
            >
              {showSaving ? "Saving…" : "Save"}
            </Button>
          </div>
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
        <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
          {sidebar && (
            <div className="flex shrink-0 flex-row items-start gap-1">
              {sidebarCollapsible && (
                <button
                  className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={toggleSidebar}
                  aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {isSidebarCollapsed ? "▶" : "◀"}
                </button>
              )}
              <div
                className="overflow-hidden transition-all duration-200"
                style={
                  sidebarCollapsible ? { width: isSidebarCollapsed ? 0 : undefined } : undefined
                }
              >
                <aside className="lg:w-72 overflow-y-auto p-1">{sidebar}</aside>
              </div>
            </div>
          )}
          <main className="flex-1 min-h-0 overflow-y-auto">
            <ProseEditor
              ref={proseEditorRef}
              content={content}
              vimMode={editorConfig.vimMode}
              rawMarkdownMode={editorConfig.rawMarkdownMode}
              onSave={handleContentSave}
              onChange={onProseChange}
            />
          </main>
        </div>
      </div>
    );
  },
);

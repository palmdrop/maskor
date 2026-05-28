import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ProseEditor, type ProseEditorHandle, type SelectionCapture } from "./prose-editor";
import { UnsavedRecoveryBanner } from "./unsaved-recovery-banner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { useDelayedPending } from "@hooks/useDelayedPending";
import { useKeyEdit } from "@hooks/useKeyEdit";
import { useProjectEditorConfig } from "@hooks/useProjectEditorConfig";
import { usePersistedBoolean } from "@hooks/usePersistedBoolean";
import { usePersistedCursor } from "@hooks/usePersistedCursor";
import { useEntityContentSwap, type SwapEntityKind } from "@hooks/useEntityContentSwap";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { editorScope, type InsertCommandTarget } from "@lib/commands/scopes/editor";
import { ExtractToEntityDialog } from "./extract-to-entity-dialog";
import { AppendOrPrependDialog, type InsertDirection } from "./append-or-prepend-dialog";
import { useInsertToggles } from "@lib/insert-toggles/InsertTogglesProvider";
import { ENTITY_KINDS, type EntityKind } from "@lib/entity-kinds/registry";
import { useEntityKindRegistry } from "@lib/entity-kinds/useEntityKindRegistry";
import { useCommands } from "../lib/commands/useCommands";

export type EntityEditorShellHandle = {
  save: () => Promise<void>;
  getSelection: () => SelectionCapture;
};

type Props = {
  label: string;
  projectId: string;
  entityKind: SwapEntityKind;
  entityUUID: string;
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
  onContentRevert?: () => void;
  onKeySave: (key: string) => Promise<void>;
  onContentSave: (content: string) => Promise<void>;
};

type InsertionTarget = {
  direction: InsertDirection;
  targetKind: EntityKind;
  targetEntity: InsertCommandTarget;
};

type InsertMutationResult = {
  status: number;
  data: { sourceCutFailed: boolean };
};

export const EntityEditorShell = forwardRef<EntityEditorShellHandle, Props>(
  function EntityEditorShell(
    {
      label,
      projectId,
      entityKind,
      entityUUID,
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
      onContentRevert,
      onKeySave,
      onContentSave,
    },
    ref,
  ) {
    const editorConfig = useProjectEditorConfig(projectId);
    // Cursor position is persisted per editing mode — switching mode reads that
    // mode's own slot (or starts from the top), and offsets aren't comparable
    // across the CodeMirror/ProseMirror backends anyway.
    const editorMode = editorConfig.vimMode ? "vim" : editorConfig.rawMarkdownMode ? "raw" : "rich";
    const cursor = usePersistedCursor(
      `maskor:cursor:${projectId}:${entityKind}:${entityUUID}:${editorMode}`,
    );
    const navigate = useNavigate();
    const proseEditorRef = useRef<ProseEditorHandle>(null);
    const showSaving = useDelayedPending(isPending);

    const registry = useEntityKindRegistry(projectId);
    const sourceKind = entityKind as EntityKind;

    const isInsertionPending = ENTITY_KINDS.some(
      (kind) => registry[kind].append.isPending || registry[kind].prepend.isPending,
    );

    const [extractTarget, setExtractTarget] = useState<EntityKind | null>(null);
    const [extractSelectionText, setExtractSelectionText] = useState("");

    const [insertionTarget, setInsertionTarget] = useState<InsertionTarget | null>(null);
    const [insertionSelectionText, setInsertionSelectionText] = useState("");
    const {
      sourceMode: insertSourceMode,
      nextMode: insertNextMode,
      setSourceMode: setInsertSourceMode,
      setNextMode: setInsertNextMode,
    } = useInsertToggles();

    // Track the live editor content so useEntityContentSwap can debounce-write it.
    // Re-reads from the editor on every onProseChange so the swap matches what's
    // on screen.
    const [liveContent, setLiveContent] = useState(content);

    useEffect(() => {
      // Re-sync from the server when we're not dirty (e.g. server data refetched
      // while the editor was clean). Pending edits must not be clobbered.
      if (!isDirty) setLiveContent(content);
    }, [content, isDirty]);

    const { recovery, clear: clearSwap } = useEntityContentSwap({
      projectId,
      entityType: entityKind,
      entityUUID,
      currentValue: liveContent,
      serverValue: content,
    });

    const recoveryAppliedRef = useRef(false);
    useEffect(() => {
      // Reset the per-entity guard when the swap target changes.
      recoveryAppliedRef.current = false;
    }, [projectId, entityKind, entityUUID]);

    // Consumers pass a fresh onProseChange each render; ref it so the recovery
    // effect doesn't re-run (no-op or otherwise) on every parent render.
    const onProseChangeRef = useRef(onProseChange);
    onProseChangeRef.current = onProseChange;

    useEffect(() => {
      if (!recovery) return;
      if (recoveryAppliedRef.current) return;
      recoveryAppliedRef.current = true;
      proseEditorRef.current?.setContent(recovery.content);
      setLiveContent(recovery.content);
      onProseChangeRef.current();
    }, [recovery]);

    const handleRestoreFromServer = useCallback(() => {
      proseEditorRef.current?.setContent(content);
      setLiveContent(content);
      void clearSwap();
      onContentRevert?.();
    }, [content, clearSwap, onContentRevert]);

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
      // Swap is preserved on failure — onContentSave throws on non-2xx, so this
      // line only runs if the canonical save succeeded.
      await clearSwap(); // TODO: should frontend worry about swap? or is that just a backend concern?
      onSaved();
      return metadataUpdate;
    }, [isDirty, isPending, content, onContentSave, onSaved, clearSwap]);

    // Button-triggered save — swallows errors so the parent keeps isDirty=true on failure.
    const handleContentSave = useCallback(async () => {
      try {
        await saveContent();
      } catch {
        // save failed — parent keeps isDirty true
      }
    }, [saveContent]);

    useImperativeHandle(
      ref,
      () => ({
        save: saveContent,
        getSelection: () => proseEditorRef.current?.getSelection() ?? { text: "", isEmpty: true },
      }),
      [saveContent],
    );

    const getEditorSelection = useCallback(
      () => proseEditorRef.current?.getSelection() ?? { text: "", isEmpty: true },
      [],
    );

    const navigateToEntity = useCallback(
      (kind: EntityKind, uuid: string) => {
        // TanStack Router needs the route literal at the call site for params inference,
        // so the four routes stay unrolled — but only in this one helper.

        switch (kind) {
          case "fragment":
            void navigate({
              to: "/projects/$projectId/fragments/$fragmentId",
              params: { projectId, fragmentId: uuid },
            });
            return;
          case "note":
            void navigate({
              to: "/projects/$projectId/notes/$noteId",
              params: { projectId, noteId: uuid },
            });
            return;
          case "reference":
            void navigate({
              to: "/projects/$projectId/references/$referenceId",
              params: { projectId, referenceId: uuid },
            });
            return;
          case "aspect":
            void navigate({
              to: "/projects/$projectId/aspects/$aspectId",
              params: { projectId, aspectId: uuid },
            });
            return;
        }
      },
      [navigate, projectId],
    );

    const handleExtractOpen = useCallback((kind: EntityKind, text: string) => {
      setExtractSelectionText(text);
      setExtractTarget(kind);
    }, []);

    const handleExtractClose = useCallback(() => setExtractTarget(null), []);

    const handleExtractSuccess = useCallback(
      (kind: EntityKind, uuid: string) => {
        setExtractTarget(null);
        navigateToEntity(kind, uuid);
      },
      [navigateToEntity],
    );

    const eligibleByKind = useMemo<Record<EntityKind, InsertCommandTarget[]>>(() => {
      const buildList = (kind: EntityKind): InsertCommandTarget[] =>
        registry[kind].list
          .filter(
            (item) =>
              item.uuid !== entityUUID && !(kind === "fragment" && item.isDiscarded === true),
          )
          .map((item) => ({ uuid: item.uuid, key: item.key }));
      return {
        fragment: buildList("fragment"),
        note: buildList("note"),
        reference: buildList("reference"),
        aspect: buildList("aspect"),
      };
    }, [registry, entityUUID]);

    const handleInsertOpen = useCallback(
      (
        direction: InsertDirection,
        targetKind: EntityKind,
        selectionText: string,
        targetEntity: InsertCommandTarget,
      ) => {
        setInsertionSelectionText(selectionText);
        setInsertionTarget({ direction, targetKind, targetEntity });
      },
      [],
    );

    const handleInsertClose = useCallback(() => setInsertionTarget(null), []);

    const handleInsertConfirm = useCallback(async () => {
      if (!insertionTarget) return;
      const { direction, targetKind, targetEntity } = insertionTarget;
      const bundle = registry[targetKind];

      const mutation = direction === "append" ? bundle.append : bundle.prepend;
      const input = {
        projectId,
        [bundle.meta.insertIdParamKey]: targetEntity.uuid,
        data: {
          insertedBody: insertionSelectionText,
          sourceUuid: entityUUID,
          sourceType: sourceKind,
          sourceMode: insertSourceMode,
          navigated: insertNextMode === "switch",
        },
      };

      // NOTE: The assignment is not useless, ts is wrong?
      // eslint-disable-next-line no-useless-assignment
      let result: InsertMutationResult | null = null;
      try {
        result = (await mutation.mutateAsync(input as never)) as InsertMutationResult;
      } catch {
        return;
      }

      if (result?.status !== 200) return;

      setInsertionTarget(null);

      if (result.data.sourceCutFailed) {
        toast.warning(
          `Added to ${targetKind}/${targetEntity.key}. Couldn't update the source body — the selection is still there.`,
        );
      }

      if (insertNextMode === "switch") {
        navigateToEntity(targetKind, targetEntity.uuid);
      }
    }, [
      insertionTarget,
      insertionSelectionText,
      entityUUID,
      sourceKind,
      insertSourceMode,
      insertNextMode,
      projectId,
      registry,
      navigateToEntity,
    ]);

    const commands = useCommands();

    useCommandScope(editorScope, {
      getSelection: getEditorSelection,
      eligibleByKind,
      extractTo: handleExtractOpen,
      insertTo: handleInsertOpen,
      canSave: isDirty && !isPending,
      save: handleContentSave,
    });

    const handleProseChange = useCallback(() => {
      const current = proseEditorRef.current?.getContent();
      if (current !== undefined) setLiveContent(current);
      onProseChange();
    }, [onProseChange]);

    return (
      <div className="flex flex-col h-full gap-2">
        {recovery && (
          <UnsavedRecoveryBanner cachedAt={recovery.at} onDismiss={handleRestoreFromServer} />
        )}
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
              onClick={() => commands.run("editor:save")}
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
              fontSize={editorConfig.fontSize}
              maxParagraphWidth={editorConfig.maxParagraphWidth}
              onSave={() => commands.run("editor:save")}
              onChange={handleProseChange}
              cursor={cursor}
            />
          </main>
        </div>
        {extractTarget && (
          <ExtractToEntityDialog
            open={true}
            bundle={registry[extractTarget]}
            projectId={projectId}
            sourceUuid={entityUUID}
            sourceKind={sourceKind}
            selectionText={extractSelectionText}
            onClose={handleExtractClose}
            onSuccess={(uuid) => handleExtractSuccess(extractTarget, uuid)}
          />
        )}
        {insertionTarget && (
          <AppendOrPrependDialog
            open={true}
            direction={insertionTarget.direction}
            targetType={insertionTarget.targetKind}
            targetKey={insertionTarget.targetEntity.key}
            selectionText={insertionSelectionText}
            sourceMode={insertSourceMode}
            nextMode={insertNextMode}
            isPending={isInsertionPending}
            onSourceModeChange={setInsertSourceMode}
            onNextModeChange={setInsertNextMode}
            onClose={handleInsertClose}
            onConfirm={() => void handleInsertConfirm()}
          />
        )}
      </div>
    );
  },
);

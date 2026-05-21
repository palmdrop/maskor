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
import { useEntityContentSwap, type SwapEntityKind } from "@hooks/useEntityContentSwap";
import { useEditorExtractCommand } from "@lib/commands/catalog/useEditorExtractCommand";
import {
  useEditorInsertCommand,
  type InsertCommandTarget,
} from "@lib/commands/catalog/useEditorInsertCommand";
import { ExtractToFragmentDialog } from "./fragments/extract-to-fragment-dialog";
import { ExtractToNoteDialog } from "./notes/extract-to-note-dialog";
import { ExtractToReferenceDialog } from "./references/extract-to-reference-dialog";
import { ExtractToAspectDialog } from "./aspects/extract-to-aspect-dialog";
import { AppendOrPrependDialog, type InsertDirection } from "./append-or-prepend-dialog";
import { useInsertToggles } from "@lib/insert-toggles/InsertTogglesProvider";
import { useListFragments } from "@api/generated/fragments/fragments";
import { useListNotes } from "@api/generated/notes/notes";
import { useListReferences } from "@api/generated/references/references";
import { useListAspects } from "@api/generated/aspects/aspects";
import { useAppendFragment, usePrependFragment } from "@api/generated/fragments/fragments";
import { useAppendNote, usePrependNote } from "@api/generated/notes/notes";
import { useAppendReference, usePrependReference } from "@api/generated/references/references";
import { useAppendAspect, usePrependAspect } from "@api/generated/aspects/aspects";

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
    const navigate = useNavigate();
    const proseEditorRef = useRef<ProseEditorHandle>(null);
    const showSaving = useDelayedPending(isPending);

    const { data: fragmentsEnvelope } = useListFragments(projectId);
    const { data: notesEnvelope } = useListNotes(projectId);
    const { data: referencesEnvelope } = useListReferences(projectId);
    const { data: aspectsEnvelope } = useListAspects(projectId);

    const { mutateAsync: appendFragment, isPending: isAppendingFragment } = useAppendFragment();
    const { mutateAsync: prependFragment, isPending: isPrependingFragment } = usePrependFragment();
    const { mutateAsync: appendNote, isPending: isAppendingNote } = useAppendNote();
    const { mutateAsync: prependNote, isPending: isPrependingNote } = usePrependNote();
    const { mutateAsync: appendReference, isPending: isAppendingReference } = useAppendReference();
    const { mutateAsync: prependReference, isPending: isPrependingReference } =
      usePrependReference();
    const { mutateAsync: appendAspect, isPending: isAppendingAspect } = useAppendAspect();
    const { mutateAsync: prependAspect, isPending: isPrependingAspect } = usePrependAspect();

    const isInsertionPending =
      isAppendingFragment ||
      isPrependingFragment ||
      isAppendingNote ||
      isPrependingNote ||
      isAppendingReference ||
      isPrependingReference ||
      isAppendingAspect ||
      isPrependingAspect;

    const [extractTarget, setExtractTarget] = useState<
      "fragment" | "note" | "reference" | "aspect" | null
    >(null);
    const [extractSelectionText, setExtractSelectionText] = useState("");

    type InsertionTarget = {
      direction: InsertDirection;
      targetType: "fragment" | "note" | "reference" | "aspect";
      targetEntity: InsertCommandTarget;
    };

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
      await clearSwap();
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

    const handleExtractOpen = useCallback(
      (targetType: "fragment" | "note" | "reference" | "aspect") => (text: string) => {
        setExtractSelectionText(text);
        setExtractTarget(targetType);
      },
      [],
    );

    const handleExtractClose = useCallback(() => setExtractTarget(null), []);

    const handleExtractToFragmentSuccess = useCallback(
      (uuid: string) => {
        setExtractTarget(null);
        void navigate({
          to: "/projects/$projectId/fragments/$fragmentId",
          params: { projectId, fragmentId: uuid },
        });
      },
      [navigate, projectId],
    );

    const handleExtractToNoteSuccess = useCallback(
      (uuid: string) => {
        setExtractTarget(null);
        void navigate({
          to: "/projects/$projectId/notes/$noteId",
          params: { projectId, noteId: uuid },
        });
      },
      [navigate, projectId],
    );

    const handleExtractToReferenceSuccess = useCallback(
      (uuid: string) => {
        setExtractTarget(null);
        void navigate({
          to: "/projects/$projectId/references/$referenceId",
          params: { projectId, referenceId: uuid },
        });
      },
      [navigate, projectId],
    );

    const handleExtractToAspectSuccess = useCallback(
      (uuid: string) => {
        setExtractTarget(null);
        void navigate({
          to: "/projects/$projectId/aspects/$aspectId",
          params: { projectId, aspectId: uuid },
        });
      },
      [navigate, projectId],
    );

    const eligibleFragments = useMemo<InsertCommandTarget[]>(() => {
      const fragments = fragmentsEnvelope?.status === 200 ? fragmentsEnvelope.data : [];
      return fragments
        .filter((fragment) => !fragment.isDiscarded && fragment.uuid !== entityUUID)
        .map((fragment) => ({ uuid: fragment.uuid, key: fragment.key }));
    }, [fragmentsEnvelope, entityUUID]);

    const eligibleNotes = useMemo<InsertCommandTarget[]>(() => {
      const notes = notesEnvelope?.status === 200 ? notesEnvelope.data : [];
      return notes
        .filter((note) => note.uuid !== entityUUID)
        .map((note) => ({ uuid: note.uuid, key: note.key }));
    }, [notesEnvelope, entityUUID]);

    const eligibleReferences = useMemo<InsertCommandTarget[]>(() => {
      const references = referencesEnvelope?.status === 200 ? referencesEnvelope.data : [];
      return references
        .filter((reference) => reference.uuid !== entityUUID)
        .map((reference) => ({ uuid: reference.uuid, key: reference.key }));
    }, [referencesEnvelope, entityUUID]);

    const eligibleAspects = useMemo<InsertCommandTarget[]>(() => {
      const aspects = aspectsEnvelope?.status === 200 ? aspectsEnvelope.data : [];
      return aspects
        .filter((aspect) => aspect.uuid !== entityUUID)
        .map((aspect) => ({ uuid: aspect.uuid, key: aspect.key }));
    }, [aspectsEnvelope, entityUUID]);

    const getEligibleItems = useCallback(
      (targetType: "fragment" | "note" | "reference" | "aspect") => {
        if (targetType === "fragment") return eligibleFragments;
        if (targetType === "note") return eligibleNotes;
        if (targetType === "reference") return eligibleReferences;
        return eligibleAspects;
      },
      [eligibleFragments, eligibleNotes, eligibleReferences, eligibleAspects],
    );

    const handleInsertOpen = useCallback(
      (direction: InsertDirection, targetType: "fragment" | "note" | "reference" | "aspect") =>
        (selectionText: string, targetEntity: InsertCommandTarget) => {
          setInsertionSelectionText(selectionText);
          setInsertionTarget({ direction, targetType, targetEntity });
        },
      [],
    );

    const handleInsertClose = useCallback(() => setInsertionTarget(null), []);

    const handleInsertConfirm = useCallback(async () => {
      if (!insertionTarget) return;
      const { direction, targetType, targetEntity } = insertionTarget;

      const insertionData = {
        insertedBody: insertionSelectionText,
        sourceUuid: entityUUID,
        sourceType: entityKind as "fragment" | "note" | "reference" | "aspect",
        sourceMode: insertSourceMode,
        navigated: insertNextMode === "switch",
      };

      type InsertResult = { sourceCutFailed: boolean };
      let insertResult: InsertResult | null = null;

      try {
        if (targetType === "fragment") {
          const result = await (direction === "append" ? appendFragment : prependFragment)({
            projectId,
            fragmentId: targetEntity.uuid,
            data: insertionData,
          });
          if (result.status === 200) insertResult = result.data;
        } else if (targetType === "note") {
          const result = await (direction === "append" ? appendNote : prependNote)({
            projectId,
            noteId: targetEntity.uuid,
            data: insertionData,
          });
          if (result.status === 200) insertResult = result.data;
        } else if (targetType === "reference") {
          const result = await (direction === "append" ? appendReference : prependReference)({
            projectId,
            referenceId: targetEntity.uuid,
            data: insertionData,
          });
          if (result.status === 200) insertResult = result.data;
        } else {
          const result = await (direction === "append" ? appendAspect : prependAspect)({
            projectId,
            aspectId: targetEntity.uuid,
            data: insertionData,
          });
          if (result.status === 200) insertResult = result.data;
        }
      } catch {
        return;
      }

      if (!insertResult) return;

      setInsertionTarget(null);

      if (insertResult.sourceCutFailed) {
        toast.warning(
          `Added to ${targetType}/${targetEntity.key}. Couldn't update the source body — the selection is still there.`,
        );
      }

      if (insertNextMode === "switch") {
        if (targetType === "fragment") {
          void navigate({
            to: "/projects/$projectId/fragments/$fragmentId",
            params: { projectId, fragmentId: targetEntity.uuid },
          });
        } else if (targetType === "note") {
          void navigate({
            to: "/projects/$projectId/notes/$noteId",
            params: { projectId, noteId: targetEntity.uuid },
          });
        } else if (targetType === "reference") {
          void navigate({
            to: "/projects/$projectId/references/$referenceId",
            params: { projectId, referenceId: targetEntity.uuid },
          });
        } else {
          void navigate({
            to: "/projects/$projectId/aspects/$aspectId",
            params: { projectId, aspectId: targetEntity.uuid },
          });
        }
      }
    }, [
      insertionTarget,
      insertionSelectionText,
      entityUUID,
      entityKind,
      insertSourceMode,
      insertNextMode,
      projectId,
      appendFragment,
      prependFragment,
      appendNote,
      prependNote,
      appendReference,
      prependReference,
      appendAspect,
      prependAspect,
      navigate,
    ]);

    useEditorExtractCommand({
      targetType: "fragment",
      getSelection: getEditorSelection,
      onExtract: handleExtractOpen("fragment"),
    });
    useEditorExtractCommand({
      targetType: "note",
      getSelection: getEditorSelection,
      onExtract: handleExtractOpen("note"),
    });
    useEditorExtractCommand({
      targetType: "reference",
      getSelection: getEditorSelection,
      onExtract: handleExtractOpen("reference"),
    });
    useEditorExtractCommand({
      targetType: "aspect",
      getSelection: getEditorSelection,
      onExtract: handleExtractOpen("aspect"),
    });

    useEditorInsertCommand({
      direction: "append",
      targetType: "fragment",
      getSelection: getEditorSelection,
      getItems: () => eligibleFragments,
      onInsert: handleInsertOpen("append", "fragment"),
    });
    useEditorInsertCommand({
      direction: "append",
      targetType: "note",
      getSelection: getEditorSelection,
      getItems: () => eligibleNotes,
      onInsert: handleInsertOpen("append", "note"),
    });
    useEditorInsertCommand({
      direction: "append",
      targetType: "reference",
      getSelection: getEditorSelection,
      getItems: () => eligibleReferences,
      onInsert: handleInsertOpen("append", "reference"),
    });
    useEditorInsertCommand({
      direction: "append",
      targetType: "aspect",
      getSelection: getEditorSelection,
      getItems: () => eligibleAspects,
      onInsert: handleInsertOpen("append", "aspect"),
    });
    useEditorInsertCommand({
      direction: "prepend",
      targetType: "fragment",
      getSelection: getEditorSelection,
      getItems: () => eligibleFragments,
      onInsert: handleInsertOpen("prepend", "fragment"),
    });
    useEditorInsertCommand({
      direction: "prepend",
      targetType: "note",
      getSelection: getEditorSelection,
      getItems: () => eligibleNotes,
      onInsert: handleInsertOpen("prepend", "note"),
    });
    useEditorInsertCommand({
      direction: "prepend",
      targetType: "reference",
      getSelection: getEditorSelection,
      getItems: () => eligibleReferences,
      onInsert: handleInsertOpen("prepend", "reference"),
    });
    useEditorInsertCommand({
      direction: "prepend",
      targetType: "aspect",
      getSelection: getEditorSelection,
      getItems: () => eligibleAspects,
      onInsert: handleInsertOpen("prepend", "aspect"),
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
              fontSize={editorConfig.fontSize}
              maxParagraphWidth={editorConfig.maxParagraphWidth}
              onSave={handleContentSave}
              onChange={handleProseChange}
            />
          </main>
        </div>
        <ExtractToFragmentDialog
          open={extractTarget === "fragment"}
          projectId={projectId}
          sourceFragmentUuid={entityUUID}
          selectionText={extractSelectionText}
          onClose={handleExtractClose}
          onSuccess={handleExtractToFragmentSuccess}
        />
        <ExtractToNoteDialog
          open={extractTarget === "note"}
          projectId={projectId}
          sourceUuid={entityUUID}
          sourceType={entityKind}
          selectionText={extractSelectionText}
          onClose={handleExtractClose}
          onSuccess={handleExtractToNoteSuccess}
        />
        <ExtractToReferenceDialog
          open={extractTarget === "reference"}
          projectId={projectId}
          sourceUuid={entityUUID}
          sourceType={entityKind}
          selectionText={extractSelectionText}
          onClose={handleExtractClose}
          onSuccess={handleExtractToReferenceSuccess}
        />
        <ExtractToAspectDialog
          open={extractTarget === "aspect"}
          projectId={projectId}
          sourceUuid={entityUUID}
          sourceType={entityKind}
          selectionText={extractSelectionText}
          onClose={handleExtractClose}
          onSuccess={handleExtractToAspectSuccess}
        />
        {insertionTarget && (
          <AppendOrPrependDialog
            open={true}
            direction={insertionTarget.direction}
            targetType={insertionTarget.targetType}
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

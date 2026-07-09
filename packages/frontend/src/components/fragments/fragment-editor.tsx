import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDiscardFragment,
  useRestoreFragment,
  getGetFragmentQueryKey,
  getListFragmentsQueryKey,
} from "@api/generated/fragments/fragments";
import { useGetProject } from "@api/generated/projects/projects";
import { useListSequences } from "@api/generated/sequences/sequences";
import { isSequenceReadOnly } from "@lib/sequences/readOnly";
import { useInvalidateSequences } from "@lib/sequences/useInvalidateSequences";
import { useInvalidateActionLog } from "@api/action-log";
import { useEntityEditor } from "@lib/entity-kinds/useEntityEditor";
import { useProjectEditorConfig } from "@hooks/useProjectEditorConfig";
import type { EditorMode } from "@components/margins/slot-editor";
import { EditorNavigationControls } from "./editor-navigation-controls";
import { FragmentMetadataForm } from "./fragment-metadata-form";
import { BacklinksPanel } from "@components/document-links/BacklinksPanel";
import { FragmentSequenceMembership } from "./fragment-sequence-membership";
import { FragmentStatsInspector } from "./fragment-stats-inspector";
import { PlaceInSequenceModal } from "@components/sequences/PlaceInSequenceModal";
import { SplitFragmentDialog } from "@components/fragments/SplitFragmentDialog";
import { Button } from "@components/ui/button";
import { EntityEditorShell, type EntityEditorShellHandle } from "@components/entity-editor-shell";
import { MarginColumn, type MarginColumnHandle } from "@components/margins/margin-column";
import { MarginNotesTab } from "@components/margins/margin-notes-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/tabs";
import { AspectReaderTab } from "@components/aspects/aspect-reader-tab";
import { cn } from "@/lib/utils";
import { useFragmentMarginBridge } from "./use-fragment-margin-bridge";
import { UnsavedRecoveryBanner } from "@components/unsaved-recovery-banner";
import { BackupFailedBanner } from "@components/backup-failed-banner";
import { ConflictingBackupBanner } from "@components/conflicting-backup-banner";
import { Separator } from "@components/ui/separator";
import { useMarginEditor } from "@hooks/useMarginEditor";
import { useEntityContentSwap } from "@hooks/useEntityContentSwap";
import { useCommands } from "../../lib/commands/useCommands";
import { useCommandScope } from "../../lib/commands/useCommandScope";
import { fragmentEditorScope } from "../../lib/commands/scopes/fragment-editor";
import { marginScope } from "../../lib/commands/scopes/margin";

export type FragmentEditorHandle = {
  save: () => Promise<void>;
};

// View-supplied navigation slot. The editor renders consistent Previous/Next
// buttons and owns nothing about ordering — each mounting view composes its own
// save-then-advance logic (and any side effects) behind onNext / onPrevious,
// typically by dispatching a `<view>:next` / `<view>:previous` command. Undefined
// hasNext / hasPrevious means "enabled"; pass `false` to disable at a boundary.
export type EditorNavigation = {
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
  isNavigating?: boolean;
};

type Props = {
  projectId: string;
  fragmentId: string;
  sidebarCollapsible?: boolean;
  navigation?: EditorNavigation;
  // When false, the Margin (comments) column is suppressed — used by the inline
  // Overview/Preview overlay, where a side-by-side annotation column would fight
  // the host's own sidebars for width. Defaults to true.
  showMargin?: boolean;
  // Optional leading node in the editor header (e.g. a Close control for the
  // inline overlay).
  backNode?: ReactNode;
  onDirtyChange?: (isDirty: boolean) => void;
  onSaved?: () => void;
  onDiscarded?: () => void;
  customizeExtraActions?: (defaultExtraActions?: ReactNode) => ReactNode;
};

export const FragmentEditor = forwardRef<FragmentEditorHandle, Props>(function FragmentEditor(
  {
    projectId,
    fragmentId,
    sidebarCollapsible,
    navigation,
    showMargin = true,
    backNode,
    onDirtyChange,
    onSaved,
    onDiscarded,
    customizeExtraActions,
  },
  ref,
) {
  const queryClient = useQueryClient();
  const editor = useEntityEditor("fragment", projectId, fragmentId);
  const { data: projectEnvelope } = useGetProject(projectId);
  const { data: sequenceBundleEnvelope } = useListSequences(projectId);
  const sequences =
    sequenceBundleEnvelope?.status === 200 ? sequenceBundleEnvelope.data.sequences : [];
  // Import-sequences (carrying an `origin`) are read-only snapshots and cannot be
  // placed into — exclude them from the "Place in sequence…" picker. To build on
  // one the user clones it first.
  const placeableSequences = sequences.filter((sequence) => !isSequenceReadOnly(sequence));
  const [placeInSequenceId, setPlaceInSequenceId] = useState<string | null>(null);
  const [isPlaceInSequenceOpen, setIsPlaceInSequenceOpen] = useState(false);
  // Keep `open` separate from the mounted/unmounted decision so Radix can run
  // its own close lifecycle (exit transition + focus restoration) before the
  // dialog tears down. Unmounting on close cuts that short and can drop focus.
  const openPlaceInSequence = useCallback((sequenceId: string) => {
    setPlaceInSequenceId(sequenceId);
    setIsPlaceInSequenceOpen(true);
  }, []);
  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const openSplit = useCallback(() => setIsSplitOpen(true), []);
  const { mutateAsync: discardFragment, isPending: isDiscardPending } = useDiscardFragment();
  const { mutateAsync: restoreFragment, isPending: isRestorePending } = useRestoreFragment();

  const showFragmentStats =
    projectEnvelope?.status === 200 ? projectEnvelope.data.advanced.showFragmentStats : false;

  const shellRef = useRef<EntityEditorShellHandle>(null);
  const marginColumnRef = useRef<MarginColumnHandle>(null);

  const editorConfig = useProjectEditorConfig(projectId);
  const marginMode: EditorMode = editorConfig.vimMode
    ? "vim"
    : editorConfig.rawMarkdownMode
      ? "raw"
      : "rich";

  const marginEditor = useMarginEditor(projectId, fragmentId);

  // The Margin's unsaved buffer is mirrored to `.maskor/swap/margin/<fragmentUuid>.json`, keyed by
  // the owning fragment so it forms a linked pair with the fragment swap. The single recovery banner
  // (rendered below) restores both sides together; neither is restored without the other.
  const marginSwap = useEntityContentSwap({
    projectId,
    entityType: "margin",
    entityUUID: fragmentId,
    currentValue: marginEditor.serializedContent,
    serverValue: marginEditor.serializedServer,
  });

  // Fragment swap recovery, reported up from the shell so it can be coordinated with the margin's.
  const [fragmentRecovery, setFragmentRecovery] = useState<{
    at: Date;
    isConflict: boolean;
  } | null>(null);
  // Fragment swap-backup failure, reported up from the shell; combined with the margin's into one
  // "not backed up" warning over the linked pair.
  const [fragmentBackupFailed, setFragmentBackupFailed] = useState(false);

  // Apply the recovered Margin buffer once, mirroring the shell's fragment-recovery behaviour.
  const marginRecoveryAppliedRef = useRef(false);
  // Explicit choice made on a conflicting pair backup — hides the pair conflict banner after the
  // user picked (mirrors the shell's own conflictResolution for the non-pair case).
  const [pairConflictResolution, setPairConflictResolution] = useState<"restored" | "kept" | null>(
    null,
  );
  useEffect(() => {
    marginRecoveryAppliedRef.current = false;
    setPairConflictResolution(null);
  }, [projectId, fragmentId]);
  useEffect(() => {
    if (!marginSwap.recovery) return;
    // A conflicting Margin backup is held back like the fragment's (multi-tab-swap-hardening,
    // Phase 3) — applied only via the pair banner's explicit "Restore backup".
    if (marginSwap.recovery.isConflict) return;
    if (marginRecoveryAppliedRef.current) return;
    marginRecoveryAppliedRef.current = true;
    marginEditor.applySerialized(marginSwap.recovery.content);
  }, [marginSwap.recovery, marginEditor]);

  const [isProseDirty, setIsProseDirty] = useState(false);
  // The editor save persists the fragment and its Margin together (margins-4 #10, #13), so a
  // margin-only edit dirties the shell — enabling the editor Save button and gating its command.
  const isDirty = isProseDirty || marginEditor.isDirty;

  // Live fragment body, tracked so the Margin column can enumerate the fragment's blocks and bind
  // comments live. Seeded from the server fragment; updated on each edit.
  const [fragmentContent, setFragmentContent] = useState("");
  const fragment = editor.entity;
  useEffect(() => {
    if (fragment && !isProseDirty) setFragmentContent(fragment.content);
  }, [fragment?.content, isProseDirty]);

  // Gutter tab + aspect-reader selection. Lifted here so the metadata sidebar (which dispatches the
  // preview command) and the gutter's Aspect tab share a single selection. Single-expand accordion.
  const [gutterTab, setGutterTab] = useState<"margin" | "aspect" | "notes">("margin");
  const [expandedAspectKey, setExpandedAspectKey] = useState<string | null>(null);
  const previewAspect = useCallback((aspectKey: string) => {
    setGutterTab("aspect");
    setExpandedAspectKey(aspectKey);
  }, []);
  const toggleAspect = useCallback(
    (aspectKey: string) =>
      setExpandedAspectKey((current) => (current === aspectKey ? null : aspectKey)),
    [],
  );
  const attachedAspectKeys = useMemo(
    () => (fragment?.aspects ? Object.keys(fragment.aspects) : []),
    [fragment],
  );

  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  useEffect(() => {
    onDirtyChangeRef.current?.(isDirty);
  }, [isDirty]);

  useImperativeHandle(
    ref,
    () => ({
      save: async () => {
        if (shellRef.current) {
          await shellRef.current.save();
        }
      },
    }),
    [],
  );

  const isActionPending = editor.isPending || isDiscardPending || isRestorePending;

  const invalidateFragment = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetFragmentQueryKey(projectId, fragmentId) });
    queryClient.invalidateQueries({ queryKey: getListFragmentsQueryKey(projectId) });
  }, [queryClient, projectId, fragmentId]);

  const invalidateActionLog = useInvalidateActionLog(projectId);
  const invalidateSequences = useInvalidateSequences(projectId);

  const onContentSave = useCallback(
    async (content: string) => {
      // Coupled save (margins-4 #10, #13): the editor's save persists the fragment and its Margin
      // together. Save the fragment only when its prose changed (the editor core reconciles the
      // server fragment, invalidates the list, and refreshes stats + action log); always flush a
      // dirty Margin and drop its swap mirror. Each side still persists on its own next save if
      // the other is clean.
      if (isProseDirty) {
        await editor.onContentSave(content);
      }
      if (marginEditor.isDirty) {
        await marginEditor.save();
        await marginSwap.clear();
      }
    },
    [editor, isProseDirty, marginEditor, marginSwap],
  );

  const handleDiscard = useCallback(
    () =>
      discardFragment(
        { projectId, fragmentId },
        {
          onSuccess: () => {
            invalidateFragment();
            // Discard unplaces the fragment from every sequence it sat in
            // (backend), so refresh the sequence caches too — otherwise the
            // sidebar/overview keep showing the now-discarded placement.
            invalidateSequences();
            invalidateActionLog();
            onDiscarded?.();
          },
        },
      ).then(() => {}),
    [
      projectId,
      fragmentId,
      discardFragment,
      invalidateFragment,
      invalidateSequences,
      invalidateActionLog,
      onDiscarded,
    ],
  );

  const handleRestore = useCallback(
    () =>
      restoreFragment(
        { projectId, fragmentId },
        {
          onSuccess: () => {
            invalidateFragment();
            // Restore does not re-place the fragment, but the discard cascade
            // transiently desynced the sequence index — refresh so any read-only
            // import-sequence that still lists it renders from fresh data.
            invalidateSequences();
            invalidateActionLog();
          },
        },
      ).then(() => {}),
    [
      projectId,
      fragmentId,
      restoreFragment,
      invalidateFragment,
      invalidateSequences,
      invalidateActionLog,
    ],
  );

  const commands = useCommands();
  useCommandScope(fragmentEditorScope, {
    hasFragment: !!fragment,
    isDiscarded: !!fragment?.isDiscarded,
    discard: handleDiscard,
    restore: handleRestore,
    sequences: placeableSequences,
    activeFragmentUuid: fragmentId,
    openPlaceInSequence,
    // Save-before-split: persist the open fragment (no-op when clean) so the split reads fresh
    // vault content. Rejects on failure, which aborts the split command.
    save: async () => {
      await shellRef.current?.save();
    },
    openSplit,
    attachedAspectKeys,
    previewAspect,
  });

  // The linked pair's single "restore from server": revert both the fragment and the Margin to the
  // last saved state and drop both swap buffers, atomically. Never one without the other.
  const handlePairRestore = useCallback(() => {
    shellRef.current?.restoreFromServer();
    marginEditor.revertToServer();
    setPairConflictResolution("kept");
    void marginSwap.clear();
  }, [marginEditor, marginSwap]);

  // The pair's explicit "Restore backup" for a conflicting recovery: apply both held-back backups
  // together (the shell no-ops if its side has none / already applied; same for the Margin), so the
  // pair restores atomically — never one without the other.
  const handlePairRestoreBackup = useCallback(() => {
    shellRef.current?.restoreBackup();
    if (marginSwap.recovery && !marginRecoveryAppliedRef.current) {
      marginRecoveryAppliedRef.current = true;
      marginEditor.applySerialized(marginSwap.recovery.content);
    }
    setPairConflictResolution("restored");
  }, [marginEditor, marginSwap.recovery]);

  // One recovery offer covers the pair; surface whichever side cached most recently for the label.
  // Either side conflicting makes the whole pair a conflict — the pair restores together, so a
  // silent auto-apply of one side alongside an explicit choice on the other would tear the pair.
  const pairRecovery = useMemo(() => {
    const fragmentAt = fragmentRecovery?.at ?? null;
    const marginAt = marginSwap.recovery?.at ?? null;
    if (!fragmentAt && !marginAt) return null;
    const at =
      fragmentAt && marginAt
        ? fragmentAt > marginAt
          ? fragmentAt
          : marginAt
        : (fragmentAt ?? marginAt!);
    const isConflict =
      (fragmentRecovery?.isConflict ?? false) || (marginSwap.recovery?.isConflict ?? false);
    return { at, isConflict };
  }, [fragmentRecovery, marginSwap.recovery]);

  // The "Comment this block" gesture is now a *jump*: it moves focus to the margin slot beside the
  // paragraph at the cursor (the comment if one exists, otherwise the empty slot ready for
  // type-to-create). Creation itself is implicit — typing in the slot conjures the marker + comment.
  const handleCommentBlock = useCallback(() => {
    const block = shellRef.current?.getCurrentBlock();
    if (!block) return;
    marginColumnRef.current?.focusSlot({ index: block.index, markerId: block.markerId });
  }, []);

  useCommandScope(marginScope, {
    hasFragment: !!fragment,
    commentBlock: handleCommentBlock,
  });

  // The editor operations the Margin column drives (anchor edits, reveal/focus, reciprocal highlight,
  // geometry), all delegating to the shell handle. Reciprocal cue: the Margin highlights the bound
  // paragraph (hover/focus a comment), and the editor reports the caret's block (`activeBlockMarker`,
  // set via `onActiveBlockChange`) so the Margin highlights the matching comment back.
  const bridge = useFragmentMarginBridge(shellRef);
  const [activeBlockMarker, setActiveBlockMarker] = useState<string | null>(null);

  const extraActions = useMemo(() => {
    const discardButton = (
      <Button
        size="sm"
        variant="outline"
        disabled={isActionPending}
        onClick={() =>
          commands.run(fragment?.isDiscarded ? "fragment:restore" : "fragment:discard")
        }
      >
        {fragment?.isDiscarded
          ? isRestorePending
            ? "Restoring…"
            : "Restore"
          : isDiscardPending
            ? "Discarding…"
            : "Discard"}
      </Button>
    );

    // The editor's navigation slot: consistent Previous/Next, rendered only when a
    // view supplies it. The buttons dispatch the view's own composed commands.
    const defaultExtraActions = (
      <>
        {navigation && <EditorNavigationControls {...navigation} />}
        {discardButton}
      </>
    );

    return customizeExtraActions ? customizeExtraActions(defaultExtraActions) : defaultExtraActions;
  }, [
    isActionPending,
    isDiscardPending,
    isRestorePending,
    fragment?.isDiscarded,
    commands,
    customizeExtraActions,
    navigation,
  ]);

  if (editor.isLoading) {
    return <p>Loading fragment…</p>;
  }

  if (editor.isError || !fragment) {
    return <p>Failed to load fragment.</p>;
  }

  const discardedBanner = fragment.isDiscarded ? (
    <div className="rounded border border-muted bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
      This fragment is discarded.
    </div>
  ) : undefined;

  // The shell's own fragment banner is suppressed; this single banner covers the linked pair and
  // restores both fragment and Margin together.
  // One "not backed up" warning covers the linked pair — either side's swap failing means unsaved
  // work is unprotected.
  const pairBackupFailed = fragmentBackupFailed || marginSwap.backupFailed;
  const pairBanner = (
    <>
      {pairRecovery &&
        (pairRecovery.isConflict ? (
          pairConflictResolution === null && (
            <ConflictingBackupBanner
              cachedAt={pairRecovery.at}
              onRestoreBackup={handlePairRestoreBackup}
              onDiscardBackup={handlePairRestore}
            />
          )
        ) : (
          <UnsavedRecoveryBanner cachedAt={pairRecovery.at} onDismiss={handlePairRestore} />
        ))}
      {pairBackupFailed && <BackupFailedBanner />}
      {discardedBanner}
    </>
  );

  return (
    <>
      <EntityEditorShell
        ref={shellRef}
        label="Fragment"
        projectId={projectId}
        entityKind="fragment"
        entityUUID={fragmentId}
        entityKey={fragment.key}
        content={fragment.content}
        isPending={isActionPending}
        isDirty={isDirty}
        fragmentLanguage={fragment.language}
        backNode={backNode}
        banner={pairBanner}
        suppressRecoveryBanner
        onRecoveryChange={setFragmentRecovery}
        onBackupFailedChange={setFragmentBackupFailed}
        extraActions={extraActions}
        sidebarCollapsible={sidebarCollapsible}
        enableFocusMode
        onLiveContentChange={setFragmentContent}
        onActiveBlockChange={setActiveBlockMarker}
        rightPanel={
          showMargin ? (
            <Tabs
              value={gutterTab}
              onValueChange={(value) => setGutterTab(value as "margin" | "aspect" | "notes")}
              className="relative flex min-h-0 min-w-0 flex-1 flex-col"
            >
              {/* The switcher floats top-right with no layout footprint: the Margin scroller is
                  deliberately flush to the editor's first line, so any chrome *above* it would shift
                  every comment down out of alignment. Floating keeps the Margin flush; the Aspect
                  panel is padded to clear it. */}
              <TabsList className="absolute right-0 top-0 z-10 w-auto rounded-md border border-border bg-background/95 p-0.5 shadow-sm backdrop-blur">
                <TabsTrigger
                  value="margin"
                  className="rounded border-0 px-2 py-0.5 text-xs data-[state=active]:border-transparent data-[state=active]:bg-muted"
                >
                  Margin
                </TabsTrigger>
                <TabsTrigger
                  value="aspect"
                  className="rounded border-0 px-2 py-0.5 text-xs data-[state=active]:border-transparent data-[state=active]:bg-muted"
                >
                  Aspects
                </TabsTrigger>
                <TabsTrigger
                  value="notes"
                  className="rounded border-0 px-2 py-0.5 text-xs data-[state=active]:border-transparent data-[state=active]:bg-muted"
                >
                  Notes
                </TabsTrigger>
              </TabsList>
              {/* The Margin holds in-progress comment drafts + scroll-sync state, so it is force-mounted
                  and merely hidden when the Aspect tab is active — never unmounted. Its geometry is
                  driven by the always-visible editor, so hiding the column does not corrupt alignment. */}
              <TabsContent
                value="margin"
                forceMount
                className={cn(
                  "mt-0 flex min-h-0 min-w-0 flex-1 flex-col",
                  gutterTab !== "margin" && "hidden",
                )}
              >
                <MarginColumn
                  ref={marginColumnRef}
                  projectId={projectId}
                  marginEditor={marginEditor}
                  fragmentContent={fragmentContent}
                  fragmentDirty={isProseDirty}
                  mode={marginMode}
                  fontSize={editorConfig.fontSize}
                  marginFontSize={editorConfig.marginFontSize}
                  onCommentBlock={() => commands.run("margin:comment-block")}
                  addAnchorAtBlock={bridge.addAnchorAtBlock}
                  removeAnchor={bridge.removeAnchor}
                  revealAnchor={bridge.revealAnchor}
                  focusAnchorBlock={bridge.focusAnchorBlock}
                  highlightAnchor={bridge.highlightAnchor}
                  highlightedMarkerId={activeBlockMarker}
                  getScrollElement={bridge.getScrollElement}
                  getBlocks={bridge.getBlocks}
                />
              </TabsContent>
              <TabsContent
                value="aspect"
                className="mt-0 min-h-0 min-w-0 flex-1 overflow-y-auto pt-9"
              >
                <AspectReaderTab
                  projectId={projectId}
                  fragment={fragment}
                  expandedAspectKey={expandedAspectKey}
                  onToggle={toggleAspect}
                />
              </TabsContent>
              {/* Notes is force-mounted (and hidden when inactive) so its in-progress edit state — the
                  active slot editor + caret — survives switching to another gutter tab, matching the
                  Margin. The notes text itself lives in `marginEditor` and saves with the fragment
                  (coupled save), so the surface can move without touching the save/swap pipeline. The
                  content is padded to clear the floating tab switcher, like the Aspect tab. */}
              <TabsContent
                value="notes"
                forceMount
                className={cn(
                  "mt-0 min-h-0 min-w-0 flex-1 overflow-y-auto pt-9",
                  gutterTab !== "notes" && "hidden",
                )}
              >
                <MarginNotesTab
                  notes={marginEditor.notes}
                  mode={marginMode}
                  fontSize={editorConfig.marginFontSize}
                  onChange={marginEditor.setNotes}
                />
              </TabsContent>
            </Tabs>
          ) : undefined
        }
        onProseChange={() => setIsProseDirty(true)}
        onSaved={() => {
          setIsProseDirty(false);
          onSaved?.();
        }}
        onContentRevert={() => setIsProseDirty(false)}
        onKeySave={editor.onKeySave}
        onContentSave={onContentSave}
        sidebar={
          <div className="flex flex-col gap-4">
            <FragmentMetadataForm
              fragment={fragment}
              projectId={projectId}
              canPreviewAspects={showMargin}
            />
            <Separator />
            <BacklinksPanel projectId={projectId} targetType="fragment" targetKey={fragment.key} />
            <Separator />
            <FragmentSequenceMembership projectId={projectId} fragmentId={fragmentId} />
            {showFragmentStats && (
              <>
                <Separator />
                <FragmentStatsInspector projectId={projectId} fragmentId={fragmentId} />
              </>
            )}
          </div>
        }
      />
      {placeInSequenceId && (
        <PlaceInSequenceModal
          projectId={projectId}
          fragmentId={fragmentId}
          sequenceId={placeInSequenceId}
          open={isPlaceInSequenceOpen}
          onOpenChange={setIsPlaceInSequenceOpen}
        />
      )}
      {isSplitOpen && (
        <SplitFragmentDialog
          projectId={projectId}
          fragmentId={fragmentId}
          open={isSplitOpen}
          onOpenChange={setIsSplitOpen}
        />
      )}
    </>
  );
});

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
  useGetFragment,
  useUpdateFragment,
  useDiscardFragment,
  useRestoreFragment,
  getGetFragmentQueryKey,
  getListFragmentsQueryKey,
} from "@api/generated/fragments/fragments";
import { useGetProject } from "@api/generated/projects/projects";
import { useListSequences } from "@api/generated/sequences/sequences";
import { getGetFragmentStatsQueryKey } from "@api/generated/stats/stats";
import { useInvalidateActionLog } from "@api/action-log";
import { toast } from "sonner";
import { useProjectEditorConfig } from "@hooks/useProjectEditorConfig";
import type { EditorMode } from "@components/margins/slot-editor";
import { FragmentMetadataForm } from "./fragment-metadata-form";
import { FragmentSequenceMembership } from "./fragment-sequence-membership";
import { FragmentStatsInspector } from "./fragment-stats-inspector";
import { PlaceInSequenceModal } from "@components/sequences/PlaceInSequenceModal";
import { Button } from "@components/ui/button";
import { EntityEditorShell, type EntityEditorShellHandle } from "@components/entity-editor-shell";
import { MarginColumn, type MarginColumnHandle } from "@components/margins/margin-column";
import { UnsavedRecoveryBanner } from "@components/unsaved-recovery-banner";
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

type Props = {
  projectId: string;
  fragmentId: string;
  sidebarCollapsible?: boolean;
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
    onDirtyChange,
    onSaved,
    onDiscarded,
    customizeExtraActions,
  },
  ref,
) {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading, isError } = useGetFragment(projectId, fragmentId);
  const { data: projectEnvelope } = useGetProject(projectId);
  const { data: sequenceBundleEnvelope } = useListSequences(projectId);
  const sequences =
    sequenceBundleEnvelope?.status === 200 ? sequenceBundleEnvelope.data.sequences : [];
  const [placeInSequenceId, setPlaceInSequenceId] = useState<string | null>(null);
  const [isPlaceInSequenceOpen, setIsPlaceInSequenceOpen] = useState(false);
  // Keep `open` separate from the mounted/unmounted decision so Radix can run
  // its own close lifecycle (exit transition + focus restoration) before the
  // dialog tears down. Unmounting on close cuts that short and can drop focus.
  const openPlaceInSequence = useCallback((sequenceId: string) => {
    setPlaceInSequenceId(sequenceId);
    setIsPlaceInSequenceOpen(true);
  }, []);
  const { mutateAsync: updateFragment, isPending: isUpdatePending } = useUpdateFragment();
  const { mutate: discardFragment, isPending: isDiscardPending } = useDiscardFragment();
  const { mutate: restoreFragment, isPending: isRestorePending } = useRestoreFragment();

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
  const [fragmentRecovery, setFragmentRecovery] = useState<{ at: Date } | null>(null);

  // Apply the recovered Margin buffer once, mirroring the shell's fragment-recovery behaviour.
  const marginRecoveryAppliedRef = useRef(false);
  useEffect(() => {
    marginRecoveryAppliedRef.current = false;
  }, [projectId, fragmentId]);
  useEffect(() => {
    if (!marginSwap.recovery) return;
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
  const fragment = envelope?.status === 200 ? envelope.data : null;
  useEffect(() => {
    if (fragment && !isProseDirty) setFragmentContent(fragment.content);
  }, [fragment?.content, isProseDirty]);

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

  const isActionPending = isUpdatePending || isDiscardPending || isRestorePending;

  const invalidateFragment = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetFragmentQueryKey(projectId, fragmentId) });
    queryClient.invalidateQueries({ queryKey: getListFragmentsQueryKey(projectId) });
  }, [queryClient, projectId, fragmentId]);

  const invalidateActionLog = useInvalidateActionLog(projectId);

  const invalidateFragmentStats = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: getGetFragmentStatsQueryKey(projectId, fragmentId),
    });
  }, [queryClient, projectId, fragmentId]);

  const onKeySave = useCallback(
    async (key: string) => {
      const result = await updateFragment({ projectId, fragmentId, data: { key } });
      if (result.status !== 200) {
        throw new Error((result.data as { message?: string }).message ?? "Rename failed.");
      }
      invalidateFragment();
      invalidateActionLog();
    },
    [updateFragment, projectId, fragmentId, invalidateFragment, invalidateActionLog],
  );

  const onContentSave = useCallback(
    async (content: string) => {
      // Coupled save (margins-4 #10, #13): the editor's save persists the fragment and its Margin
      // together. Save the fragment only when its prose changed; always flush a dirty Margin (and
      // drop its swap mirror). Each side still persists on its own next save if the other is clean.
      if (isProseDirty) {
        const result = await updateFragment({
          projectId,
          fragmentId,
          data: { content },
        });
        if (result.status !== 200) {
          throw new Error((result.data as { message?: string }).message ?? "Save failed.");
        }
        invalidateFragment();
        invalidateFragmentStats();
        invalidateActionLog();
      }
      if (marginEditor.isDirty) {
        await marginEditor.save();
        await marginSwap.clear();
      }
    },
    [
      updateFragment,
      projectId,
      fragmentId,
      invalidateFragment,
      invalidateFragmentStats,
      invalidateActionLog,
      isProseDirty,
      marginEditor,
      marginSwap,
    ],
  );

  const handleDiscard = useCallback(() => {
    discardFragment(
      { projectId, fragmentId },
      {
        onSuccess: () => {
          invalidateFragment();
          invalidateActionLog();
          onDiscarded?.();
        },
      },
    );
  }, [projectId, fragmentId, discardFragment, invalidateFragment, invalidateActionLog]);

  const handleRestore = useCallback(() => {
    restoreFragment(
      { projectId, fragmentId },
      {
        onSuccess: () => {
          invalidateFragment();
          invalidateActionLog();
        },
      },
    );
  }, [projectId, fragmentId, restoreFragment, invalidateFragment, invalidateActionLog]);

  const commands = useCommands();
  useCommandScope(fragmentEditorScope, {
    hasFragment: !!fragment,
    isDiscarded: !!fragment?.isDiscarded,
    discard: handleDiscard,
    restore: handleRestore,
    sequences,
    openPlaceInSequence,
  });

  const handleMarginSave = useCallback(async () => {
    try {
      await marginEditor.save();
      // The canonical save succeeded — drop the mirrored buffer.
      await marginSwap.clear();
    } catch {
      toast.error("Couldn't save the margin.");
    }
  }, [marginEditor, marginSwap]);

  // The linked pair's single "restore from server": revert both the fragment and the Margin to the
  // last saved state and drop both swap buffers, atomically. Never one without the other.
  const handlePairRestore = useCallback(() => {
    shellRef.current?.restoreFromServer();
    marginEditor.revertToServer();
    void marginSwap.clear();
  }, [marginEditor, marginSwap]);

  // One recovery offer covers the pair; surface whichever side cached most recently for the label.
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
    return { at };
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
    canSave: marginEditor.isDirty && !marginEditor.isSaving,
    save: () => void handleMarginSave(),
    commentBlock: handleCommentBlock,
  });

  // Editor bridges the margin column drives: marker injection (type-to-create), the coordinated
  // delete strip, reveal/focus, and geometry for scroll-sync + margin-side padding.
  const insertMarkerInBlock = useCallback((blockIndex: number, markerId: string) => {
    shellRef.current?.insertCommentMarkerInBlock(blockIndex, markerId);
  }, []);
  const stripMarker = useCallback((markerId: string) => {
    shellRef.current?.stripCommentMarker(markerId);
  }, []);
  const handleRevealMarker = useCallback((markerId: string) => {
    shellRef.current?.revealCommentMarker(markerId);
  }, []);
  const handleFocusMarkerBlock = useCallback((markerId: string) => {
    shellRef.current?.focusMarkerBlock(markerId);
  }, []);
  const getScrollElement = useCallback(() => shellRef.current?.getScrollElement() ?? null, []);
  const getBlocks = useCallback(() => shellRef.current?.getBlocks() ?? [], []);
  const setBlockSpacers = useCallback(
    (spacers: number[]) => shellRef.current?.setBlockSpacers(spacers),
    [],
  );
  const setEditorTopPadding = useCallback((px: number) => shellRef.current?.setTopPadding(px), []);

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

    return customizeExtraActions ? customizeExtraActions(discardButton) : discardButton;
  }, [
    isUpdatePending,
    isDiscardPending,
    isRestorePending,
    fragment?.isDiscarded,
    handleRestore,
    handleDiscard,
    customizeExtraActions,
  ]);

  if (isLoading) {
    return <p>Loading fragment…</p>;
  }

  if (isError || !fragment) {
    return <p>Failed to load fragment.</p>;
  }

  const discardedBanner = fragment.isDiscarded ? (
    <div className="rounded border border-muted bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
      This fragment is discarded.
    </div>
  ) : undefined;

  // The shell's own fragment banner is suppressed; this single banner covers the linked pair and
  // restores both fragment and Margin together.
  const pairBanner = (
    <>
      {pairRecovery && (
        <UnsavedRecoveryBanner cachedAt={pairRecovery.at} onDismiss={handlePairRestore} />
      )}
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
        banner={pairBanner}
        suppressRecoveryBanner
        onRecoveryChange={setFragmentRecovery}
        extraActions={extraActions}
        sidebarCollapsible={sidebarCollapsible}
        onLiveContentChange={setFragmentContent}
        rightPanel={
          <MarginColumn
            ref={marginColumnRef}
            projectId={projectId}
            marginEditor={marginEditor}
            fragmentContent={fragmentContent}
            mode={marginMode}
            fontSize={editorConfig.fontSize}
            onCommentBlock={() => commands.run("margin:comment-block")}
            insertMarkerInBlock={insertMarkerInBlock}
            stripMarker={stripMarker}
            revealMarker={handleRevealMarker}
            focusMarkerBlock={handleFocusMarkerBlock}
            getScrollElement={getScrollElement}
            getBlocks={getBlocks}
            setBlockSpacers={setBlockSpacers}
            setEditorTopPadding={setEditorTopPadding}
          />
        }
        onProseChange={() => setIsProseDirty(true)}
        onSaved={() => {
          setIsProseDirty(false);
          onSaved?.();
        }}
        onContentRevert={() => setIsProseDirty(false)}
        onKeySave={onKeySave}
        onContentSave={onContentSave}
        sidebar={
          <div className="flex flex-col gap-4">
            <FragmentMetadataForm fragment={fragment} projectId={projectId} />
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
    </>
  );
});

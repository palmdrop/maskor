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
import { extractCommentMarkerIds, createCommentMarkerId } from "@maskor/shared";
import { FragmentMetadataForm } from "./fragment-metadata-form";
import { FragmentSequenceMembership } from "./fragment-sequence-membership";
import { FragmentStatsInspector } from "./fragment-stats-inspector";
import { PlaceInSequenceModal } from "@components/sequences/PlaceInSequenceModal";
import { Button } from "@components/ui/button";
import { EntityEditorShell, type EntityEditorShellHandle } from "@components/entity-editor-shell";
import { MarginPanel, type MarginPanelHandle } from "@components/margins/margin-panel";
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
  const marginPanelRef = useRef<MarginPanelHandle>(null);

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
  const isDirty = isProseDirty;

  // Live fragment body, tracked so the Margin panel can derive the fragment's anchor markers (for
  // comment ordering and orphan detection). Seeded from the server fragment; updated on each edit.
  const [fragmentContent, setFragmentContent] = useState("");
  const fragment = envelope?.status === 200 ? envelope.data : null;
  useEffect(() => {
    if (fragment && !isProseDirty) setFragmentContent(fragment.content);
  }, [fragment?.content, isProseDirty]);
  const fragmentMarkerIds = useMemo(
    () => extractCommentMarkerIds(fragmentContent),
    [fragmentContent],
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
    },
    [
      updateFragment,
      projectId,
      fragmentId,
      invalidateFragment,
      invalidateFragmentStats,
      invalidateActionLog,
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

  // The comment gesture: coordinated buffer edits in both panels (the marker into the fragment, the
  // stub into the Margin) with no force-flush — the marker persists on the next fragment save, the
  // stub on the next Margin save — then focus moves to the Margin so the writer can type immediately.
  const handleCommentBlock = useCallback(() => {
    const block = shellRef.current?.getCurrentBlock();
    const markerId = createCommentMarkerId();
    shellRef.current?.appendCommentMarker(markerId);
    marginEditor.addCommentStub({ markerId, excerpt: block?.text ?? "", body: "" });
    marginPanelRef.current?.focusComment(markerId);
  }, [marginEditor]);

  useCommandScope(marginScope, {
    hasFragment: !!fragment,
    canSave: marginEditor.isDirty && !marginEditor.isSaving,
    save: () => void handleMarginSave(),
    commentBlock: handleCommentBlock,
  });

  const handleRevealMarker = useCallback((markerId: string) => {
    shellRef.current?.revealCommentMarker(markerId);
  }, []);

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
          <MarginPanel
            ref={marginPanelRef}
            projectId={projectId}
            marginEditor={marginEditor}
            fragmentMarkerIds={fragmentMarkerIds}
            onSave={() => commands.run("margin:save")}
            onCommentBlock={() => commands.run("margin:comment-block")}
            onRevealMarker={handleRevealMarker}
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

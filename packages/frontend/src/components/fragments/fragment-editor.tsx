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
import { FragmentMetadataForm } from "./fragment-metadata-form";
import { FragmentSequenceMembership } from "./fragment-sequence-membership";
import { FragmentStatsInspector } from "./fragment-stats-inspector";
import { PlaceInSequenceModal } from "@components/sequences/PlaceInSequenceModal";
import { Button } from "@components/ui/button";
import { EntityEditorShell, type EntityEditorShellHandle } from "@components/entity-editor-shell";
import { Separator } from "@components/ui/separator";
import { useCommands } from "../../lib/commands/useCommands";
import { useCommandScope } from "../../lib/commands/useCommandScope";
import { fragmentEditorScope } from "../../lib/commands/scopes/fragment-editor";

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
  const { mutateAsync: updateFragment, isPending: isUpdatePending } = useUpdateFragment();
  const { mutate: discardFragment, isPending: isDiscardPending } = useDiscardFragment();
  const { mutate: restoreFragment, isPending: isRestorePending } = useRestoreFragment();

  const showFragmentStats =
    projectEnvelope?.status === 200 ? projectEnvelope.data.advanced.showFragmentStats : false;

  const shellRef = useRef<EntityEditorShellHandle>(null);

  const [isProseDirty, setIsProseDirty] = useState(false);
  const isDirty = isProseDirty;

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

  const fragment = envelope?.status === 200 ? envelope.data : null;

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
    openPlaceInSequence: setPlaceInSequenceId,
  });

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
        banner={discardedBanner}
        extraActions={extraActions}
        sidebarCollapsible={sidebarCollapsible}
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
          open
          onOpenChange={(next) => {
            if (!next) setPlaceInSequenceId(null);
          }}
        />
      )}
    </>
  );
});

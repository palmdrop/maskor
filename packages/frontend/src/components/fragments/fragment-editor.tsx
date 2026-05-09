import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetFragment,
  useUpdateFragment,
  useDiscardFragment,
  useRestoreFragment,
  getGetFragmentQueryKey,
  getListFragmentsQueryKey,
} from "../../api/generated/fragments/fragments";
import { useGetProject } from "../../api/generated/projects/projects";
import { getGetFragmentStatsQueryKey } from "../../api/generated/stats/stats";
import { useInvalidateActionLog } from "../../api/action-log";
import { FragmentMetadataForm, type FragmentMetadataFormHandle } from "./fragment-metadata-form";
import { FragmentStatsInspector } from "./fragment-stats-inspector";
import { Button } from "../ui/button";
import { EntityEditorShell, type EntityEditorShellHandle } from "../entity-editor-shell";
import { Separator } from "../ui/separator";

export type FragmentEditorHandle = {
  save: () => Promise<void>;
};

type Props = {
  projectId: string;
  fragmentId: string;
  sidebarCollapsible?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  onSaved?: () => void;
};

export const FragmentEditor = forwardRef<FragmentEditorHandle, Props>(function FragmentEditor(
  { projectId, fragmentId, sidebarCollapsible, onDirtyChange, onSaved },
  ref,
) {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading, isError } = useGetFragment(projectId, fragmentId);
  const { data: projectEnvelope } = useGetProject(projectId);
  const { mutateAsync: updateFragment, isPending: isUpdatePending } = useUpdateFragment();
  const { mutate: discardFragment, isPending: isDiscardPending } = useDiscardFragment();
  const { mutate: restoreFragment, isPending: isRestorePending } = useRestoreFragment();

  const showFragmentStats =
    projectEnvelope?.status === 200 ? projectEnvelope.data.advanced.showFragmentStats : false;

  const metadataFormRef = useRef<FragmentMetadataFormHandle>(null);
  const shellRef = useRef<EntityEditorShellHandle>(null);

  const [isProseDirty, setIsProseDirty] = useState(false);
  const [isMetadataDirty, setIsMetadataDirty] = useState(false);
  const isDirty = isProseDirty || isMetadataDirty;

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
      const metadataUpdate = await metadataFormRef.current?.getValidatedValues();
      if (!metadataUpdate) {
        throw new Error("Metadata validation failed.");
      }
      const result = await updateFragment({
        projectId,
        fragmentId,
        data: { ...metadataUpdate, content },
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

  if (isLoading) {
    return <p>Loading fragment…</p>;
  }

  if (isError || !fragment) {
    return <p>Failed to load fragment.</p>;
  }

  const extraActions = fragment.isDiscarded ? (
    <Button size="sm" variant="outline" disabled={isActionPending} onClick={handleRestore}>
      {isRestorePending ? "Restoring…" : "Restore"}
    </Button>
  ) : (
    <Button size="sm" variant="outline" disabled={isActionPending} onClick={handleDiscard}>
      {isDiscardPending ? "Discarding…" : "Discard"}
    </Button>
  );

  const discardedBanner = fragment.isDiscarded ? (
    <div className="rounded border border-muted bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
      This fragment is discarded.
    </div>
  ) : undefined;

  return (
    <EntityEditorShell
      ref={shellRef}
      label="Fragment"
      projectId={projectId}
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
      onKeySave={onKeySave}
      onContentSave={onContentSave}
      sidebar={
        <div className="flex flex-col gap-4">
          <FragmentMetadataForm
            ref={metadataFormRef}
            fragment={fragment}
            projectId={projectId}
            onDirtyChange={setIsMetadataDirty}
          />
          {showFragmentStats && (
            <>
              <Separator />
              <FragmentStatsInspector projectId={projectId} fragmentId={fragmentId} />
            </>
          )}
        </div>
      }
    />
  );
});

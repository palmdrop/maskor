import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetFragment,
  useUpdateFragment,
  useDiscardFragment,
  useRestoreFragment,
  getGetFragmentQueryKey,
  getListFragmentsQueryKey,
} from "../../api/generated/fragments/fragments";
import { FragmentMetadataForm, type FragmentMetadataFormHandle } from "./fragment-metadata-form";
import { Button } from "../ui/button";
import { EntityEditorShell } from "../entity-editor-shell";

type Props = {
  projectId: string;
  fragmentId: string;
  onDirtyChange?: (isDirty: boolean) => void;
};

export const FragmentEditor = ({ projectId, fragmentId, onDirtyChange }: Props) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading, isError } = useGetFragment(projectId, fragmentId);
  const { mutateAsync: updateFragment, isPending: isUpdatePending } = useUpdateFragment();
  const { mutate: discardFragment, isPending: isDiscardPending } = useDiscardFragment();
  const { mutate: restoreFragment, isPending: isRestorePending } = useRestoreFragment();

  const metadataFormRef = useRef<FragmentMetadataFormHandle>(null);

  const [isProseDirty, setIsProseDirty] = useState(false);
  const [isMetadataDirty, setIsMetadataDirty] = useState(false);
  const isDirty = isProseDirty || isMetadataDirty;

  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  useEffect(() => {
    onDirtyChangeRef.current?.(isDirty);
  }, [isDirty]);

  const fragment = envelope?.status === 200 ? envelope.data : null;

  const isActionPending = isUpdatePending || isDiscardPending || isRestorePending;

  const invalidateFragment = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetFragmentQueryKey(projectId, fragmentId) });
    queryClient.invalidateQueries({ queryKey: getListFragmentsQueryKey(projectId) });
  }, [queryClient, projectId, fragmentId]);

  const onKeySave = useCallback(
    async (key: string) => {
      const result = await updateFragment({ projectId, fragmentId, data: { key } });
      if (result.status !== 200) {
        throw new Error((result.data as { message?: string }).message ?? "Rename failed.");
      }
      invalidateFragment();
    },
    [updateFragment, projectId, fragmentId, invalidateFragment],
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
    },
    [updateFragment, projectId, fragmentId, invalidateFragment],
  );

  const handleDiscard = useCallback(() => {
    discardFragment({ projectId, fragmentId }, { onSuccess: invalidateFragment });
  }, [projectId, fragmentId, discardFragment, invalidateFragment]);

  const handleRestore = useCallback(() => {
    restoreFragment({ projectId, fragmentId }, { onSuccess: invalidateFragment });
  }, [projectId, fragmentId, restoreFragment, invalidateFragment]);

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
      label="Fragment"
      projectId={projectId}
      entityKey={fragment.key}
      content={fragment.content}
      isPending={isActionPending}
      isDirty={isDirty}
      banner={discardedBanner}
      extraActions={extraActions}
      onProseChange={() => setIsProseDirty(true)}
      onSaved={() => setIsProseDirty(false)}
      onKeySave={onKeySave}
      onContentSave={onContentSave}
      sidebar={
        <FragmentMetadataForm
          ref={metadataFormRef}
          fragment={fragment}
          projectId={projectId}
          onDirtyChange={setIsMetadataDirty}
        />
      }
    />
  );
};

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetReference,
  useUpdateReference,
  getGetReferenceQueryKey,
  getListReferencesQueryKey,
} from "../../../api/generated/references/references";
import { EntityEditorShell } from "../../../components/entity-editor-shell";

type Props = {
  projectId: string;
  referenceId: string;
  fragmentId?: string;
};

export const ReferenceEditor = ({ projectId, referenceId, fragmentId }: Props) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading, isError } = useGetReference(projectId, referenceId);
  const { mutateAsync: updateReference, isPending } = useUpdateReference();
  const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);

  const reference = envelope?.status === 200 ? envelope.data : null;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetReferenceQueryKey(projectId, referenceId) });
    queryClient.invalidateQueries({ queryKey: getListReferencesQueryKey(projectId) });
  }, [queryClient, projectId, referenceId]);

  const onKeySave = useCallback(
    async (key: string) => {
      const result = await updateReference({ projectId, referenceId, data: { key } });
      if (result.status !== 200) {
        throw new Error((result.data as { message?: string }).message ?? "Rename failed.");
      }
      const { warnings } = result.data;
      setCascadeWarnings(warnings.fragments);
      invalidate();
    },
    [updateReference, projectId, referenceId, invalidate],
  );

  const onContentSave = useCallback(
    async (content: string) => {
      const result = await updateReference({ projectId, referenceId, data: { content } });
      if (result.status !== 200) {
        throw new Error((result.data as { message?: string }).message ?? "Save failed.");
      }
      invalidate();
    },
    [updateReference, projectId, referenceId, invalidate],
  );

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !reference)
    return <p className="text-sm text-muted-foreground">Failed to load reference.</p>;

  return (
    <EntityEditorShell
      label="Reference"
      projectId={projectId}
      fragmentId={fragmentId}
      configTab="references"
      entityKey={reference.key}
      content={reference.content}
      isPending={isPending}
      cascadeWarnings={cascadeWarnings}
      onDismissWarnings={() => setCascadeWarnings([])}
      onKeySave={onKeySave}
      onContentSave={onContentSave}
    />
  );
};

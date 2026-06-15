import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListReferences,
  useCreateReference,
  useDeleteReference,
  getListReferencesQueryKey,
} from "@api/generated/references/references";
import { AttachableEntityPanel } from "@components/attachable-entity-panel";
import { useCommands } from "@lib/commands/useCommands";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { referencesPanelScope } from "@lib/commands/scopes/config-entities";

export const ReferencesTab = ({ projectId }: { projectId: string }) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading } = useListReferences(projectId);
  const createReference = useCreateReference();
  const deleteReference = useDeleteReference();
  const commands = useCommands();

  const items =
    envelope?.status === 200
      ? envelope.data.map((r) => ({
          uuid: r.uuid,
          label: r.key,
          category: r.category,
          editTo: `/projects/${projectId}/references/${r.uuid}`,
        }))
      : [];

  const handleCreate = async (key: string, content: string) => {
    await createReference.mutateAsync({ projectId, data: { key, content } });
    queryClient.invalidateQueries({ queryKey: getListReferencesQueryKey(projectId) });
  };

  const deleteReferenceAction = useCallback(
    async (referenceId: string) => {
      await deleteReference.mutateAsync({ projectId, referenceId });
      await queryClient.invalidateQueries({ queryKey: getListReferencesQueryKey(projectId) });
    },
    [deleteReference, projectId, queryClient],
  );

  useCommandScope(referencesPanelScope, {
    references: items.map((item) => ({ uuid: item.uuid, label: item.label })),
    deleteReference: deleteReferenceAction,
  });

  return (
    <AttachableEntityPanel
      items={items}
      isLoading={isLoading}
      labelField="Key"
      dialogTitle="New reference"
      entityName="reference"
      onConfirmCreate={handleCreate}
      onDelete={(item) => commands.run("references:delete", item)}
      isCreating={createReference.isPending}
    />
  );
};

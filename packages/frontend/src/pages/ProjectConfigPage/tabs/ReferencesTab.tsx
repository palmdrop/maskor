import { useQueryClient } from "@tanstack/react-query";
import {
  useListReferences,
  useCreateReference,
  useDeleteReference,
  getListReferencesQueryKey,
} from "../../../api/generated/references/references";
import { AttachableEntityPanel } from "../../../components/attachable-entity-panel";

export const ReferencesTab = ({ projectId }: { projectId: string }) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading } = useListReferences(projectId);
  const createReference = useCreateReference();
  const deleteReference = useDeleteReference();

  const items =
    envelope?.status === 200
      ? envelope.data.map((r) => ({
          uuid: r.uuid,
          label: r.name,
          editTo: `/projects/${projectId}/references/${r.uuid}`,
        }))
      : [];

  const handleCreate = async (name: string, content: string) => {
    await createReference.mutateAsync({ projectId, data: { name, content } });
    queryClient.invalidateQueries({ queryKey: getListReferencesQueryKey(projectId) });
  };

  const handleDelete = async (referenceId: string) => {
    await deleteReference.mutateAsync({ projectId, referenceId });
    queryClient.invalidateQueries({ queryKey: getListReferencesQueryKey(projectId) });
  };

  return (
    <AttachableEntityPanel
      items={items}
      isLoading={isLoading}
      labelField="Name"
      dialogTitle="New reference"
      onConfirmCreate={handleCreate}
      onDelete={handleDelete}
      isCreating={createReference.isPending}
    />
  );
};

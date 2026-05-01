import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotes,
  useCreateNote,
  useDeleteNote,
  getListNotesQueryKey,
} from "../../../api/generated/notes/notes";
import { AttachableEntityPanel } from "../../../components/attachable-entity-panel";

export const NotesTab = ({ projectId }: { projectId: string }) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading } = useListNotes(projectId);
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();

  const items =
    envelope?.status === 200
      ? envelope.data.map((n) => ({
          uuid: n.uuid,
          label: n.key,
          editTo: `/projects/${projectId}/notes/${n.uuid}`,
        }))
      : [];

  const handleCreate = async (key: string, content: string) => {
    await createNote.mutateAsync({ projectId, data: { key, content } });
    queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(projectId) });
  };

  const handleDelete = async (noteId: string) => {
    await deleteNote.mutateAsync({ projectId, noteId });
    queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(projectId) });
  };

  return (
    <AttachableEntityPanel
      items={items}
      isLoading={isLoading}
      labelField="Key"
      dialogTitle="New note"
      onConfirmCreate={handleCreate}
      onDelete={handleDelete}
      isCreating={createNote.isPending}
    />
  );
};

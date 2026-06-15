import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotes,
  useCreateNote,
  useDeleteNote,
  getListNotesQueryKey,
} from "@api/generated/notes/notes";
import { AttachableEntityPanel } from "@components/attachable-entity-panel";
import { useCommands } from "@lib/commands/useCommands";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { notesPanelScope } from "@lib/commands/scopes/config-entities";

export const NotesTab = ({ projectId }: { projectId: string }) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading } = useListNotes(projectId);
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();
  const commands = useCommands();

  const items =
    envelope?.status === 200
      ? envelope.data.map((n) => ({
          uuid: n.uuid,
          label: n.key,
          category: n.category,
          editTo: `/projects/${projectId}/notes/${n.uuid}`,
        }))
      : [];

  const handleCreate = async (key: string, content: string) => {
    await createNote.mutateAsync({ projectId, data: { key, content } });
    queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(projectId) });
  };

  const deleteNoteAction = useCallback(
    async (noteId: string) => {
      await deleteNote.mutateAsync({ projectId, noteId });
      await queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(projectId) });
    },
    [deleteNote, projectId, queryClient],
  );

  useCommandScope(notesPanelScope, {
    notes: items.map((item) => ({ uuid: item.uuid, label: item.label })),
    deleteNote: deleteNoteAction,
  });

  return (
    <AttachableEntityPanel
      items={items}
      isLoading={isLoading}
      labelField="Key"
      dialogTitle="New note"
      entityName="note"
      onConfirmCreate={handleCreate}
      onDelete={(item) => commands.run("notes:delete", item)}
      isCreating={createNote.isPending}
    />
  );
};

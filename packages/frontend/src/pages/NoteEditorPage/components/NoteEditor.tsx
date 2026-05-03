import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetNote,
  useUpdateNote,
  getGetNoteQueryKey,
  getListNotesQueryKey,
} from "../../../api/generated/notes/notes";
import { EntityEditorShell } from "../../../components/entity-editor-shell";

type Props = {
  projectId: string;
  noteId: string;
  fragmentId?: string;
};

export const NoteEditor = ({ projectId, noteId, fragmentId }: Props) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading, isError } = useGetNote(projectId, noteId);
  const { mutateAsync: updateNote, isPending } = useUpdateNote();
  const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);

  const note = envelope?.status === 200 ? envelope.data : null;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetNoteQueryKey(projectId, noteId) });
    queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(projectId) });
  }, [queryClient, projectId, noteId]);

  const onKeySave = useCallback(
    async (key: string) => {
      const result = await updateNote({ projectId, noteId, data: { key } });
      if (result.status !== 200) {
        throw new Error((result.data as { message?: string }).message ?? "Rename failed.");
      }
      const { warnings } = result.data;
      setCascadeWarnings([...warnings.fragments, ...warnings.aspects]);
      invalidate();
    },
    [updateNote, projectId, noteId, invalidate],
  );

  const onContentSave = useCallback(
    async (content: string) => {
      const result = await updateNote({ projectId, noteId, data: { content } });
      if (result.status !== 200) {
        throw new Error((result.data as { message?: string }).message ?? "Save failed.");
      }
      invalidate();
    },
    [updateNote, projectId, noteId, invalidate],
  );

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !note)
    return <p className="text-sm text-muted-foreground">Failed to load note.</p>;

  return (
    <EntityEditorShell
      label="Note"
      projectId={projectId}
      fragmentId={fragmentId}
      configTab="notes"
      entityKey={note.key}
      content={note.content}
      isPending={isPending}
      cascadeWarnings={cascadeWarnings}
      onDismissWarnings={() => setCascadeWarnings([])}
      onKeySave={onKeySave}
      onContentSave={onContentSave}
    />
  );
};

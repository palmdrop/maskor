import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetNote,
  useUpdateNote,
  getGetNoteQueryKey,
  getListNotesQueryKey,
} from "../../../api/generated/notes/notes";
import { Button } from "../../../components/ui/button";
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
  const [isDirty, setIsDirty] = useState(false);

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

  const backNode = fragmentId ? (
    <Link
      to="/projects/$projectId/fragments/$fragmentId"
      params={{ projectId, fragmentId }}
    >
      <Button variant="ghost" size="icon-sm">
        <ArrowLeftIcon />
      </Button>
    </Link>
  ) : (
    <Link to="/projects/$projectId/config" params={{ projectId }} search={{ tab: "notes" }}>
      <Button variant="ghost" size="icon-sm">
        <ArrowLeftIcon />
      </Button>
    </Link>
  );

  return (
    <EntityEditorShell
      label="Note"
      projectId={projectId}
      backNode={backNode}
      entityKey={note.key}
      content={note.content}
      isPending={isPending}
      isDirty={isDirty}
      cascadeWarnings={cascadeWarnings}
      onDismissWarnings={() => setCascadeWarnings([])}
      onProseChange={() => setIsDirty(true)}
      onSaved={() => setIsDirty(false)}
      onKeySave={onKeySave}
      onContentSave={onContentSave}
    />
  );
};

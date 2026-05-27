import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetNote,
  useUpdateNote,
  useListNotes,
  getGetNoteQueryKey,
  getListNotesQueryKey,
} from "@api/generated/notes/notes";
import { useInvalidateActionLog } from "@api/action-log";
import { useLiveFieldSave } from "@hooks/useLiveFieldSave";
import type { Note, NoteUpdate } from "@api/generated/maskorAPI.schemas";
import { Button } from "@components/ui/button";
import { CategoryField } from "@components/category-field";
import { EntityEditorShell } from "@components/entity-editor-shell";

type Props = {
  projectId: string;
  noteId: string;
  fragmentId?: string;
};

export const NoteEditor = ({ projectId, noteId, fragmentId }: Props) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading, isError } = useGetNote(projectId, noteId);
  const { mutateAsync: updateNote, isPending } = useUpdateNote();
  const { mutateAsync: updateNoteMetadata } = useUpdateNote();
  const { data: notesListEnvelope } = useListNotes(projectId);
  const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const note = envelope?.status === 200 ? envelope.data : null;

  const noteQueryKey = useMemo(() => getGetNoteQueryKey(projectId, noteId), [projectId, noteId]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: noteQueryKey });
    queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(projectId) });
  }, [queryClient, noteQueryKey, projectId]);

  const invalidateActionLog = useInvalidateActionLog(projectId);

  const makeSave = useCallback(
    <T,>(toPatch: (value: T) => NoteUpdate) =>
      async (value: T) => {
        type CacheEntry = { data: Note; status: number };
        const snapshot = queryClient.getQueryData<CacheEntry>(noteQueryKey);
        if (snapshot?.status === 200) {
          queryClient.setQueryData(noteQueryKey, {
            ...snapshot,
            data: { ...snapshot.data, ...toPatch(value) },
          });
        }
        try {
          const result = await updateNoteMetadata({
            projectId,
            noteId,
            data: toPatch(value),
          });
          if (result.status !== 200) {
            throw new Error((result.data as { message?: string }).message ?? "Save failed.");
          }
          if (snapshot !== undefined) {
            queryClient.setQueryData(noteQueryKey, {
              ...snapshot,
              data: result.data.note,
            });
          }
          queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(projectId) });
        } catch (error) {
          if (snapshot !== undefined) {
            queryClient.setQueryData(noteQueryKey, snapshot);
          }
          invalidate();
          throw error;
        } finally {
          invalidateActionLog();
        }
      },
    [queryClient, noteQueryKey, updateNoteMetadata, projectId, noteId, invalidate, invalidateActionLog],
  );

  const categoryField = useLiveFieldSave({
    serverValue: note?.category ?? null,
    save: makeSave<string | null>((value) => ({ category: value })),
  });

  const existingNoteCategories = useMemo(() => {
    const notes = notesListEnvelope?.status === 200 ? notesListEnvelope.data : [];
    return [...new Set(notes.map((n) => n.category).filter((c): c is string => !!c))];
  }, [notesListEnvelope]);

  const onKeySave = useCallback(
    async (key: string) => {
      const result = await updateNote({ projectId, noteId, data: { key } });
      if (result.status !== 200) {
        throw new Error((result.data as { message?: string }).message ?? "Rename failed.");
      }
      const { warnings } = result.data;
      setCascadeWarnings([...warnings.fragments, ...warnings.aspects]);
      invalidate();
      invalidateActionLog();
    },
    [updateNote, projectId, noteId, invalidate, invalidateActionLog],
  );

  const onContentSave = useCallback(
    async (content: string) => {
      const result = await updateNote({ projectId, noteId, data: { content } });
      if (result.status !== 200) {
        throw new Error((result.data as { message?: string }).message ?? "Save failed.");
      }
      invalidate();
      invalidateActionLog();
    },
    [updateNote, projectId, noteId, invalidate, invalidateActionLog],
  );

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !note)
    return <p className="text-sm text-muted-foreground">Failed to load note.</p>;

  const backNode = fragmentId ? (
    <Link to="/projects/$projectId/fragments/$fragmentId" params={{ projectId, fragmentId }}>
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

  const sidebar = (
    <div className="flex flex-col gap-4">
      <CategoryField
        serverValue={categoryField.value}
        existingCategories={existingNoteCategories}
        onChange={categoryField.onChange}
        error={categoryField.error}
      />
    </div>
  );

  return (
    <EntityEditorShell
      label="Note"
      projectId={projectId}
      entityKind="note"
      entityUUID={noteId}
      backNode={backNode}
      entityKey={note.key}
      content={note.content}
      isPending={isPending}
      isDirty={isDirty}
      cascadeWarnings={cascadeWarnings}
      onDismissWarnings={() => setCascadeWarnings([])}
      onProseChange={() => setIsDirty(true)}
      onSaved={() => setIsDirty(false)}
      onContentRevert={() => setIsDirty(false)}
      onKeySave={onKeySave}
      onContentSave={onContentSave}
      sidebar={sidebar}
    />
  );
};

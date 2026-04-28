import { useCallback, useRef, useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import {
  useGetNote,
  useUpdateNote,
  getGetNoteQueryKey,
  getListNotesQueryKey,
} from "../api/generated/notes/notes";
import { ProseEditor, type ProseEditorHandle } from "../components/fragments/prose-editor";
import { Heading } from "../components/heading";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { useDelayedPending } from "../hooks/useDelayedPending";

type Props = {
  projectId: string;
  noteId: string;
};

const NoteEditor = ({ projectId, noteId }: Props) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading, isError } = useGetNote(projectId, noteId);
  const { mutate: updateNote, isPending: isUpdatePending } = useUpdateNote();

  const proseEditorRef = useRef<ProseEditorHandle>(null);
  const [isDirty, setIsDirty] = useState(false);
  const showSaving = useDelayedPending(isUpdatePending);

  const note = envelope?.status === 200 ? envelope.data : null;

  const handleSave = useCallback(() => {
    if (!note || !isDirty) return;
    const content = proseEditorRef.current?.getContent() ?? note.content;
    updateNote(
      { projectId, noteId, data: { content } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetNoteQueryKey(projectId, noteId) });
          queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(projectId) });
          setIsDirty(false);
        },
      },
    );
  }, [note, isDirty, projectId, noteId, updateNote, queryClient]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !note)
    return <p className="text-sm text-muted-foreground">Failed to load note.</p>;

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/projects/$projectId/config" params={{ projectId }} search={{ tab: "notes" }}>
            <Button variant="ghost" size="icon-sm">
              <ArrowLeftIcon />
            </Button>
          </Link>
          <Heading level={1}>{note.title}</Heading>
        </div>
        <Button
          size="sm"
          disabled={isUpdatePending || !isDirty}
          onClick={handleSave}
          className="min-w-20"
        >
          {showSaving ? "Saving…" : "Save"}
        </Button>
      </div>
      <Separator />
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* TODO: wire vimMode to a real settings/config system */}
        <ProseEditor
          ref={proseEditorRef}
          content={note.content}
          vimMode={false}
          onSave={handleSave}
          onChange={() => setIsDirty(true)}
        />
      </div>
    </div>
  );
};

export const NoteEditorPage = () => {
  const { projectId, noteId } = useParams({ from: "/projects/$projectId/notes/$noteId" });
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden p-6">
      <NoteEditor projectId={projectId} noteId={noteId} />
    </div>
  );
};

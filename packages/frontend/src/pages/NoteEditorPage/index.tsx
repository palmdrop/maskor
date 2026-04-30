import { useParams, useSearch } from "@tanstack/react-router";
import { NoteEditor } from "./components/NoteEditor";

export const NoteEditorPage = () => {
  const { projectId, noteId } = useParams({ from: "/projects/$projectId/notes/$noteId" });
  const { from: fragmentId } = useSearch({ from: "/projects/$projectId/notes/$noteId" });

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden p-6">
      <NoteEditor projectId={projectId} noteId={noteId} fragmentId={fragmentId} />
    </div>
  );
};

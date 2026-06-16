import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useListNotes } from "@api/generated/notes/notes";
import { useLiveFieldSave } from "@hooks/useLiveFieldSave";
import { useEntityEditor } from "@lib/entity-kinds/useEntityEditor";
import { Button } from "@components/ui/button";
import { CategoryField } from "@components/category-field";
import { EntityEditorShell } from "@components/entity-editor-shell";
import { BacklinksPanel } from "@components/document-links/BacklinksPanel";

type Props = {
  projectId: string;
  noteId: string;
  fragmentId?: string;
};

export const NoteEditor = ({ projectId, noteId, fragmentId }: Props) => {
  const editor = useEntityEditor("note", projectId, noteId);
  const { data: notesListEnvelope } = useListNotes(projectId);
  const [isDirty, setIsDirty] = useState(false);

  const note = editor.entity;

  const categoryField = useLiveFieldSave({
    serverValue: note?.category ?? null,
    save: editor.makeFieldSave<string | null>((value) => ({ category: value })),
  });

  const existingNoteCategories = useMemo(() => {
    const notes = notesListEnvelope?.status === 200 ? notesListEnvelope.data : [];
    return [
      ...new Set(
        notes.map((note) => note.category).filter((category): category is string => !!category),
      ),
    ];
  }, [notesListEnvelope]);

  if (editor.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (editor.isError || !note)
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
      <BacklinksPanel projectId={projectId} targetType="note" targetKey={note.key} />
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
      isPending={editor.isPending}
      isDirty={isDirty}
      cascadeWarnings={editor.cascadeWarnings}
      onDismissWarnings={editor.dismissWarnings}
      onProseChange={() => setIsDirty(true)}
      onSaved={() => setIsDirty(false)}
      onContentRevert={() => setIsDirty(false)}
      onKeySave={editor.onKeySave}
      onContentSave={editor.onContentSave}
      sidebar={sidebar}
    />
  );
};

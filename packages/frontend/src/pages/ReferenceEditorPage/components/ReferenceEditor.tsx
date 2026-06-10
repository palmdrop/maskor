import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useListReferences } from "@api/generated/references/references";
import { useLiveFieldSave } from "@hooks/useLiveFieldSave";
import { useEntityEditor } from "@lib/entity-kinds/useEntityEditor";
import { Button } from "@components/ui/button";
import { CategoryField } from "@components/category-field";
import { EntityEditorShell } from "@components/entity-editor-shell";

type Props = {
  projectId: string;
  referenceId: string;
  fragmentId?: string;
};

export const ReferenceEditor = ({ projectId, referenceId, fragmentId }: Props) => {
  const editor = useEntityEditor("reference", projectId, referenceId);
  const { data: referencesListEnvelope } = useListReferences(projectId);
  const [isDirty, setIsDirty] = useState(false);

  const reference = editor.entity;

  const categoryField = useLiveFieldSave({
    serverValue: reference?.category ?? null,
    save: editor.makeFieldSave<string | null>((value) => ({ category: value })),
  });

  const existingReferenceCategories = useMemo(() => {
    const references = referencesListEnvelope?.status === 200 ? referencesListEnvelope.data : [];
    return [
      ...new Set(
        references
          .map((reference) => reference.category)
          .filter((category): category is string => !!category),
      ),
    ];
  }, [referencesListEnvelope]);

  if (editor.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (editor.isError || !reference)
    return <p className="text-sm text-muted-foreground">Failed to load reference.</p>;

  const backNode = fragmentId ? (
    <Link to="/projects/$projectId/fragments/$fragmentId" params={{ projectId, fragmentId }}>
      <Button variant="ghost" size="icon-sm">
        <ArrowLeftIcon />
      </Button>
    </Link>
  ) : (
    <Link to="/projects/$projectId/config" params={{ projectId }} search={{ tab: "references" }}>
      <Button variant="ghost" size="icon-sm">
        <ArrowLeftIcon />
      </Button>
    </Link>
  );

  const sidebar = (
    <div className="flex flex-col gap-4">
      <CategoryField
        serverValue={categoryField.value}
        existingCategories={existingReferenceCategories}
        onChange={categoryField.onChange}
        error={categoryField.error}
      />
    </div>
  );

  return (
    <EntityEditorShell
      label="Reference"
      projectId={projectId}
      entityKind="reference"
      entityUUID={referenceId}
      backNode={backNode}
      entityKey={reference.key}
      content={reference.content}
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

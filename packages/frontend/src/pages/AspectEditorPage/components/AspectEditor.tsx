import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useListAspects } from "@api/generated/aspects/aspects";
import { useListNotes } from "@api/generated/notes/notes";
import { useLiveFieldSave } from "@hooks/useLiveFieldSave";
import { useEntityEditor } from "@lib/entity-kinds/useEntityEditor";
import { Button } from "@components/ui/button";
import { Label } from "@components/ui/label";
import { EntityTag } from "@components/entity-tag";
import { TagCombobox } from "@components/ui/tag-combobox";
import { CategoryField } from "@components/category-field";
import { EntityEditorShell } from "@components/entity-editor-shell";
import { ASPECT_COLOR_PALETTE, resolveAspectColor } from "../../OverviewPage/utils/aspectColors";

const stringSetEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((item) => setA.has(item));
};

type Props = {
  projectId: string;
  aspectId: string;
};

export const AspectEditor = ({ projectId, aspectId }: Props) => {
  const editor = useEntityEditor("aspect", projectId, aspectId);
  const { data: notesEnvelope } = useListNotes(projectId);
  const { data: aspectsListEnvelope } = useListAspects(projectId);
  const [isDirty, setIsDirty] = useState(false);

  const aspect = editor.entity;

  const colorField = useLiveFieldSave({
    serverValue: aspect?.color ?? null,
    save: editor.makeFieldSave<string | null>((value) => ({ color: value })),
  });

  const categoryField = useLiveFieldSave({
    serverValue: aspect?.category ?? null,
    save: editor.makeFieldSave<string | null>((value) => ({ category: value })),
  });

  const notesField = useLiveFieldSave({
    serverValue: aspect?.notes ?? [],
    isEqual: stringSetEqual,
    save: editor.makeFieldSave<string[]>((value) => ({ notes: value })),
  });

  const projectNotes = useMemo(
    () => (notesEnvelope?.status === 200 ? notesEnvelope.data : []),
    [notesEnvelope],
  );

  const availableNotes = useMemo(
    () =>
      projectNotes.filter((note) => !notesField.value.includes(note.key)).map((note) => note.key),
    [projectNotes, notesField.value],
  );

  const existingAspectCategories = useMemo(() => {
    const aspects = aspectsListEnvelope?.status === 200 ? aspectsListEnvelope.data : [];
    return [
      ...new Set(
        aspects
          .map((aspect) => aspect.category)
          .filter((category): category is string => !!category),
      ),
    ];
  }, [aspectsListEnvelope]);

  const resolvedColor = useMemo(
    () => (!aspect ? undefined : resolveAspectColor(aspect.key, colorField.value ?? undefined)),
    [aspect?.key, colorField.value],
  );

  if (editor.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (editor.isError || !aspect)
    return <p className="text-sm text-muted-foreground">Failed to load aspect.</p>;

  const backNode = (
    <Link to="/projects/$projectId/config" params={{ projectId }} search={{ tab: "aspects" }}>
      <Button variant="ghost" size="icon-sm">
        <ArrowLeftIcon />
      </Button>
    </Link>
  );

  const sidebar = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-1.5 items-center">
          {ASPECT_COLOR_PALETTE.map((paletteColor) => {
            const isSelected = colorField.value === paletteColor;
            return (
              <button
                key={paletteColor}
                type="button"
                aria-label={paletteColor}
                aria-pressed={isSelected}
                onClick={() => colorField.onChange(isSelected ? null : paletteColor)}
                className={`w-6 h-6 rounded-full transition-transform ${
                  isSelected ? "ring-2 ring-offset-1 ring-foreground scale-110" : "hover:scale-110"
                }`}
                style={{ backgroundColor: paletteColor }}
              />
            );
          })}
          <div
            className="w-3 h-3 rounded-full ring-1 ring-border ml-1"
            style={{ backgroundColor: resolvedColor }}
            title={colorField.value ? colorField.value : "Fallback color (derived from key)"}
            aria-label="Current resolved color"
          />
        </div>
        {colorField.error && <p className="text-xs text-destructive">{colorField.error}</p>}
      </div>
      <CategoryField
        serverValue={categoryField.value}
        existingCategories={existingAspectCategories}
        onChange={categoryField.onChange}
        error={categoryField.error}
      />
      <div className="flex flex-col gap-2">
        <Label>Notes</Label>
        <div className="flex flex-wrap gap-1">
          {notesField.value.map((noteKey) => (
            <EntityTag
              key={noteKey}
              value={noteKey}
              onRemove={() => notesField.onChange(notesField.value.filter((n) => n !== noteKey))}
            />
          ))}
        </div>
        <TagCombobox
          availableOptions={availableNotes}
          placeholder="Add note — type to filter"
          onSelect={(value) => notesField.onChange([...notesField.value, value])}
        />
        {notesField.error && <p className="text-xs text-destructive">{notesField.error}</p>}
      </div>
    </div>
  );

  return (
    <EntityEditorShell
      label="Aspect"
      projectId={projectId}
      entityKind="aspect"
      entityUUID={aspectId}
      backNode={backNode}
      entityKey={aspect.key}
      content={aspect.description ?? ""}
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

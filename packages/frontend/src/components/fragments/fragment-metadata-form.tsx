import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type {
  Fragment,
  FragmentUpdate,
  IndexedAspect,
} from "../../api/generated/maskorAPI.schemas";
import { useListAspects } from "../../api/generated/aspects/aspects";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import { TagCombobox } from "../ui/tag-combobox";
import { useListNotes } from "../../api/generated/notes/notes";
import { useListReferences } from "../../api/generated/references/references";
import { EntityTag } from "../entity-tag";

const fragmentFormSchema = z.object({
  readyStatus: z.number().min(0).max(100),
  notes: z.array(z.object({ value: z.string() })),
  references: z.array(z.object({ value: z.string() })),
  aspects: z.array(z.object({ key: z.string(), weight: z.number().min(0).max(100) })),
});

type FragmentFormValues = z.infer<typeof fragmentFormSchema>;

const buildDefaultValues = (
  fragment: Fragment,
  projectAspects: IndexedAspect[],
): FragmentFormValues => {
  const attachedAspectKeys = new Set(Object.keys(fragment.aspects));
  return {
    readyStatus: Math.round(fragment.readyStatus * 100),
    notes: fragment.notes.map((value) => ({ value })),
    references: fragment.references.map((value) => ({ value })),
    aspects: projectAspects
      .filter((aspect) => attachedAspectKeys.has(aspect.key))
      .map((aspect) => ({
        key: aspect.key,
        weight: Math.round((fragment.aspects[aspect.key]?.weight ?? 0) * 100),
      })),
  };
};

const buildUpdatePayload = (
  values: FragmentFormValues,
  originalAspects: Fragment["aspects"],
  knownAspectKeys: Set<string>,
): FragmentUpdate => {
  const renderedAspects = Object.fromEntries(
    values.aspects.map(({ key, weight }) => [key, { weight: weight / 100 }]),
  );

  // Preserve orphaned keys — present in the fragment but no longer a known project aspect.
  // Keys that are known but absent from values.aspects were explicitly removed by the user.
  const orphanedAspects = Object.fromEntries(
    Object.entries(originalAspects).filter(([key]) => !knownAspectKeys.has(key)),
  );

  return {
    readyStatus: values.readyStatus / 100,
    notes: values.notes.map(({ value }) => value),
    references: values.references.map(({ value }) => value),
    aspects: { ...orphanedAspects, ...renderedAspects },
  };
};

export type FragmentMetadataFormHandle = {
  getValidatedValues: () => Promise<FragmentUpdate | null>;
};

type Props = {
  fragment: Fragment;
  projectId: string;
  onDirtyChange?: (dirty: boolean) => void;
};

// eslint-disable-next-line react/display-name
export const FragmentMetadataForm = forwardRef<FragmentMetadataFormHandle, Props>(
  ({ fragment, projectId, onDirtyChange }, ref) => {
    const { data: aspectsEnvelope } = useListAspects(projectId);
    const { data: notesEnvelope } = useListNotes(projectId);
    const { data: referencesEnvelope } = useListReferences(projectId);

    const projectAspects = useMemo(
      () => (aspectsEnvelope?.status === 200 ? aspectsEnvelope.data : []),
      [aspectsEnvelope],
    );

    const noteKeyToUuid = useMemo(() => {
      const notes = notesEnvelope?.status === 200 ? notesEnvelope.data : [];
      return new Map(notes.map((note) => [note.key, note.uuid]));
    }, [notesEnvelope]);

    const referenceKeyToUuid = useMemo(() => {
      const references = referencesEnvelope?.status === 200 ? referencesEnvelope.data : [];
      return new Map(references.map((reference) => [reference.key, reference.uuid]));
    }, [referencesEnvelope]);

    const { control, handleSubmit, reset, formState } = useForm<FragmentFormValues>({
      resolver: zodResolver(fragmentFormSchema),
      defaultValues: buildDefaultValues(fragment, projectAspects),
    });

    // Ref so the effect below can read the latest isDirty without re-triggering on dirty-state changes
    const isDirtyRef = useRef(formState.isDirty);
    isDirtyRef.current = formState.isDirty;

    useEffect(() => {
      if (isDirtyRef.current) {
        return;
      }
      reset(buildDefaultValues(fragment, projectAspects));
    }, [fragment, projectAspects, reset]);

    const onDirtyChangeRef = useRef(onDirtyChange);
    onDirtyChangeRef.current = onDirtyChange;
    useEffect(() => {
      onDirtyChangeRef.current?.(formState.isDirty);
    }, [formState.isDirty]);

    const {
      fields: noteFields,
      append: appendNote,
      remove: removeNote,
    } = useFieldArray({ control, name: "notes" });

    const {
      fields: referenceFields,
      append: appendReference,
      remove: removeReference,
    } = useFieldArray({ control, name: "references" });

    const {
      fields: aspectFields,
      append: appendAspect,
      remove: removeAspect,
    } = useFieldArray({ control, name: "aspects" });

    const availableNotes = useMemo(
      () =>
        (notesEnvelope?.status === 200 ? notesEnvelope.data : [])
          .filter((note) => !noteFields.find((existing) => existing.value === note.key))
          .map((note) => note.key),
      [notesEnvelope, noteFields],
    );

    const availableReferences = useMemo(
      () =>
        (referencesEnvelope?.status === 200 ? referencesEnvelope.data : [])
          .filter(
            (reference) => !referenceFields.find((existing) => existing.value === reference.key),
          )
          .map((reference) => reference.key),
      [referencesEnvelope, referenceFields],
    );

    const availableAspects = useMemo(
      () =>
        projectAspects
          .filter((aspect) => !aspectFields.find((existing) => existing.key === aspect.key))
          .map((aspect) => aspect.key),
      [projectAspects, aspectFields],
    );

    useImperativeHandle(
      ref,
      () => ({
        getValidatedValues: () =>
          new Promise<FragmentUpdate | null>((resolve) => {
            handleSubmit(
              (formValues) => {
                reset(formValues);
                const knownAspectKeys = new Set(projectAspects.map((aspect) => aspect.key));
                resolve(buildUpdatePayload(formValues, fragment.aspects, knownAspectKeys));
              },
              () => resolve(null),
            )();
          }),
      }),
      [handleSubmit, reset, fragment.aspects, projectAspects],
    );

    return (
      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Controller
            control={control}
            name="readyStatus"
            render={({ field }) => (
              <>
                <Label>Ready — {field.value}%</Label>
                <Slider
                  value={[field.value]}
                  onValueChange={([value]) => field.onChange(value)}
                  min={0}
                  max={100}
                  step={1}
                />
              </>
            )}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Notes</Label>
          <div className="flex flex-wrap gap-1">
            {noteFields.map((noteField, index) => {
              const noteUuid = noteKeyToUuid.get(noteField.value);
              return (
                <EntityTag
                  key={noteUuid}
                  value={noteField.value}
                  linkArguments={
                    noteUuid
                      ? {
                          to: "/projects/$projectId/notes/$noteId",
                          params: { projectId, noteId: noteUuid },
                          search: { from: fragment.uuid },
                        }
                      : undefined
                  }
                  onRemove={() => removeNote(index)}
                />
              );
            })}
          </div>
          <TagCombobox
            availableOptions={availableNotes}
            placeholder="Add note — type to filter"
            onSelect={(value) => appendNote({ value })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>References</Label>
          <div className="flex flex-wrap gap-1">
            {referenceFields.map((referenceField, index) => {
              const referenceUuid = referenceKeyToUuid.get(referenceField.value);
              return (
                <EntityTag
                  key={referenceUuid}
                  value={referenceField.value}
                  linkArguments={
                    referenceUuid
                      ? {
                          to: "/projects/$projectId/references/$referenceId",
                          params: { projectId, referenceId: referenceUuid },
                          search: { from: fragment.uuid },
                        }
                      : undefined
                  }
                  onRemove={() => removeReference(index)}
                />
              );
            })}
          </div>
          <TagCombobox
            availableOptions={availableReferences}
            placeholder="Add reference — type to filter"
            onSelect={(value) => appendReference({ value })}
          />
        </div>

        <div className="flex flex-col gap-3">
          <Label>Aspects</Label>
          {aspectFields.map((aspectField, index) => (
            <Controller
              key={aspectField.id}
              control={control}
              name={`aspects.${index}.weight`}
              render={({ field }) => (
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-muted-foreground flex justify-between">
                    <span>
                      {aspectField.key} — {field.value ?? 0}%
                    </span>
                    <button
                      onClick={() => removeAspect(index)}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </span>
                  <Slider
                    value={[field.value ?? 0]}
                    onValueChange={([value]) => field.onChange(value)}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>
              )}
            />
          ))}
          <TagCombobox
            availableOptions={availableAspects}
            placeholder="Add aspect — type to filter"
            onSelect={(key) => appendAspect({ key, weight: 0 })}
          />
        </div>
      </form>
    );
  },
);

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
  properties: z.record(z.string(), z.object({ weight: z.number() })),
});

type FragmentFormValues = z.infer<typeof fragmentFormSchema>;

const buildDefaultValues = (fragment: Fragment, aspects: IndexedAspect[]): FragmentFormValues => {
  return {
    readyStatus: Math.round(fragment.readyStatus * 100),
    notes: fragment.notes.map((value) => ({ value })),
    references: fragment.references.map((value) => ({ value })),
    properties: Object.fromEntries(
      aspects.map((aspect) => [
        aspect.key,
        { weight: Math.round((fragment.properties[aspect.key]?.weight ?? 0) * 100) },
      ]),
    ),
  };
};

const buildUpdatePayload = (
  values: FragmentFormValues,
  aspects: IndexedAspect[],
  originalProperties: Fragment["properties"],
): FragmentUpdate => {
  const renderedProperties = Object.fromEntries(
    aspects.map((aspect) => [
      aspect.key,
      { weight: (values.properties[aspect.key]?.weight ?? 0) / 100 },
    ]),
  );

  return {
    readyStatus: values.readyStatus / 100,
    notes: values.notes.map(({ value }) => value),
    references: values.references.map(({ value }) => value),
    // Preserve unknown aspect keys from the original fragment
    properties: { ...originalProperties, ...renderedProperties },
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

    const aspects = useMemo(
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
      defaultValues: buildDefaultValues(fragment, aspects),
    });

    // Ref so the effect below can read the latest isDirty without re-triggering on dirty-state changes
    const isDirtyRef = useRef(formState.isDirty);
    isDirtyRef.current = formState.isDirty;

    useEffect(() => {
      if (isDirtyRef.current) {
        return;
      }
      reset(buildDefaultValues(fragment, aspects));
    }, [fragment, aspects, reset]);

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

    // TODO: use api query for this?
    const availableNotes = useMemo(
      () =>
        (notesEnvelope?.status === 200 ? notesEnvelope.data : [])
          .filter((note) => !noteFields.find((existing) => existing.value === note.key))
          .map((note) => note.key),
      [notesEnvelope, noteFields],
    );

    // TODO: use api query for this?
    const availableReferences = useMemo(
      () =>
        (referencesEnvelope?.status === 200 ? referencesEnvelope.data : [])
          .filter(
            (reference) => !referenceFields.find((existing) => existing.value === reference.key),
          )
          .map((reference) => reference.key),
      [referencesEnvelope, referenceFields],
    );

    useImperativeHandle(
      ref,
      () => ({
        getValidatedValues: () =>
          new Promise<FragmentUpdate | null>((resolve) => {
            handleSubmit(
              (formValues) => {
                reset(formValues);
                resolve(buildUpdatePayload(formValues, aspects, fragment.properties));
              },
              () => resolve(null),
            )();
          }),
      }),
      [handleSubmit, reset, aspects, fragment.properties],
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

        {aspects.length > 0 && (
          <div className="flex flex-col gap-3">
            <Label>Aspects</Label>
            {aspects.map((aspect) => (
              <Controller
                key={aspect.key}
                control={control}
                name={`properties.${aspect.key}.weight`}
                render={({ field }) => (
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground">
                      {aspect.key} — {field.value ?? 0}%
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
          </div>
        )}
      </form>
    );
  },
);

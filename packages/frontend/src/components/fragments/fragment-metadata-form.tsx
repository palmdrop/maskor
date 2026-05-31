import { useMemo, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Fragment, FragmentUpdate } from "@api/generated/maskorAPI.schemas";
import {
  useUpdateFragment,
  getGetFragmentQueryKey,
  getListFragmentsQueryKey,
} from "@api/generated/fragments/fragments";
import {
  useListAspects,
  useCreateAspect,
  getListAspectsQueryKey,
} from "@api/generated/aspects/aspects";
import { useListNotes } from "@api/generated/notes/notes";
import { useListReferences } from "@api/generated/references/references";
import { useInvalidateActionLog } from "@api/action-log";
import { useLiveFieldSave } from "@hooks/useLiveFieldSave";
import { Label } from "@components/ui/label";
import { Slider } from "@components/ui/slider";
import { TagCombobox, type OptionGroup } from "@components/ui/tag-combobox";
import { EntityTag } from "@components/entity-tag";
import { groupByCategory } from "@/utils/group-by-category";
import { useCommandScope } from "../../lib/commands/useCommandScope";
import { fragmentMetadataScope } from "../../lib/commands/scopes/fragment-metadata";
import { useCommands } from "../../lib/commands/useCommands";
import { resolveAspectColor } from "../../pages/OverviewPage/utils/aspectColors";

const stringSetEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((item) => setA.has(item));
};

const aspectsEqual = (
  a: Record<string, { weight: number }>,
  b: Record<string, { weight: number }>,
): boolean => {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!(key in b)) return false;
    if (a[key]!.weight !== b[key]!.weight) return false;
  }
  return true;
};

type Props = {
  fragment: Fragment;
  projectId: string;
};

export const FragmentMetadataForm = ({ fragment, projectId }: Props) => {
  const queryClient = useQueryClient();
  const { mutateAsync: updateFragment } = useUpdateFragment();
  const { mutateAsync: createAspect } = useCreateAspect();
  const [createAspectError, setCreateAspectError] = useState<string | null>(null);
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

  const fragmentQueryKey = useMemo(
    () => getGetFragmentQueryKey(projectId, fragment.uuid),
    [projectId, fragment.uuid],
  );

  const invalidateFragment = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: fragmentQueryKey });
    queryClient.invalidateQueries({ queryKey: getListFragmentsQueryKey(projectId) });
  }, [queryClient, fragmentQueryKey, projectId]);

  const invalidateActionLog = useInvalidateActionLog(projectId);

  const makeSave = useCallback(
    <T,>(
      applyToFragment: (current: Fragment, value: T) => Partial<Fragment>,
      toPatch: (value: T) => FragmentUpdate,
    ) =>
      async (value: T) => {
        type CacheEntry = { data: Fragment; status: number };
        const snapshot = queryClient.getQueryData<CacheEntry>(fragmentQueryKey);
        if (snapshot?.status === 200) {
          queryClient.setQueryData(fragmentQueryKey, {
            ...snapshot,
            data: { ...snapshot.data, ...applyToFragment(snapshot.data as Fragment, value) },
          });
        }
        try {
          const result = await updateFragment({
            projectId,
            fragmentId: fragment.uuid,
            data: toPatch(value),
          });
          if (result.status !== 200) {
            throw new Error((result.data as { message?: string }).message ?? "Save failed.");
          }
          // Replace the optimistic value with the authoritative server response.
          // Avoids invalidating the single-fragment query, which would refetch
          // and overwrite the optimistic write before the user sees it settle.
          if (snapshot !== undefined) {
            queryClient.setQueryData(fragmentQueryKey, {
              ...snapshot,
              data: result.data.fragment,
            });
          }
          queryClient.invalidateQueries({ queryKey: getListFragmentsQueryKey(projectId) });
        } catch (err) {
          if (snapshot !== undefined) {
            queryClient.setQueryData(fragmentQueryKey, snapshot);
          }
          invalidateFragment();
          throw err;
        } finally {
          invalidateActionLog();
        }
      },
    [
      queryClient,
      fragmentQueryKey,
      updateFragment,
      projectId,
      fragment.uuid,
      invalidateFragment,
      invalidateActionLog,
    ],
  );

  const readinessField = useLiveFieldSave({
    serverValue: fragment.readiness,
    save: makeSave(
      (_, value) => ({ readiness: value }),
      (value) => ({ readiness: value }),
    ),
  });

  const notesField = useLiveFieldSave({
    serverValue: fragment.notes,
    isEqual: stringSetEqual,
    save: makeSave(
      (_, value) => ({ notes: value }),
      (value) => ({ notes: value }),
    ),
  });

  const referencesField = useLiveFieldSave({
    serverValue: fragment.references,
    isEqual: stringSetEqual,
    save: makeSave(
      (_, value) => ({ references: value }),
      (value) => ({ references: value }),
    ),
  });

  const knownAspectKeys = useMemo(
    () => new Set(projectAspects.map((a) => a.key)),
    [projectAspects],
  );

  const colorByAspectKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const aspect of projectAspects) {
      map.set(aspect.key, resolveAspectColor(aspect.key, aspect.color));
    }
    return map;
  }, [projectAspects]);

  const normalizedAspects = useMemo<Record<string, { weight: number }>>(
    () =>
      Object.fromEntries(
        Object.entries(fragment.aspects).map(([key, value]) => [
          key,
          { weight: value?.weight ?? 0 },
        ]),
      ),
    [fragment.aspects],
  );

  const aspectsField = useLiveFieldSave({
    serverValue: normalizedAspects,
    isEqual: aspectsEqual,
    save: makeSave(
      (_, value) => ({ aspects: value }),
      (value) => ({ aspects: value }),
    ),
  });

  const liveAspects = useMemo(
    () => Object.entries(aspectsField.value).filter(([key]) => knownAspectKeys.has(key)),
    [aspectsField.value, knownAspectKeys],
  );

  const orphanedAspects = useMemo(
    () => Object.entries(aspectsField.value).filter(([key]) => !knownAspectKeys.has(key)),
    [aspectsField.value, knownAspectKeys],
  );

  const availableNoteGroups = useMemo((): OptionGroup[] => {
    const notes = (notesEnvelope?.status === 200 ? notesEnvelope.data : []).filter(
      (note) => !notesField.value.includes(note.key),
    );
    return groupByCategory(notes, (n) => n.category).map(({ category, items }) => ({
      label: category,
      options: items.map((n) => n.key),
    }));
  }, [notesEnvelope, notesField.value]);

  const availableReferenceGroups = useMemo((): OptionGroup[] => {
    const references = (referencesEnvelope?.status === 200 ? referencesEnvelope.data : []).filter(
      (reference) => !referencesField.value.includes(reference.key),
    );
    return groupByCategory(references, (r) => r.category).map(({ category, items }) => ({
      label: category,
      options: items.map((r) => r.key),
    }));
  }, [referencesEnvelope, referencesField.value]);

  const availableAspectGroups = useMemo((): OptionGroup[] => {
    const aspects = projectAspects.filter((aspect) => !(aspect.key in aspectsField.value));
    return groupByCategory(aspects, (a) => a.category).map(({ category, items }) => ({
      label: category,
      options: items.map((a) => a.key),
    }));
  }, [projectAspects, aspectsField.value]);

  const changeAspectWeight = useCallback(
    (aspectKey: string, displayWeight: number) => {
      aspectsField.onChange({
        ...aspectsField.value,
        [aspectKey]: { weight: displayWeight / 100 },
      });
    },
    [aspectsField],
  );

  const attachAspect = useCallback(
    (aspectKey: string) => {
      aspectsField.onChange({ ...aspectsField.value, [aspectKey]: { weight: 0 } });
    },
    [aspectsField],
  );

  // TODO: add command palette command for this
  const createAndAttachAspect = useCallback(
    async (aspectKey: string) => {
      setCreateAspectError(null);
      try {
        const result = await createAspect({ projectId, data: { key: aspectKey } });
        if (result.status !== 201) {
          const message = (result.data as { message?: string }).message;
          throw new Error(message ?? "Failed to create aspect.");
        }
        await queryClient.invalidateQueries({ queryKey: getListAspectsQueryKey(projectId) });
        attachAspect(aspectKey);
      } catch (error) {
        const message = (error as { message?: string })?.message ?? "Failed to create aspect.";
        setCreateAspectError(message);
        throw error;
      }
    },
    [createAspect, projectId, queryClient, attachAspect],
  );

  const commands = useCommands();
  useCommandScope(fragmentMetadataScope, {
    attachEntity: (kind, key) => {
      switch (kind) {
        case "note":
          return notesField.onChange([...notesField.value, key]);
        case "reference":
          return referencesField.onChange([...referencesField.value, key]);
        case "aspect":
        default:
          return attachAspect(key);
      }
    },
    detachEntity: (kind, key) => {
      switch (kind) {
        case "note":
          return notesField.onChange(notesField.value.filter((n) => n !== key));
        case "reference":
          return referencesField.onChange(referencesField.value.filter((r) => r !== key));
        case "aspect":
        default: {
          const next = { ...aspectsField.value };
          delete next[key];
          aspectsField.onChange(next);
          return;
        }
      }
    },
    getAvailableEntities: (kind) => {
      switch (kind) {
        case "note":
          return availableNoteGroups.flatMap((g) => g.options);
        case "reference":
          return availableReferenceGroups.flatMap((g) => g.options);
        case "aspect":
        default:
          return availableAspectGroups.flatMap((g) => g.options);
      }
    },
    getAttachedEntities: (kind) => {
      switch (kind) {
        case "note":
          return notesField.value;
        case "reference":
          return referencesField.value;
        case "aspect":
        default:
          return Object.keys(aspectsField.value);
      }
    },
  });

  return (
    <form className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Ready — {Math.round(readinessField.value * 100)}%</Label>
        <Slider
          value={[Math.round(readinessField.value * 100)]}
          onValueChange={([value]) => readinessField.onChange(value / 100)}
          min={0}
          max={100}
          step={1}
        />
        {readinessField.error && <p className="text-xs text-destructive">{readinessField.error}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Notes</Label>
        <div className="flex flex-wrap gap-1">
          {notesField.value.map((noteKey) => {
            const noteUuid = noteKeyToUuid.get(noteKey);
            return (
              <EntityTag
                key={noteKey}
                value={noteKey}
                linkArguments={
                  noteUuid
                    ? {
                        to: "/projects/$projectId/notes/$noteId",
                        params: { projectId, noteId: noteUuid },
                        search: { from: fragment.uuid },
                      }
                    : undefined
                }
                onRemove={() => commands.run("fragment-metadata:detach-note", noteKey)}
              />
            );
          })}
        </div>
        <TagCombobox
          groups={availableNoteGroups}
          placeholder="Add note — type to filter"
          onSelect={(value) => commands.run("fragment-metadata:attach-note", value)}
        />
        {notesField.error && <p className="text-xs text-destructive">{notesField.error}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label>References</Label>
        <div className="flex flex-wrap gap-1">
          {referencesField.value.map((referenceKey) => {
            const referenceUuid = referenceKeyToUuid.get(referenceKey);
            return (
              <EntityTag
                key={referenceKey}
                value={referenceKey}
                linkArguments={
                  referenceUuid
                    ? {
                        to: "/projects/$projectId/references/$referenceId",
                        params: { projectId, referenceId: referenceUuid },
                        search: { from: fragment.uuid },
                      }
                    : undefined
                }
                onRemove={() => commands.run("fragment-metadata:detach-reference", referenceKey)}
              />
            );
          })}
        </div>
        <TagCombobox
          groups={availableReferenceGroups}
          placeholder="Add reference — type to filter"
          onSelect={(value) => commands.run("fragment-metadata:attach-reference", value)}
        />
        {referencesField.error && (
          <p className="text-xs text-destructive">{referencesField.error}</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Label>Aspects</Label>
        {liveAspects.map(([aspectKey, { weight }]) => (
          <div key={aspectKey} className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground flex justify-between">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: colorByAspectKey.get(aspectKey) }}
                  aria-hidden="true"
                />
                {aspectKey} — {Math.round(weight * 100)}%
              </span>
              <button
                type="button"
                onClick={() => commands.run("fragment-metadata:detach-aspect", aspectKey)}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </span>
            <Slider
              value={[Math.round(weight * 100)]}
              onValueChange={([value]) => changeAspectWeight(aspectKey, value)}
              min={0}
              max={100}
              step={1}
            />
          </div>
        ))}
        {orphanedAspects.map(([aspectKey, { weight }]) => (
          <div key={aspectKey} className="flex flex-col gap-1 opacity-50">
            <span className="text-sm text-muted-foreground flex justify-between">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0 border border-muted-foreground/50"
                  aria-hidden="true"
                />
                {aspectKey} — {Math.round(weight * 100)}%
                <span className="text-xs bg-muted px-1 rounded" aria-label="orphaned aspect">
                  orphaned
                </span>
              </span>
              <button
                type="button"
                onClick={() => commands.run("fragment-metadata:detach-aspect", aspectKey)}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </span>
            <Slider
              value={[Math.round(weight * 100)]}
              onValueChange={([value]) => changeAspectWeight(aspectKey, value)}
              min={0}
              max={100}
              step={1}
            />
          </div>
        ))}
        <TagCombobox
          groups={availableAspectGroups}
          placeholder="Add aspect — type to filter or create"
          onSelect={(value) => {
            setCreateAspectError(null);
            commands.run("fragment-metadata:attach-aspect", value);
          }}
          onCreate={createAndAttachAspect}
        />
        {aspectsField.error && <p className="text-xs text-destructive">{aspectsField.error}</p>}
        {createAspectError && <p className="text-xs text-destructive">{createAspectError}</p>}
      </div>
    </form>
  );
};

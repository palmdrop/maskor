import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAspect,
  useUpdateAspect,
  getGetAspectQueryKey,
  getListAspectsQueryKey,
} from "../../../api/generated/aspects/aspects";
import { useListNotes } from "../../../api/generated/notes/notes";
import { useInvalidateActionLog } from "../../../api/action-log";
import { useLiveFieldSave } from "../../../hooks/useLiveFieldSave";
import type { Aspect, AspectUpdate } from "../../../api/generated/maskorAPI.schemas";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { EntityTag } from "../../../components/entity-tag";
import { TagCombobox } from "../../../components/ui/tag-combobox";
import { EntityEditorShell } from "../../../components/entity-editor-shell";

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
  const queryClient = useQueryClient();
  const { data: envelope, isLoading, isError } = useGetAspect(projectId, aspectId);
  // Separate mutation instances so live metadata saves don't toggle the
  // content Save button's isPending state (and silently block Cmd+S).
  const { mutateAsync: updateAspect, isPending } = useUpdateAspect();
  const { mutateAsync: updateAspectMetadata } = useUpdateAspect();
  const { data: notesEnvelope } = useListNotes(projectId);
  const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const aspect = envelope?.status === 200 ? envelope.data : null;

  const aspectQueryKey = useMemo(
    () => getGetAspectQueryKey(projectId, aspectId),
    [projectId, aspectId],
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: aspectQueryKey });
    queryClient.invalidateQueries({ queryKey: getListAspectsQueryKey(projectId) });
  }, [queryClient, aspectQueryKey, projectId]);

  const invalidateActionLog = useInvalidateActionLog(projectId);

  const makeSave = useCallback(
    <T,>(toPatch: (value: T) => AspectUpdate) =>
      async (value: T) => {
        type CacheEntry = { data: Aspect; status: number };
        const snapshot = queryClient.getQueryData<CacheEntry>(aspectQueryKey);
        if (snapshot?.status === 200) {
          queryClient.setQueryData(aspectQueryKey, {
            ...snapshot,
            data: { ...snapshot.data, ...toPatch(value) },
          });
        }
        try {
          const result = await updateAspectMetadata({
            projectId,
            aspectId,
            data: toPatch(value),
          });
          if (result.status !== 200) {
            throw new Error((result.data as { message?: string }).message ?? "Save failed.");
          }
          if (snapshot !== undefined) {
            queryClient.setQueryData(aspectQueryKey, {
              ...snapshot,
              data: result.data.aspect,
            });
          }
          queryClient.invalidateQueries({ queryKey: getListAspectsQueryKey(projectId) });
        } catch (err) {
          if (snapshot !== undefined) {
            queryClient.setQueryData(aspectQueryKey, snapshot);
          }
          invalidate();
          throw err;
        } finally {
          invalidateActionLog();
        }
      },
    [
      queryClient,
      aspectQueryKey,
      updateAspectMetadata,
      projectId,
      aspectId,
      invalidate,
      invalidateActionLog,
    ],
  );

  const onKeySave = useCallback(
    async (key: string) => {
      const result = await updateAspect({ projectId, aspectId, data: { key } });
      if (result.status !== 200) {
        throw new Error((result.data as { message?: string }).message ?? "Rename failed.");
      }
      setCascadeWarnings(result.data.warnings);
      invalidate();
      invalidateActionLog();
    },
    [updateAspect, projectId, aspectId, invalidate, invalidateActionLog],
  );

  const onContentSave = useCallback(
    async (content: string) => {
      const result = await updateAspect({ projectId, aspectId, data: { description: content } });
      if (result.status !== 200) {
        throw new Error((result.data as { message?: string }).message ?? "Save failed.");
      }
      invalidate();
      invalidateActionLog();
    },
    [updateAspect, projectId, aspectId, invalidate, invalidateActionLog],
  );

  const categoryField = useLiveFieldSave({
    serverValue: aspect?.category ?? "",
    save: makeSave<string>((value) => ({ category: value })),
  });

  const notesField = useLiveFieldSave({
    serverValue: aspect?.notes ?? [],
    isEqual: stringSetEqual,
    save: makeSave<string[]>((value) => ({ notes: value })),
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

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !aspect)
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
        <Label>Category</Label>
        <Input
          value={categoryField.value}
          onChange={(event) => categoryField.onChange(event.target.value)}
          placeholder="Enter category"
        />
        {categoryField.error && <p className="text-xs text-destructive">{categoryField.error}</p>}
      </div>
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
      backNode={backNode}
      entityKey={aspect.key}
      content={aspect.description ?? ""}
      isPending={isPending}
      isDirty={isDirty}
      cascadeWarnings={cascadeWarnings}
      onDismissWarnings={() => setCascadeWarnings([])}
      onProseChange={() => setIsDirty(true)}
      onSaved={() => setIsDirty(false)}
      onKeySave={onKeySave}
      onContentSave={onContentSave}
      sidebar={sidebar}
    />
  );
};

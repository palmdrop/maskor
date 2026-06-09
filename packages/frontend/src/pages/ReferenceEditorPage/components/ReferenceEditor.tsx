import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  useUpdateReference,
  useListReferences,
  getGetReferenceQueryKey,
  getGetReferenceSuspenseQueryOptions,
  getListReferencesQueryKey,
} from "@api/generated/references/references";
import { useInvalidateActionLog } from "@api/action-log";
import { useLiveFieldSave } from "@hooks/useLiveFieldSave";
import type { Reference, ReferenceUpdate } from "@api/generated/maskorAPI.schemas";
import { Button } from "@components/ui/button";
import { CategoryField } from "@components/category-field";
import { EntityEditorShell } from "@components/entity-editor-shell";

type Props = {
  projectId: string;
  referenceId: string;
  fragmentId?: string;
};

export const ReferenceEditor = ({ projectId, referenceId, fragmentId }: Props) => {
  const queryClient = useQueryClient();
  const { data: envelope } = useSuspenseQuery(
    getGetReferenceSuspenseQueryOptions(projectId, referenceId),
  );
  const { mutateAsync: updateReference, isPending } = useUpdateReference();
  const { mutateAsync: updateReferenceMetadata } = useUpdateReference();
  const { data: referencesListEnvelope } = useListReferences(projectId);
  const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const reference = envelope.status === 200 ? envelope.data : null;

  const referenceQueryKey = useMemo(
    () => getGetReferenceQueryKey(projectId, referenceId),
    [projectId, referenceId],
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: referenceQueryKey });
    queryClient.invalidateQueries({ queryKey: getListReferencesQueryKey(projectId) });
  }, [queryClient, referenceQueryKey, projectId]);

  const invalidateActionLog = useInvalidateActionLog(projectId);

  const makeSave = useCallback(
    <T,>(toPatch: (value: T) => ReferenceUpdate) =>
      async (value: T) => {
        type CacheEntry = { data: Reference; status: number };
        const snapshot = queryClient.getQueryData<CacheEntry>(referenceQueryKey);
        if (snapshot?.status === 200) {
          queryClient.setQueryData(referenceQueryKey, {
            ...snapshot,
            data: { ...snapshot.data, ...toPatch(value) },
          });
        }
        try {
          const result = await updateReferenceMetadata({
            projectId,
            referenceId,
            data: toPatch(value),
          });
          if (result.status !== 200) {
            throw new Error((result.data as { message?: string }).message ?? "Save failed.");
          }
          if (snapshot !== undefined) {
            queryClient.setQueryData(referenceQueryKey, {
              ...snapshot,
              data: result.data.reference,
            });
          }
          queryClient.invalidateQueries({ queryKey: getListReferencesQueryKey(projectId) });
        } catch (error) {
          if (snapshot !== undefined) {
            queryClient.setQueryData(referenceQueryKey, snapshot);
          }
          invalidate();
          throw error;
        } finally {
          invalidateActionLog();
        }
      },
    [
      queryClient,
      referenceQueryKey,
      updateReferenceMetadata,
      projectId,
      referenceId,
      invalidate,
      invalidateActionLog,
    ],
  );

  const categoryField = useLiveFieldSave({
    serverValue: reference?.category ?? null,
    save: makeSave<string | null>((value) => ({ category: value })),
  });

  const existingReferenceCategories = useMemo(() => {
    const references = referencesListEnvelope?.status === 200 ? referencesListEnvelope.data : [];
    return [...new Set(references.map((r) => r.category).filter((c): c is string => !!c))];
  }, [referencesListEnvelope]);

  const onKeySave = useCallback(
    async (key: string) => {
      const result = await updateReference({ projectId, referenceId, data: { key } });
      if (result.status !== 200) {
        throw new Error((result.data as { message?: string }).message ?? "Rename failed.");
      }
      const { warnings } = result.data;
      setCascadeWarnings(warnings.fragments);
      invalidate();
      invalidateActionLog();
    },
    [updateReference, projectId, referenceId, invalidate, invalidateActionLog],
  );

  const onContentSave = useCallback(
    async (content: string) => {
      const result = await updateReference({ projectId, referenceId, data: { content } });
      if (result.status !== 200) {
        throw new Error((result.data as { message?: string }).message ?? "Save failed.");
      }
      invalidate();
      invalidateActionLog();
    },
    [updateReference, projectId, referenceId, invalidate, invalidateActionLog],
  );

  // Non-200 throws under suspense (caught by the boundary); this narrows reference.
  if (!reference) return null;

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

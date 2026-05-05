import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAspect,
  useUpdateAspect,
  getGetAspectQueryKey,
  getListAspectsQueryKey,
} from "../../../api/generated/aspects/aspects";
import { Button } from "../../../components/ui/button";
import { EntityEditorShell } from "../../../components/entity-editor-shell";

type Props = {
  projectId: string;
  aspectId: string;
};

export const AspectEditor = ({ projectId, aspectId }: Props) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading, isError } = useGetAspect(projectId, aspectId);
  const { mutateAsync: updateAspect, isPending } = useUpdateAspect();
  const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const aspect = envelope?.status === 200 ? envelope.data : null;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetAspectQueryKey(projectId, aspectId) });
    queryClient.invalidateQueries({ queryKey: getListAspectsQueryKey(projectId) });
  }, [queryClient, projectId, aspectId]);

  const onKeySave = useCallback(
    async (key: string) => {
      const result = await updateAspect({ projectId, aspectId, data: { key } });
      if (result.status !== 200) {
        throw new Error((result.data as { message?: string }).message ?? "Rename failed.");
      }
      setCascadeWarnings(result.data.warnings);
      invalidate();
    },
    [updateAspect, projectId, aspectId, invalidate],
  );

  const onContentSave = useCallback(
    async (content: string) => {
      const result = await updateAspect({ projectId, aspectId, data: { description: content } });
      if (result.status !== 200) {
        throw new Error((result.data as { message?: string }).message ?? "Save failed.");
      }
      invalidate();
    },
    [updateAspect, projectId, aspectId, invalidate],
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
    />
  );
};

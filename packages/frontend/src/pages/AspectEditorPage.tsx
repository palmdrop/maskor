import { useCallback, useRef, useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import {
  useGetAspect,
  useUpdateAspect,
  getGetAspectQueryKey,
  getListAspectsQueryKey,
} from "../api/generated/aspects/aspects";
import { ProseEditor, type ProseEditorHandle } from "../components/fragments/prose-editor";
import { Heading } from "../components/heading";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { useDelayedPending } from "../hooks/useDelayedPending";

type Props = {
  projectId: string;
  aspectId: string;
};

const AspectEditor = ({ projectId, aspectId }: Props) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading, isError } = useGetAspect(projectId, aspectId);
  const { mutate: updateAspect, isPending: isUpdatePending } = useUpdateAspect();

  const proseEditorRef = useRef<ProseEditorHandle>(null);
  const [isDirty, setIsDirty] = useState(false);
  const showSaving = useDelayedPending(isUpdatePending);

  const aspect = envelope?.status === 200 ? envelope.data : null;

  const handleSave = useCallback(() => {
    if (!aspect || !isDirty) return;
    const description = proseEditorRef.current?.getContent() ?? aspect.description ?? "";
    updateAspect(
      { projectId, aspectId, data: { description } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAspectQueryKey(projectId, aspectId) });
          queryClient.invalidateQueries({ queryKey: getListAspectsQueryKey(projectId) });
          setIsDirty(false);
        },
      },
    );
  }, [aspect, isDirty, projectId, aspectId, updateAspect, queryClient]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !aspect)
    return <p className="text-sm text-muted-foreground">Failed to load aspect.</p>;

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/projects/$projectId/config" params={{ projectId }} search={{ tab: "aspects" }}>
            <Button variant="ghost" size="icon-sm">
              <ArrowLeftIcon />
            </Button>
          </Link>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Aspect</span>
            <Heading level={1}>{aspect.key}</Heading>
          </div>
        </div>
        <Button
          size="sm"
          disabled={isUpdatePending || !isDirty}
          onClick={handleSave}
          className="min-w-20"
        >
          {showSaving ? "Saving…" : "Save"}
        </Button>
      </div>
      <Separator />
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* TODO: wire vimMode to a real settings/config system */}
        <ProseEditor
          ref={proseEditorRef}
          content={aspect.description ?? ""}
          vimMode={false}
          onSave={handleSave}
          onChange={() => setIsDirty(true)}
        />
      </div>
    </div>
  );
};

export const AspectEditorPage = () => {
  const { projectId, aspectId } = useParams({ from: "/projects/$projectId/aspects/$aspectId" });
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden p-6">
      <AspectEditor projectId={projectId} aspectId={aspectId} />
    </div>
  );
};

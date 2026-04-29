import { useCallback, useRef, useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import {
  useGetReference,
  useUpdateReference,
  getGetReferenceQueryKey,
  getListReferencesQueryKey,
} from "../api/generated/references/references";
import { ProseEditor, type ProseEditorHandle } from "../components/fragments/prose-editor";
import { Heading } from "../components/heading";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { useDelayedPending } from "../hooks/useDelayedPending";

type Props = {
  projectId: string;
  referenceId: string;
};

const ReferenceEditor = ({ projectId, referenceId }: Props) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading, isError } = useGetReference(projectId, referenceId);
  const { mutate: updateReference, isPending: isUpdatePending } = useUpdateReference();

  const proseEditorRef = useRef<ProseEditorHandle>(null);
  const [isDirty, setIsDirty] = useState(false);
  const showSaving = useDelayedPending(isUpdatePending);

  const reference = envelope?.status === 200 ? envelope.data : null;

  const handleSave = useCallback(() => {
    if (!reference || !isDirty) return;
    const content = proseEditorRef.current?.getContent() ?? reference.content;
    updateReference(
      { projectId, referenceId, data: { content } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetReferenceQueryKey(projectId, referenceId),
          });
          queryClient.invalidateQueries({ queryKey: getListReferencesQueryKey(projectId) });
          setIsDirty(false);
        },
      },
    );
  }, [reference, isDirty, projectId, referenceId, updateReference, queryClient]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !reference)
    return <p className="text-sm text-muted-foreground">Failed to load reference.</p>;

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/projects/$projectId/config"
            params={{ projectId }}
            search={{ tab: "references" }}
          >
            <Button variant="ghost" size="icon-sm">
              <ArrowLeftIcon />
            </Button>
          </Link>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Reference</span>
            <Heading level={1}>{reference.name}</Heading>
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
          content={reference.content}
          vimMode={false}
          onSave={handleSave}
          onChange={() => setIsDirty(true)}
        />
      </div>
    </div>
  );
};

export const ReferenceEditorPage = () => {
  const { projectId, referenceId } = useParams({
    from: "/projects/$projectId/references/$referenceId",
  });
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden p-6">
      <ReferenceEditor projectId={projectId} referenceId={referenceId} />
    </div>
  );
};

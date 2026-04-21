import { useCallback, useRef } from "react";
import { useDelayedPending } from "../../hooks/useDelayedPending";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetFragment,
  useUpdateFragment,
  useDiscardFragment,
  useRestoreFragment,
  getGetFragmentQueryKey,
  getListFragmentsQueryKey,
} from "../../api/generated/fragments/fragments";
import { ProseEditor, type ProseEditorHandle } from "./prose-editor";
import { FragmentMetadataForm, type FragmentMetadataFormHandle } from "./fragment-metadata-form";
import { Heading } from "../heading";
import { Separator } from "../ui/separator";
import { Button } from "../ui/button";

type Props = {
  projectId: string;
  fragmentId: string;
};

export function FragmentEditor({ projectId, fragmentId }: Props) {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading, isError } = useGetFragment(projectId, fragmentId);
  const { mutate: updateFragment, isPending: isUpdatePending } = useUpdateFragment();
  const { mutate: discardFragment, isPending: isDiscardPending } = useDiscardFragment();
  const { mutate: restoreFragment, isPending: isRestorePending } = useRestoreFragment();

  const proseEditorRef = useRef<ProseEditorHandle>(null);
  const metadataFormRef = useRef<FragmentMetadataFormHandle>(null);

  const fragment = envelope?.status === 200 ? envelope.data : null;

  const isActionPending = isUpdatePending || isDiscardPending || isRestorePending;
  const showSaving = useDelayedPending(isUpdatePending);

  const invalidateFragment = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: getGetFragmentQueryKey(projectId, fragmentId),
    });
    queryClient.invalidateQueries({
      queryKey: getListFragmentsQueryKey(projectId),
    });
  }, [queryClient, projectId, fragmentId]);

  const handleSave = useCallback(async () => {
    if (!fragment) {
      return;
    }

    const metadataUpdate = await metadataFormRef.current?.getValidatedValues();
    if (!metadataUpdate) {
      return;
    }

    const content = proseEditorRef.current?.getContent() ?? fragment.content;

    updateFragment(
      { projectId, fragmentId, data: { ...metadataUpdate, content } },
      { onSuccess: invalidateFragment },
    );
  }, [fragment, projectId, fragmentId, updateFragment, invalidateFragment]);

  const handleDiscard = useCallback(() => {
    discardFragment({ projectId, fragmentId }, { onSuccess: invalidateFragment });
  }, [projectId, fragmentId, discardFragment, invalidateFragment]);

  const handleRestore = useCallback(() => {
    restoreFragment({ projectId, fragmentId }, { onSuccess: invalidateFragment });
  }, [projectId, fragmentId, restoreFragment, invalidateFragment]);

  if (isLoading) {
    return <p>Loading fragment…</p>;
  }

  if (isError || !fragment) {
    return <p>Failed to load fragment.</p>;
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {fragment.isDiscarded && (
        <div className="rounded border border-muted bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
          This fragment is discarded.
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <Heading level={1}>{fragment.title}</Heading>
        <div className="flex items-center gap-2">
          {fragment.isDiscarded ? (
            <Button size="sm" variant="outline" disabled={isActionPending} onClick={handleRestore}>
              {isRestorePending ? "Restoring…" : "Restore"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={isActionPending} onClick={handleDiscard}>
              {isDiscardPending ? "Discarding…" : "Discard"}
            </Button>
          )}
          <Button size="sm" disabled={isActionPending} onClick={handleSave} className="min-w-20">
            {showSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      <Separator />
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0 border border-border">
        <aside className="lg:w-72 shrink-0 overflow-y-auto p-4">
          <FragmentMetadataForm ref={metadataFormRef} fragment={fragment} projectId={projectId} />
        </aside>
        <main className="flex-1 min-h-0">
          {/* TODO: wire vimMode to a real settings/config system */}
          <ProseEditor
            ref={proseEditorRef}
            content={fragment.content}
            vimMode={false}
            onSave={handleSave}
          />
        </main>
      </div>
    </div>
  );
}

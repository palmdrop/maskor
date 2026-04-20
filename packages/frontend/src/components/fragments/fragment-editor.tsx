import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetFragment,
  useUpdateFragment,
  getGetFragmentQueryKey,
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
  const { mutate: updateFragment, isPending } = useUpdateFragment();

  const proseEditorRef = useRef<ProseEditorHandle>(null);
  const metadataFormRef = useRef<FragmentMetadataFormHandle>(null);

  const fragment = envelope?.status === 200 ? envelope.data : null;

  const invalidateFragment = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: getGetFragmentQueryKey(projectId, fragmentId),
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

  if (isLoading) {
    return <p>Loading fragment…</p>;
  }

  if (isError || !fragment) {
    return <p>Failed to load fragment.</p>;
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between gap-4">
        <Heading level={1}>{fragment.title}</Heading>
        <Button size="sm" disabled={isPending} onClick={handleSave}>
          {isPending ? "Saving…" : "Save"}
        </Button>
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

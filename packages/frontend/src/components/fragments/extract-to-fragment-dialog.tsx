import { useMemo, useCallback } from "react";
import { useListFragments, useExtractFragment } from "@api/generated/fragments/fragments";
import { ExtractToEntityDialogCore } from "@components/extract-to-entity-dialog-core";

type Props = {
  open: boolean;
  projectId: string;
  sourceFragmentUuid: string;
  selectionText: string;
  onClose: () => void;
  onSuccess: (newFragmentUuid: string) => void;
};

export const ExtractToFragmentDialog = ({
  open,
  projectId,
  sourceFragmentUuid,
  selectionText,
  onClose,
  onSuccess,
}: Props) => {
  const { data: fragmentsEnvelope } = useListFragments(projectId);
  const { mutateAsync: extractFragment, isPending } = useExtractFragment();

  const fragments = useMemo(
    () => (fragmentsEnvelope?.status === 200 ? fragmentsEnvelope.data : []),
    [fragmentsEnvelope],
  );

  const { allKeys, discardedKeys } = useMemo(() => {
    const all = new Set<string>();
    const discarded = new Set<string>();
    for (const fragment of fragments) {
      all.add(fragment.key);
      if (fragment.isDiscarded) discarded.add(fragment.key);
    }
    return { allKeys: all, discardedKeys: discarded };
  }, [fragments]);

  const handleConfirm = useCallback(
    async (key: string): Promise<string | null> => {
      try {
        const result = await extractFragment({
          projectId,
          data: {
            key,
            content: selectionText,
            sourceUuid: sourceFragmentUuid,
            sourceType: "fragment",
            sourceMode: "keep",
            navigated: true,
          },
        });
        if (result.status === 201) {
          onSuccess(result.data.uuid);
          return null;
        }
        return (result.data as { message?: string }).message ?? "Extraction failed. Try again.";
      } catch {
        return "Extraction failed. Try again.";
      }
    },
    [extractFragment, projectId, selectionText, sourceFragmentUuid, onSuccess],
  );

  return (
    <ExtractToEntityDialogCore
      open={open}
      title="Extract to fragment"
      selectionText={selectionText}
      preFillPrefix="unnamed-fragment"
      allKeys={allKeys}
      discardedKeys={discardedKeys}
      targetType="fragment"
      isPending={isPending}
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
};

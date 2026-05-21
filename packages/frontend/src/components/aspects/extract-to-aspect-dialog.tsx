import { useMemo, useCallback } from "react";
import { useListAspects, useExtractAspect } from "@api/generated/aspects/aspects";
import { ExtractToEntityDialogCore } from "@components/extract-to-entity-dialog-core";

type Props = {
  open: boolean;
  projectId: string;
  sourceUuid: string;
  sourceType: "fragment" | "note" | "reference" | "aspect";
  selectionText: string;
  onClose: () => void;
  onSuccess: (newAspectUuid: string) => void;
};

export const ExtractToAspectDialog = ({
  open,
  projectId,
  sourceUuid,
  sourceType,
  selectionText,
  onClose,
  onSuccess,
}: Props) => {
  const { data: aspectsEnvelope } = useListAspects(projectId);
  const { mutateAsync: extractAspect, isPending } = useExtractAspect();

  const aspects = useMemo(
    () => (aspectsEnvelope?.status === 200 ? aspectsEnvelope.data : []),
    [aspectsEnvelope],
  );

  const allKeys = useMemo(() => {
    const all = new Set<string>();
    for (const aspect of aspects) all.add(aspect.key);
    return all;
  }, [aspects]);

  const handleConfirm = useCallback(
    async (key: string): Promise<string | null> => {
      try {
        const result = await extractAspect({
          projectId,
          data: {
            key,
            description: selectionText,
            sourceUuid,
            sourceType,
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
    [extractAspect, projectId, selectionText, sourceUuid, sourceType, onSuccess],
  );

  return (
    <ExtractToEntityDialogCore
      open={open}
      title="Extract to aspect"
      selectionText={selectionText}
      preFillPrefix="unnamed-aspect"
      allKeys={allKeys}
      discardedKeys={new Set()}
      targetType="aspect"
      isPending={isPending}
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
};

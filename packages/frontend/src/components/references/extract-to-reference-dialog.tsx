import { useMemo, useCallback } from "react";
import { useListReferences, useExtractReference } from "@api/generated/references/references";
import { ExtractToEntityDialogCore } from "@components/extract-to-entity-dialog-core";
import { validateExtractKey } from "@components/extract-utils";

type Props = {
  open: boolean;
  projectId: string;
  sourceUuid: string;
  sourceType: "fragment" | "note" | "reference" | "aspect";
  selectionText: string;
  onClose: () => void;
  onSuccess: (newReferenceUuid: string) => void;
};

export const ExtractToReferenceDialog = ({
  open,
  projectId,
  sourceUuid,
  sourceType,
  selectionText,
  onClose,
  onSuccess,
}: Props) => {
  const { data: referencesEnvelope } = useListReferences(projectId);
  const { mutateAsync: extractReference, isPending } = useExtractReference();

  const references = useMemo(
    () => (referencesEnvelope?.status === 200 ? referencesEnvelope.data : []),
    [referencesEnvelope],
  );

  const allKeys = useMemo(() => {
    const all = new Set<string>();
    for (const reference of references) all.add(reference.key);
    return all;
  }, [references]);

  const validateKey = useCallback(
    (key: string): string | null => validateExtractKey(key, allKeys, "reference"),
    [allKeys],
  );

  const handleConfirm = useCallback(
    async (key: string): Promise<string | null> => {
      try {
        const result = await extractReference({
          projectId,
          data: {
            key,
            content: selectionText,
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
    [extractReference, projectId, selectionText, sourceUuid, sourceType, onSuccess],
  );

  return (
    <ExtractToEntityDialogCore
      open={open}
      title="Extract to reference"
      selectionText={selectionText}
      preFillPrefix="unnamed-reference"
      allKeys={allKeys}
      validateKey={validateKey}
      isPending={isPending}
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
};
